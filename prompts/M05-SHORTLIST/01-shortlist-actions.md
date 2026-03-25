<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/shortlist.md       ← this module's API contract
-->

# M05 — TASK 01: SHORTLIST ACTIONS
# Trae: Read CLAUDE.md first.
# Shortlisting is how a recruiter moves a revealed candidate into a project pipeline.
# This file covers: the API routes, DB schema additions, and all action hooks
# (add to project, move stage, remove, duplicate to another project).
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the complete shortlist action layer:
1. DB schema: shortlists table (if not already created in M02)
2. POST /api/shortlist          — add candidate to project
3. PATCH /api/shortlist/[id]    — update stage / notes / rating
4. DELETE /api/shortlist/[id]   — remove from project
5. POST /api/shortlist/[id]/copy — duplicate to another project
6. useShortlist React hook — client-side state + optimistic updates

---

## FILE 1 — Supabase SQL: shortlists table schema

Run in Supabase SQL Editor:

```sql
-- Shortlist pipeline stages
CREATE TYPE pipeline_stage AS ENUM (
  'sourced',
  'reviewing',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'rejected',
  'on_hold'
);

CREATE TABLE IF NOT EXISTS shortlists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES orgs(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  added_by     UUID NOT NULL REFERENCES auth.users(id),

  stage        pipeline_stage NOT NULL DEFAULT 'sourced',
  rating       SMALLINT CHECK (rating BETWEEN 1 AND 5),
  notes        TEXT,
  is_archived  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (project_id, candidate_id)   -- one candidate per project
);

-- Indexes
CREATE INDEX idx_shortlists_project  ON shortlists(project_id, stage, created_at DESC);
CREATE INDEX idx_shortlists_candidate ON shortlists(candidate_id);
CREATE INDEX idx_shortlists_added_by  ON shortlists(added_by);

-- RLS
ALTER TABLE shortlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can CRUD own shortlists"
  ON shortlists
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE TRIGGER shortlists_updated_at
  BEFORE UPDATE ON shortlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## FILE 2 — app/api/shortlist/route.ts  (POST — add to project)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const AddSchema = z.object({
  candidate_id: z.string().uuid(),
  project_id:   z.string().uuid(),
  stage:        z.enum([
    "sourced","reviewing","shortlisted","interviewing",
    "offered","hired","rejected","on_hold"
  ]).default("sourced"),
  notes:        z.string().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  // Get org_id from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 403 });

  // Verify candidate belongs to org (was revealed by someone in org)
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, linkedin_url, email, phone")
    .eq("id", parsed.data.candidate_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!candidate) return NextResponse.json({ error: "Candidate not found or not revealed" }, { status: 404 });

  // Verify project belongs to org
  const { data: project } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", parsed.data.project_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Upsert (idempotent — if already shortlisted, update stage)
  const { data: shortlist, error: insertError } = await supabase
    .from("shortlists")
    .upsert({
      org_id:       profile.org_id,
      project_id:   parsed.data.project_id,
      candidate_id: parsed.data.candidate_id,
      added_by:     user.id,
      stage:        parsed.data.stage,
      notes:        parsed.data.notes ?? null,
    }, { onConflict: "project_id,candidate_id" })
    .select("id, stage, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to shortlist", details: insertError.message }, { status: 500 });
  }

  // Update project candidate_count
  await supabase.rpc("increment_project_count", { p_project_id: parsed.data.project_id });

  return NextResponse.json({
    shortlist_id:   shortlist.id,
    stage:          shortlist.stage,
    project_title:  project.title,
    candidate_name: candidate.full_name,
  }, { status: 201 });
}
```

---

## FILE 3 — app/api/shortlist/[id]/route.ts  (PATCH / DELETE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const UpdateSchema = z.object({
  stage:       z.enum([
    "sourced","reviewing","shortlisted","interviewing",
    "offered","hired","rejected","on_hold"
  ]).optional(),
  notes:       z.string().max(5000).optional().nullable(),
  rating:      z.number().int().min(1).max(5).optional().nullable(),
  is_archived: z.boolean().optional(),
});

// ── PATCH ── update stage / notes / rating
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: updated, error } = await supabase
    .from("shortlists")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("org_id", profile?.org_id)   // RLS guard
    .select("id, stage, notes, rating, updated_at")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// ── DELETE ── remove from shortlist
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: shortlist } = await supabase
    .from("shortlists")
    .select("id, project_id")
    .eq("id", params.id)
    .eq("org_id", profile?.org_id)
    .single();

  if (!shortlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("shortlists").delete().eq("id", params.id);
  await supabase.rpc("decrement_project_count", { p_project_id: shortlist.project_id });

  return NextResponse.json({ success: true });
}
```

---

## FILE 4 — app/api/shortlist/[id]/copy/route.ts  (copy to another project)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const CopySchema = z.object({ target_project_id: z.string().uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CopySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Fetch original shortlist
  const { data: original } = await supabase
    .from("shortlists")
    .select("candidate_id, notes")
    .eq("id", params.id)
    .eq("org_id", profile?.org_id)
    .single();

  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Insert into target project (reset stage to sourced)
  const { data: copy, error: copyError } = await supabase
    .from("shortlists")
    .upsert({
      org_id:       profile?.org_id,
      project_id:   parsed.data.target_project_id,
      candidate_id: original.candidate_id,
      added_by:     user.id,
      stage:        "sourced",
      notes:        original.notes,
    }, { onConflict: "project_id,candidate_id" })
    .select("id")
    .single();

  if (copyError) return NextResponse.json({ error: copyError.message }, { status: 500 });

  return NextResponse.json({ shortlist_id: copy.id }, { status: 201 });
}
```

---

## FILE 5 — hooks/useShortlist.ts  (client-side shortlist hook)

```typescript
import { useState, useCallback } from "react";
import { toast } from "sonner";

export interface ShortlistEntry {
  id:          string;
  candidate_id: string;
  project_id:  string;
  stage:       string;
  rating:      number | null;
  notes:       string | null;
  is_archived: boolean;
}

export function useShortlist() {
  const [loading, setLoading] = useState(false);

  const addToProject = useCallback(async (
    candidateId: string,
    projectId:   string,
    stage:       string = "sourced"
  ) => {
    setLoading(true);
    try {
      const res = await fetch("/api/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, project_id: projectId, stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to shortlist");
      toast.success(`Added to ${data.project_title}`);
      return data;
    } catch (err: any) {
      toast.error(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateShortlist = useCallback(async (
    id:      string,
    updates: Partial<Pick<ShortlistEntry, "stage" | "notes" | "rating" | "is_archived">>
  ) => {
    const res = await fetch(`/api/shortlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Update failed"); return null; }
    return data;
  }, []);

  const removeFromProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/shortlist/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Remove failed"); return false; }
    toast.success("Removed from shortlist");
    return true;
  }, []);

  const copyToProject = useCallback(async (id: string, targetProjectId: string) => {
    const res = await fetch(`/api/shortlist/${id}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_project_id: targetProjectId }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Copy failed"); return null; }
    toast.success("Copied to project");
    return data;
  }, []);

  return { addToProject, updateShortlist, removeFromProject, copyToProject, loading };
}
```

---

## SUPABASE RPC — increment/decrement project candidate count

```sql
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION increment_project_count(p_project_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE projects SET candidate_count = COALESCE(candidate_count, 0) + 1
  WHERE id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_project_count(p_project_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE projects SET candidate_count = GREATEST(0, COALESCE(candidate_count, 0) - 1)
  WHERE id = p_project_id;
END;
$$;
```

---

## COMPLETION CHECKLIST
- [ ] shortlists table created with RLS, pipeline_stage enum, UNIQUE(project_id, candidate_id)
- [ ] POST /api/shortlist: idempotent upsert, verifies candidate + project belong to org
- [ ] PATCH /api/shortlist/[id]: updates stage / notes / rating / is_archived
- [ ] DELETE /api/shortlist/[id]: removes + decrements project count
- [ ] POST /api/shortlist/[id]/copy: duplicates to target project, resets stage to "sourced"
- [ ] useShortlist hook: addToProject / updateShortlist / removeFromProject / copyToProject
- [ ] increment_project_count + decrement_project_count RPCs created
- [ ] Test: duplicate shortlist (same candidate + project) does upsert NOT duplicate

## BUILD LOG ENTRY
## M05-01 Shortlist Actions — [date]
### Files: SQL schema + 3 API routes + useShortlist hook
### Status: ✅ Complete
