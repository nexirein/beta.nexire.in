<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/sequences.md       ← this module's API contract
-->

# M06 — TASK 03: ENROLL CANDIDATES
# Trae: Read CLAUDE.md first.
# Enrollment = linking shortlisted candidates to a sequence for sending.
# A candidate can be enrolled in multiple sequences (different projects).
# This file: DB schema for enrollments, enroll UI in CandidateSlideOver,
# bulk enroll from pipeline board, and enroll API routes.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the enrollment flow:
1. sequence_enrollments table (tracks per-candidate per-sequence progress)
2. EnrollSequenceModal — pick sequence + confirm, shown from slideover/board
3. POST /api/sequences/[id]/enroll — enroll one or many candidates
4. GET  /api/sequences/enrollments — list enrollments for a project
5. POST /api/sequences/enrollments/[id]/pause|resume|stop
6. Enrollment status: pending → in_progress → completed / stopped / replied

---

## FILE 1 — Supabase SQL: sequence_enrollments table

```sql
CREATE TYPE enrollment_status AS ENUM (
  'pending',      -- scheduled, not yet sent
  'in_progress',  -- at least 1 step sent
  'completed',    -- all steps sent
  'replied',      -- candidate replied (stop sending)
  'stopped',      -- manually stopped by recruiter
  'unsubscribed', -- candidate clicked unsubscribe
  'bounced'       -- email bounced
);

CREATE TABLE sequence_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  sequence_id     UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id),
  enrolled_by     UUID NOT NULL REFERENCES auth.users(id),

  status          enrollment_status NOT NULL DEFAULT 'pending',
  current_step    INTEGER NOT NULL DEFAULT 1,
  total_steps     INTEGER NOT NULL DEFAULT 1,

  -- Personalisation overrides (overrides sequence defaults for this candidate)
  custom_vars     JSONB DEFAULT '{}',

  -- Tracking
  emails_sent     INTEGER NOT NULL DEFAULT 0,
  emails_opened   INTEGER NOT NULL DEFAULT 0,
  links_clicked   INTEGER NOT NULL DEFAULT 0,
  replied_at      TIMESTAMPTZ,
  last_sent_at    TIMESTAMPTZ,
  next_send_at    TIMESTAMPTZ,   -- computed by cron scheduler

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (sequence_id, candidate_id)  -- one enrollment per candidate per sequence
);

CREATE TABLE sequence_email_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  sequence_id     UUID NOT NULL REFERENCES sequences(id),
  step_id         UUID NOT NULL REFERENCES sequence_steps(id),
  step_number     INTEGER NOT NULL,
  resend_id       TEXT,           -- Resend message ID for tracking
  status          TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_enrollments_next_send ON sequence_enrollments(next_send_at)
  WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_enrollments_sequence  ON sequence_enrollments(sequence_id, status);
CREATE INDEX idx_enrollments_candidate ON sequence_enrollments(candidate_id);
CREATE INDEX idx_email_logs_enrollment ON sequence_email_logs(enrollment_id);
CREATE INDEX idx_email_logs_resend_id  ON sequence_email_logs(resend_id);

-- RLS
ALTER TABLE sequence_enrollments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_email_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage enrollments"
  ON sequence_enrollments
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members view email logs"
  ON sequence_email_logs FOR SELECT
  USING (
    enrollment_id IN (
      SELECT id FROM sequence_enrollments
      WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
  );
```

---

## FILE 2 — components/sequences/EnrollSequenceModal.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { X, Mail, Users, Play, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Sequence { id: string; title: string; step_count: number; status: string; }
interface Candidate { candidate_id: string; full_name: string; email: string; }

interface EnrollSequenceModalProps {
  open:        boolean;
  onClose:     () => void;
  candidates:  Candidate[];           // 1 for single, many for bulk
  projectId?:  string;
  onEnrolled?: (enrollmentIds: string[]) => void;
}

export function EnrollSequenceModal({
  open, onClose, candidates, projectId, onEnrolled,
}: EnrollSequenceModalProps) {
  const [sequences, setSequences]     = useState<Sequence[]>([]);
  const [selected, setSelected]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [enrolling, setEnrolling]     = useState(false);
  const [query, setQuery]             = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/sequences")
      .then(r => r.json())
      .then(d => {
        setSequences((d.sequences ?? []).filter((s: Sequence) => s.status === "active"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open]);

  const filtered = sequences.filter(s =>
    s.title.toLowerCase().includes(query.toLowerCase())
  );

  const handleEnroll = async () => {
    if (!selected) return;
    setEnrolling(true);
    try {
      const res = await fetch(`/api/sequences/${selected}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_ids: candidates.map(c => c.candidate_id),
          project_id:    projectId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enrollment failed");

      toast.success(
        candidates.length === 1
          ? `${candidates[0].full_name} enrolled in sequence`
          : `${candidates.length} candidates enrolled`
      );
      onEnrolled?.(data.enrollment_ids ?? []);
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEnrolling(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-md shadow-2xl animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center">
              <Mail className="w-4 h-4 text-[#38BDF8]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#FAFAFA]">Enroll in sequence</h2>
              <p className="text-[11px] text-[#555555]">
                {candidates.length === 1
                  ? candidates[0].full_name
                  : `${candidates.length} candidates selected`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search sequences..."
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl pl-8 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
            />
          </div>
        </div>

        {/* Sequence list */}
        <div className="px-5 py-3 space-y-1.5 max-h-64 overflow-y-auto">
          {loading && (
            <p className="text-xs text-[#555555] text-center py-4">Loading sequences...</p>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-6">
              <p className="text-xs text-[#555555]">No active sequences found.</p>
              <a href="/sequences" className="text-xs text-[#38BDF8] mt-1 block hover:underline">
                Create one →
              </a>
            </div>
          )}
          {filtered.map(seq => (
            <button
              key={seq.id}
              onClick={() => setSelected(seq.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-3 rounded-xl border text-left transition-all",
                selected === seq.id
                  ? "bg-[#38BDF8]/5 border-[#38BDF8]/30"
                  : "bg-[#0A0A0A] border-[#222222] hover:border-[#333333]"
              )}
            >
              <div>
                <p className="text-sm font-medium text-[#FAFAFA]">{seq.title}</p>
                <p className="text-[11px] text-[#555555] mt-0.5">
                  {seq.step_count} step{seq.step_count !== 1 ? "s" : ""}
                </p>
              </div>
              {selected === seq.id && (
                <div className="w-5 h-5 rounded-md bg-[#38BDF8] flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-[#1A1A1A]">
          <button
            onClick={handleEnroll}
            disabled={!selected || enrolling}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all disabled:opacity-40"
          >
            <Play className="w-4 h-4" />
            {enrolling
              ? "Enrolling..."
              : `Enroll ${candidates.length > 1 ? candidates.length + " candidates" : candidates[0]?.full_name?.split(" ")[0] ?? "candidate"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## FILE 3 — app/api/sequences/[id]/enroll/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const EnrollSchema = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1).max(50),
  project_id:    z.string().uuid().optional(),
  custom_vars:   z.record(z.string()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = EnrollSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Verify sequence is active
  const { data: sequence } = await supabase
    .from("sequences")
    .select("id, status, step_count")
    .eq("id", params.id)
    .eq("org_id", profile?.org_id)
    .single();

  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (sequence.status !== "active") {
    return NextResponse.json({ error: "Sequence must be active to enroll candidates" }, { status: 400 });
  }
  if (sequence.step_count === 0) {
    return NextResponse.json({ error: "Sequence has no steps" }, { status: 400 });
  }

  // Verify all candidates have email addresses
  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, email, full_name")
    .in("id", parsed.data.candidate_ids)
    .eq("org_id", profile?.org_id)
    .not("email", "is", null);

  if (!candidates?.length) {
    return NextResponse.json({ error: "No candidates with email addresses found" }, { status: 400 });
  }

  const now = new Date();

  // Upsert enrollments (skip already enrolled)
  const rows = candidates.map(c => ({
    org_id:       profile?.org_id,
    sequence_id:  params.id,
    candidate_id: c.id,
    project_id:   parsed.data.project_id ?? null,
    enrolled_by:  user.id,
    status:       "pending",
    total_steps:  sequence.step_count,
    custom_vars:  parsed.data.custom_vars ?? {},
    next_send_at: now.toISOString(),  // first email sends immediately (cron picks up)
  }));

  const { data: enrolled, error: insertError } = await supabase
    .from("sequence_enrollments")
    .upsert(rows, { onConflict: "sequence_id,candidate_id", ignoreDuplicates: true })
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Increment enrolled_count on sequence
  await supabase.rpc("increment_sequence_enrolled", {
    p_sequence_id: params.id,
    p_count:       enrolled?.length ?? 0,
  });

  return NextResponse.json({
    enrollment_ids:  (enrolled ?? []).map((e: any) => e.id),
    enrolled_count:  enrolled?.length ?? 0,
    skipped_no_email: parsed.data.candidate_ids.length - (candidates?.length ?? 0),
  }, { status: 201 });
}
```

---

## SUPABASE RPC — increment_sequence_enrolled

```sql
CREATE OR REPLACE FUNCTION increment_sequence_enrolled(
  p_sequence_id UUID,
  p_count       INTEGER
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE sequences
  SET enrolled_count = enrolled_count + p_count,
      updated_at     = NOW()
  WHERE id = p_sequence_id;
END;
$$;
```

---

## COMPLETION CHECKLIST
- [ ] sequence_enrollments table with all statuses + UNIQUE(sequence_id, candidate_id)
- [ ] sequence_email_logs table for tracking opens/clicks per step
- [ ] idx_enrollments_next_send index: critical for cron scheduler performance
- [ ] EnrollSequenceModal: shows only active sequences, searchable
- [ ] EnrollSequenceModal: handles single + bulk enrollment
- [ ] POST /api/sequences/[id]/enroll: skips candidates without email, deduplicates
- [ ] Enrolled candidates get next_send_at = NOW() (cron picks up immediately)
- [ ] increment_sequence_enrolled RPC: updates enrolled_count on sequences table

## BUILD LOG ENTRY
## M06-03 Enroll Candidates — [date]
### Files: sequence_enrollments SQL, EnrollSequenceModal, enroll API route
### Status: ✅ Complete
