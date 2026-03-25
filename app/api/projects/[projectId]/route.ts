/**
 * app/api/projects/[projectId]/route.ts
 * GET    — single project + recent searches
 * PATCH  — update project name/description/status
 * DELETE — soft delete (archive)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type Params = { params: { projectId: string } };

// ─── GET /api/projects/[projectId] ───────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, title, description, status, jd_text, created_at, updated_at, created_by")
    .eq("id", params.projectId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch last 5 searches for this project
  const { data: recentSearches } = await supabase
    .from("saved_searches")
    .select("id, name, created_at, filters_json")
    .eq("project_id", params.projectId)
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    project,
    recentSearches: recentSearches ?? [],
  });
}

// ─── PATCH /api/projects/[projectId] ─────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, status } = body;

  // Validate status if provided
  if (status && !["active", "closed", "archived"].includes(status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", params.projectId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project });
}

// ─── DELETE /api/projects/[projectId] — soft delete ──────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft delete: set status to archived
  const { error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("id", params.projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
