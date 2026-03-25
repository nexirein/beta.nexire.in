/**
 * app/api/searches/[searchId]/results/[resultId]/reveal-email/route.ts
 * POST — reveal email for a candidate (consumes Prospeo credits)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prospeoRevealEmail } from "@/lib/prospeo/client";

type Params = { params: { searchId: string; resultId: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Find candidate by person_id
  const { data: candidate } = await admin
    .from("candidates")
    .select("person_id, linkedin_url, full_name")
    .eq("org_id", profile.org_id)
    .eq("person_id", params.resultId)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  if (!candidate.linkedin_url) {
    return NextResponse.json({ error: "No LinkedIn URL available for email reveal" }, { status: 422 });
  }

  // Check if already revealed
  const { data: existingReveal } = await admin
    .from("reveals")
    .select("value")
    .eq("org_id", profile.org_id)
    .eq("person_id", candidate.person_id)
    .eq("type", "email")
    .single();

  if (existingReveal) {
    return NextResponse.json({ email: existingReveal.value, fromCache: true });
  }

  // Call Prospeo email finder
  try {
    const result = await prospeoRevealEmail(candidate.linkedin_url);

    if (result.error || !result.data?.email) {
      return NextResponse.json(
        { error: "EMAIL_NOT_FOUND", message: "Email could not be found for this profile." },
        { status: 404 }
      );
    }

    const email = result.data.email;

    // Store the reveal in DB
    await admin.from("reveals").insert({
      org_id: profile.org_id,
      person_id: candidate.person_id,
      type: "email",
      value: email,
      revealed_by: user.id,
      source: "prospeo",
    });

    // Decrement org credits
    await admin.rpc("decrement_credits", {
      p_org_id: profile.org_id,
      p_amount: 1,
      p_description: `Email reveal: ${candidate.full_name ?? candidate.person_id}`,
      p_person_id: candidate.person_id,
      p_reveal_type: "email",
    });

    return NextResponse.json({ email, fromCache: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Reveal failed";
    return NextResponse.json({ error: "REVEAL_FAILED", message: msg }, { status: 503 });
  }
}
