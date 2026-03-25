/**
 * app/api/searches/[searchId]/results/[resultId]/viewed/route.ts
 * PATCH — mark a search result as viewed (called when profile panel opens)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

type Params = { params: { searchId: string; resultId: string } };

export async function PATCH(_req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Mark this person as viewed in the search context
  // We store views in the candidates table as a lightweight view_count update
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Upsert a view record tied to search + person
  Promise.resolve(
    admin
      .from("candidate_views")
      .upsert(
        {
          org_id: profile.org_id,
          search_id: params.searchId,
          person_id: params.resultId,
          viewed_by: user.id,
          viewed_at: new Date().toISOString(),
        },
        { onConflict: "org_id,search_id,person_id" }
      )
  ).catch(() => { }); // Non-blocking — table may not exist yet

  return NextResponse.json({ success: true });
}
