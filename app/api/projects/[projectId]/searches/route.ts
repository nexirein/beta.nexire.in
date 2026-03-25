/**
 * app/api/projects/[projectId]/searches/route.ts
 * GET  — list search conversations for a project (sidebar items)
 * POST — create a new search conversation linked to a project
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

type Params = { params: { projectId: string } };

// ─── GET /api/projects/[projectId]/searches ───────────────────────────────────
// Returns search conversations as sidebar items (id, title, snippet, updated_at)
export async function GET(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");
  const admin = createAdminClient();

  // Verify project belongs to user's org — use admin to bypass any RLS gaps
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", params.projectId)
    .eq("org_id", profile.org_id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: searches, error } = await admin
    .from("search_conversations")
    .select("id, title, status, accumulated_context, created_at, updated_at, messages")
    .eq("project_id", params.projectId)
    .neq("status", "IDLE") // Only show searches that have actually started
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map to sidebar shape — include snippet from accumulated_context
  const formattedSearches = (searches ?? []).map((s) => {
    const ctx = (s.accumulated_context as Record<string, unknown>) ?? {};
    const titles = (ctx.job_titles as string[]) ?? [];
    const locations = (ctx.locations as string[]) ?? [];
    const snippet = [
      titles.slice(0, 1).join(""),
      locations.slice(0, 1).join(""),
    ].filter(Boolean).join(" · ") || null;

    return {
      id: s.id,
      name: s.title || "New Search",
      snippet,
      projectId: params.projectId,
      updatedAt: s.updated_at,
      createdAt: s.created_at,
      status: s.status,
    };
  });

  return NextResponse.json({ searches: formattedSearches });
}

// ─── POST /api/projects/[projectId]/searches ──────────────────────────────────
// Creates a new search conversation linked to a project
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { title } = body;

  const admin = createAdminClient();

  // Verify project belongs to user's org
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: project } = await admin
    .from("projects")
    .select("id, org_id")
    .eq("id", params.projectId)
    .eq("org_id", profile.org_id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: conversation, error } = await admin
    .from("search_conversations")
    .insert({
      user_id: user.id,
      project_id: params.projectId,
      title: title?.trim() || "New Search",
      status: "IDLE",
      messages: [],
      accumulated_context: {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ search: conversation }, { status: 201 });
}
