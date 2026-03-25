// nexire-app — app/api/contacts/route.ts
// GET /api/contacts — unified rolodex of all interacted candidates

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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

export async function GET(req: NextRequest) {
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Get pagination
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = (page - 1) * limit;

  // We want to fetch all candidates in this org.
  // We left join reveals to get their contact info.
  // We left join sequence_enrollments to get their current sequence status.
  const { data: contacts, error, count } = await admin
    .from("candidates")
    .select(`
      id, person_id, full_name, headline, current_title, current_company,
      location, skills_json, linkedin_url, ai_score, updated_at,
      reveals ( type, email, phone, status ),
      sequence_enrollments ( id, sequence_id, status, current_step, sequences(name) )
    `, { count: "exact" })
    .eq("org_id", profile.org_id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[Contacts API] error:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  // Format response to flatten reveals into contact strings
  const formatted = contacts.map(c => {
    const rEmails = c.reveals.filter((r: any) => r.type === "email").map((r: any) => r.email).filter(Boolean);
    const rPhones = c.reveals.filter((r: any) => r.type === "phone").map((r: any) => r.phone).filter(Boolean);

    // Sort enrollments to get the latest active one if multiple exist
    const enrollments = Array.isArray(c.sequence_enrollments) ? c.sequence_enrollments : [];
    const activeEnrollment = enrollments.find((e: any) => e.status === "active") ?? enrollments[0];

    return {
      id: c.id,
      person_id: c.person_id,
      full_name: c.full_name,
      headline: c.headline,
      current_title: c.current_title,
      current_company: c.current_company,
      location: c.location,
      linkedin_url: c.linkedin_url,
      ai_score: c.ai_score,
      updated_at: c.updated_at,
      emails: Array.from(new Set(rEmails)),
      phones: Array.from(new Set(rPhones)),
      sequence: activeEnrollment ? {
        id: activeEnrollment.sequence_id,
        enrollment_id: activeEnrollment.id,
        name: (Array.isArray(activeEnrollment.sequences) ? activeEnrollment.sequences[0]?.name : (activeEnrollment.sequences as any)?.name) || "Unknown Sequence",
        status: activeEnrollment.status,
        step: activeEnrollment.current_step,
      } : null,
    };
  });

  return NextResponse.json({
    contacts: formatted,
    pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) }
  });
}
