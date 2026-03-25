/**
 * app/api/searches/[searchId]/results/[resultId]/shortlist/route.ts
 * POST — shortlist a candidate from a search result
 * Creates a shortlist record + marks the search result
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

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

  // Get the search to find project_id
  const { data: search } = await admin
    .from("saved_searches")
    .select("id, project_id, org_id")
    .eq("id", params.searchId)
    .single();

  if (!search) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  // Get the stored candidate (by person_id stored as resultId)
  const { data: candidate } = await admin
    .from("candidates")
    .select("*")
    .eq("org_id", profile.org_id)
    .eq("person_id", params.resultId)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found in org database" }, { status: 404 });
  }

  // Insert to shortlist (upsert to avoid duplicates)
  const { data: shortlist, error } = await admin
    .from("shortlists")
    .upsert({
      org_id: profile.org_id,
      project_id: search.project_id,
      candidate_id: candidate.id,
      person_id: candidate.person_id,
      added_by: user.id,
    }, { onConflict: "org_id,project_id,person_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ shortlist, success: true }, { status: 201 });
}

// DELETE — remove from shortlist
export async function DELETE(_req: NextRequest, { params }: Params) {
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

  const { error } = await admin
    .from("shortlists")
    .delete()
    .eq("org_id", profile.org_id)
    .eq("person_id", params.resultId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
