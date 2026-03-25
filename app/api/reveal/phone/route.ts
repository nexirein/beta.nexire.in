// nexire-app — app/api/reveal/phone/route.ts
// POST /api/reveal/phone
// Reveals phone (+ email) for a candidate using Prospeo mobile-finder.
//
// Economics:
//   - Cost: 8 Nexire credits (Prospeo charges 10 — we absorb 2 as product margin)
//   - Re-reveal: FREE (0 credits) — cached from reveals table
//   - Prospeo mobile-finder also returns email — we cache that too at no extra charge
//
// Flow:
//   Auth → Profile → Cache check → Credit check → Prospeo call →
//   Save reveal (phone + email) → Deduct credits → Write ledger → Respond

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkCredits, deductCredits } from "@/lib/credits/engine";
import { prospeoRevealPhone } from "@/lib/prospeo/client";

const RevealPhoneSchema = z.object({
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
  const parsedBody = RevealPhoneSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }
  const { person_id, linkedin_url, candidate_id, full_name } = parsedBody.data;

  // ── 4. Cache check (free re-reveal) ──────────────────────────────────────
  const { data: existing } = await admin
    .from("reveals")
    .select("id, phone, status")
    .eq("org_id", profile.org_id)
    .eq("person_id", person_id)
    .eq("type", "phone")
    .maybeSingle();

  if (existing?.phone) {
    return NextResponse.json({
      phone: existing.phone,
      status: existing.status,
      credits_charged: 0,
      fromCache: true,
    });
  }

  // ── 5. Credit check ───────────────────────────────────────────────────────
  const creditCheck = await checkCredits(profile.org_id, "reveal_phone");
  if (!creditCheck.ok) {
    if (creditCheck.error === "INSUFFICIENT_CREDITS") {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message: `You need 8 credits to reveal a phone number. Current balance: ${creditCheck.balance}`,
          balance: creditCheck.balance,
          required: 8,
        },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: "Credit check failed" }, { status: 500 });
  }

  // ── 6. Call Prospeo mobile-finder ────────────────────────────────────────
  let phone: string | null = null;
  let bonusEmail: string | null = null;
  let phoneStatus: "verified" | "unverified" | "invalid" = "unverified";

  try {
    const prospeoResult = await prospeoRevealPhone(linkedin_url);
    if (!prospeoResult.error && prospeoResult.data?.mobile) {
      phone = prospeoResult.data.mobile;
      phoneStatus = prospeoResult.data.mobile_status === "VERIFIED" ? "verified" : "unverified";
      // Prospeo also returns email as a bonus — save it for free
      if (prospeoResult.data.email) {
        bonusEmail = prospeoResult.data.email;
      }
    }
  } catch (err) {
    console.error("[RevealPhone] Prospeo error:", err);
    return NextResponse.json(
      { error: "REVEAL_FAILED", message: "Phone lookup service temporarily unavailable." },
      { status: 503 }
    );
  }

  // ── 7. Save phone reveal ──────────────────────────────────────────────────
  const { data: phoneReveal, error: phoneRevealError } = await admin
    .from("reveals")
    .upsert(
      {
        org_id: profile.org_id,
        person_id,
        type: "phone",
        phone,
        status: phoneStatus,
        revealed_by: user.id,
        credits_charged: 8,
        candidate_id: candidate_id ?? null,
      },
      { onConflict: "org_id,person_id,type" }
    )
    .select("id")
    .single();

  if (phoneRevealError) {
    console.error("[RevealPhone] Failed to save phone reveal:", phoneRevealError.message);
  }

  // ── 8. Bonus: save email reveal if not already cached (free! no credit) ──
  if (bonusEmail) {
    const { data: existingEmail } = await admin
      .from("reveals")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("person_id", person_id)
      .eq("type", "email")
      .maybeSingle();

    if (!existingEmail) {
      await admin.from("reveals").insert({
        org_id: profile.org_id,
        person_id,
        type: "email",
        email: bonusEmail,
        status: "unverified",
        revealed_by: user.id,
        credits_charged: 0, // FREE — bonus from phone reveal
        candidate_id: candidate_id ?? null,
      });
    }
  }

  // ── 9. Deduct 8 credits + write ledger ───────────────────────────────────
  const deductResult = await deductCredits(
    profile.org_id,
    user.id,
    "reveal_phone",
    `Phone reveal for ${full_name ?? person_id}`,
    { candidateId: candidate_id, revealId: phoneReveal?.id }
  );

  if (!deductResult.ok) {
    console.error("[RevealPhone] Credit deduction failed:", deductResult.error);
  }

  // ── 10. Respond ───────────────────────────────────────────────────────────
  return NextResponse.json({
    phone,
    email: bonusEmail,
    status: phoneStatus,
    credits_charged: 8,
    credits_remaining: deductResult.newBalance,
    fromCache: false,
    found: !!phone,
  });
}
