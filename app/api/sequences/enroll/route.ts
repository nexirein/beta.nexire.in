// nexire-app — app/api/sequences/enroll/route.ts
// POST /api/sequences/enroll — Enrolls a candidate in a sequence

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";

function getAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; }, set() { }, remove() { } } }
  );
}
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const EnrollSchema = z.object({
  candidate_id: z.string().uuid("Valid candidate UUID required"),
  sequence_id: z.string().uuid("Valid sequence UUID required"),
});

export async function POST(req: NextRequest) {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = EnrollSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  // Add to sequence enrollments
  // This will fail (or DO NOTHING if we used upsert) if candidate already enrolled
  const { data: enrollment, error } = await admin
    .from("sequence_enrollments")
    .upsert(
      {
        org_id: profile.org_id,
        sequence_id: parsed.data.sequence_id,
        candidate_id: parsed.data.candidate_id,
        status: "active",
        current_step: 0,
        enrolled_by: user.id,
        next_send_at: new Date().toISOString() // Ready to send immediately
      },
      { onConflict: "sequence_id,candidate_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollment }, { status: 201 });
}
