/**
 * app/api/projects/route.ts
 * GET  — list all projects for the authenticated user's org
 * POST — create a new project
 *
 * RESILIENCE: If profile row doesn't exist (e.g., trigger missed at signup),
 * we auto-create the org + profile here using the service role so the user
 * is never stuck with a 404 loop.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET /api/projects
export async function GET() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdmin();

  // Try to get the profile
  let { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  // RESILIENCE: auto-create profile + org if missing (trigger failure fallback)
  if (!profile) {
    const googleName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "User";

    const { data: newOrg } = await admin
      .from("orgs")
      .insert({ name: "My Organisation", plan: "free", credits_balance: 50 })
      .select("id")
      .single();

    if (newOrg) {
      await admin.from("profiles").insert({
        id: user.id,
        org_id: newOrg.id,
        member_role: "owner",
        full_name: googleName,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      });
      profile = { org_id: newOrg.id };
    } else {
      return NextResponse.json({ error: "Profile creation failed" }, { status: 500 });
    }
  }

  const { data: projects, error } = await admin
    .from("projects")
    .select("id, title, description, status, created_at, updated_at, created_by")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // RESILIENCE: if no projects exist (e.g., legacy users or trigger failure),
  // auto-create a default "First Project"
  let finalProjects = projects ?? [];
  if (finalProjects.length === 0) {
    const { data: newProject } = await admin
      .from("projects")
      .insert({
        org_id: profile.org_id,
        title: "First Project",
        created_by: user.id,
        status: "active",
      })
      .select()
      .single();
    if (newProject) finalProjects = [newProject];
  }

  return NextResponse.json({ projects: finalProjects });
}

// POST /api/projects
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: project, error } = await admin
    .from("projects")
    .insert({
      org_id: profile.org_id,
      title: title.trim(),
      description: description?.trim() || null,
      created_by: user.id,
      status: "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project }, { status: 201 });
}
