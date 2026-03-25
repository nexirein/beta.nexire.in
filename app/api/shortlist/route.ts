import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const personId = searchParams.get("personId");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 20;

  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();

    // Ensure org resolving
    const { data: profile } = await supabaseAdmin.from("profiles").select("org_id").eq("id", user.id).single();
    const orgId = profile?.org_id;
    if (!orgId) return NextResponse.json({ error: "No organization found" }, { status: 400 });

    // Single item check
    if (personId) {
      if (!projectId) return NextResponse.json({ isShortlisted: false });
      
      // 1. Find candidate_id for this person_id in this org
      const { data: cand } = await supabaseAdmin
        .from("candidates")
        .select("id")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .single();
        
      if (!cand) return NextResponse.json({ isShortlisted: false });

      // 2. Check shortlist
      const { data: entry } = await supabaseAdmin
        .from("shortlist_entries")
        .select("id")
        .eq("org_id", orgId)
        .eq("project_id", projectId)
        .eq("candidate_id", cand.id)
        .single();

      return NextResponse.json({ isShortlisted: !!entry });
    }

    // List all shortlisted items (paginated)
    let query = supabaseAdmin
      .from("shortlist_entries")
      .select("*, candidates(*)", { count: "exact" })
      .eq("org_id", orgId);
      
    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    
    query = query.order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      entries: data,
      total: count,
      totalPages: count ? Math.ceil(count / limit) : 0,
      page
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("shortlist_entries").delete().eq("id", id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { projectId, personId, candidateData } = await req.json();

    if (!projectId || !personId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin.from("profiles").select("org_id").eq("id", user.id).single();
    const orgId = profile?.org_id;

    // 1. Ensure candidate exists in "candidates" table for this org
    let { data: candidateRow } = await supabaseAdmin
      .from("candidates")
      .select("id")
      .eq("org_id", orgId)
      .eq("person_id", personId)
      .single();

    if (!candidateRow) {
      // Upsert candidate wrapper
      const currEmp = candidateData.raw_crustdata_json?.current_employers?.[0] || {};
      const { data: newCand, error: candError } = await supabaseAdmin
        .from("candidates")
        .insert({
          org_id: orgId,
          person_id: personId,
          full_name: candidateData.full_name,
          headline: candidateData.headline,
          current_title: candidateData.current_title,
          current_company: currEmp.name || candidateData.current_company,
          location: [candidateData.location_city, candidateData.location_state, candidateData.location_country].filter(Boolean).join(", "),
          skills_json: candidateData.skills,
          linkedin_url: candidateData.linkedin_url,
          profile_pic_url: candidateData.raw_crustdata_json?.profile_picture_url,
          ai_score: candidateData.ai_score,
          raw_json: candidateData.raw_crustdata_json,
        })
        .select("id")
        .single();
        
      if (candError) throw candError;
      candidateRow = newCand;
    }

    const candidateId = candidateRow.id;

    // 2. Check if already shortlisted
    const { data: existing } = await supabaseAdmin
      .from("shortlist_entries")
      .select("id")
      .eq("org_id", orgId)
      .eq("project_id", projectId)
      .eq("candidate_id", candidateId)
      .single();

    if (existing) {
      // Remove it
      await supabaseAdmin.from("shortlist_entries").delete().eq("id", existing.id);
      return NextResponse.json({ isShortlisted: false });
    } else {
      // Add it
      await supabaseAdmin.from("shortlist_entries").insert({
        org_id: orgId,
        project_id: projectId,
        candidate_id: candidateId,
        added_by: user.id
      });
      return NextResponse.json({ isShortlisted: true });
    }
  } catch (error: any) {
    console.error("SHORTLIST POST ERROR:", error);
    try {
      require("fs").appendFileSync("/tmp/shortlist_error.txt", new Date().toISOString() + " - " + error.message + "\n" + (error.stack || "") + "\n\n");
    } catch(e) {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
