// nexire-app — app/api/reveal/email/route.ts
// POST /api/reveal/email
// Reveals email for a candidate using Prospeo email-finder.
//
// Economics:
//   - Cost: 1 Nexire credit
//   - Re-reveal: FREE (0 credits) — returns cached result from reveals table
//   - Never call Prospeo if we already have this (org_id, person_id, type=email)
//
// Flow:
//   Auth → Profile → Cache check → Credit check → Prospeo call →
//   Save reveal → Deduct credit → Write ledger → Respond

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkCredits, deductCredits } from "@/lib/credits/engine";
import { prospeoRevealEmail } from "@/lib/prospeo/client";

const RevealEmailSchema = z.object({
  person_id: z.string().min(1, "person_id is required"),
  linkedin_url: z.string().url("Valid LinkedIn URL required"),
  candidate_id: z.string().uuid().optional(),
  full_name: z.string().optional(),
});

function getAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() { },
        remove() { },
      },
    }
  );
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = getAuthClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Profile + Org ───────────────────────────────────────────────────────
  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id, member_role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // ── 3. Validate request ───────────────────────────────────────────────────
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = RevealEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const { person_id, linkedin_url, candidate_id, full_name } = parsed.data;

  // ── 4. Cache check (free re-reveal) ──────────────────────────────────────
  // CRITICAL: Check reveals table FIRST — never call Prospeo if we have the data
  const { data: existing } = await admin
    .from("reveals")
    .select("id, email, status")
    .eq("org_id", profile.org_id)
    .eq("person_id", person_id)
    .eq("type", "email")
    .maybeSingle();

  if (existing?.email) {
    // Free re-reveal — no credit charge, return cached
    return NextResponse.json({
      email: existing.email,
      status: existing.status,
      credits_charged: 0,
      fromCache: true,
    });
  }

  // ── 5. Credit check ───────────────────────────────────────────────────────
  const creditCheck = await checkCredits(profile.org_id, "reveal_email");
  if (!creditCheck.ok) {
    if (creditCheck.error === "INSUFFICIENT_CREDITS") {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message: `You need 1 credit to reveal an email. Current balance: ${creditCheck.balance}`,
          balance: creditCheck.balance,
          required: 1,
        },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: "Credit check failed" }, { status: 500 });
  }

  // ── 6. Call Prospeo email-finder ──────────────────────────────────────────
  let email: string | null = null;
  let emailStatus: "verified" | "unverified" | "invalid" = "unverified";

  try {
    const prospeoResult = await prospeoRevealEmail(linkedin_url);
    if (!prospeoResult.error && prospeoResult.data?.email) {
      email = prospeoResult.data.email;
      emailStatus = prospeoResult.data.status === "VERIFIED" ? "verified" : "unverified";
    }
  } catch (err) {
    console.error("[RevealEmail] Prospeo error:", err);
    return NextResponse.json(
      { error: "REVEAL_FAILED", message: "Email lookup service temporarily unavailable." },
      { status: 503 }
    );
  }

  // ── 7. Save reveal record ─────────────────────────────────────────────────
  const { data: reveal, error: revealError } = await admin
    .from("reveals")
    .upsert(
      {
        org_id: profile.org_id,
        person_id,
        type: "email",
        email: email,
        status: emailStatus,
        revealed_by: user.id,
        credits_charged: 1,
        candidate_id: candidate_id ?? null,
      },
      { onConflict: "org_id,person_id,type" }
    )
    .select("id")
    .single();

  if (revealError) {
    console.error("[RevealEmail] Failed to save reveal:", revealError.message);
  }

  // ── 8b. Sync email to global people table (fire and forget) ───────────────
  if (email) {
    Promise.resolve(
      admin.rpc("update_person_contact", { p_person_id: person_id, p_email: email })
    ).catch(() => { });
  }

  // ── 9. Deduct credit + write ledger ───────────────────────────────────────
  const deductResult = await deductCredits(
    profile.org_id,
    user.id,
    "reveal_email",
    `Email reveal for ${full_name ?? person_id}`,
    { candidateId: candidate_id, revealId: reveal?.id }
  );

  if (!deductResult.ok) {
    console.error("[RevealEmail] Credit deduction failed:", deductResult.error);
  }

  // ── 10. Respond ────────────────────────────────────────────────────────────
  return NextResponse.json({
    email,
    status: emailStatus,
    credits_charged: 1,
    credits_remaining: deductResult.newBalance,
    fromCache: false,
    found: !!email,
  });
}
