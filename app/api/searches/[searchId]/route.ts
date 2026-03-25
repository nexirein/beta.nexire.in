/**
 * app/api/searches/[searchId]/route.ts
 * GET   — load a specific search conversation (messages + context + filters)
 * PATCH — update title or accumulated_context for a search
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

type Params = { params: { searchId: string } };

// GET /api/searches/[searchId]
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation, error } = await supabase
    .from("search_conversations")
    .select("id, title, status, messages, accumulated_context, prospeo_filters, estimated_matches, project_id, created_at, updated_at")
    .eq("id", params.searchId)
    .eq("user_id", user.id)
    .single();

  if (error || !conversation) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  return NextResponse.json({ search: conversation });
}

// PATCH /api/searches/[searchId]
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { title, accumulated_context, messages, status, prospeo_filters, estimated_matches } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (accumulated_context !== undefined) updates.accumulated_context = accumulated_context;
  if (messages !== undefined) updates.messages = messages;
  if (status !== undefined) updates.status = status;
  if (prospeo_filters !== undefined) updates.prospeo_filters = prospeo_filters;
  if (estimated_matches !== undefined) updates.estimated_matches = estimated_matches;

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("search_conversations")
    .update(updates)
    .eq("id", params.searchId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ search: updated });
}

// DELETE /api/searches/[searchId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("search_conversations")
    .delete()
    .eq("id", params.searchId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
