// nexire-app — app/api/sequences/[id]/route.ts
// GET /api/sequences/:id — Get sequence details + enrolled candidates
// PATCH /api/sequences/:id — Update sequence (name, status)
// DELETE /api/sequences/:id — Delete sequence

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

const UpdateSequenceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(["draft", "active", "paused", "completed"]).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: sequence, error: seqError } = await admin
    .from("sequences")
    .select("*")
    .eq("id", params.id)
    .eq("org_id", profile.org_id)
    .single();

  if (seqError || !sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  // Get enrolled candidates
  const { data: enrollments, error: enrError } = await admin
    .from("sequence_enrollments")
    .select(`
      id, current_step, status, next_send_at, error_message, created_at,
      candidate:candidates (
        id, person_id, full_name, current_title, current_company, linkedin_url, ai_score,
        reveals(type, email, phone)
      )
    `)
    .eq("sequence_id", params.id)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (enrError) return NextResponse.json({ error: enrError.message }, { status: 500 });

  // Flatten reveals
  const formattedEnrollments = enrollments.map(e => {
    const c = e.candidate as any;
    const emails = c.reveals.filter((r: any) => r.type === "email").map((r: any) => r.email).filter(Boolean);
    const phones = c.reveals.filter((r: any) => r.type === "phone").map((r: any) => r.phone).filter(Boolean);

    return {
      id: e.id,
      status: e.status,
      current_step: e.current_step,
      next_send_at: e.next_send_at,
      error_message: e.error_message,
      enrolled_at: e.created_at,
      candidate: {
        id: c.id,
        full_name: c.full_name,
        current_title: c.current_title,
        current_company: c.current_company,
        linkedin_url: c.linkedin_url,
        ai_score: c.ai_score,
        emails: Array.from(new Set(emails)),
        phones: Array.from(new Set(phones))
      }
    };
  });

  return NextResponse.json({
    sequence,
    enrollments: formattedEnrollments
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateSequenceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

  const { data: sequence, error } = await admin
    .from("sequences")
    .update(parsed.data)
    .eq("id", params.id)
    .eq("org_id", profile.org_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sequence });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("org_id, member_role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (!["owner", "admin"].includes(profile.member_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("sequences")
    .delete()
    .eq("id", params.id)
    .eq("org_id", profile.org_id);

  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
