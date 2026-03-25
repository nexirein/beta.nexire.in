<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/client-dashboard.md ← this module's API contract
-->

# M07 — TASK 04: CLIENT FEEDBACK ACTIONS  [ADDED — enhances UX]
# Trae: Read CLAUDE.md first.
# When a client approves/rejects a candidate or leaves a comment on the public page,
# that feedback flows back into the recruiter's pipeline view in real-time.
# This file: client_feedback DB table, feedback API, feedback display in recruiter UI,
# and a summary bar on the project detail page showing approval breakdown.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the complete feedback loop from client → recruiter:
1. client_feedback table (approval status + comments per candidate per link)
2. POST /api/share/[token]/feedback — write feedback (no auth)
3. GET  /api/projects/[id]/client-feedback — read all feedback for a project (auth required)
4. ClientFeedbackBadge — shown on CandidateKanbanCard + CandidateSlideOver
5. FeedbackSummaryBar — top of project detail page
6. shortlists.client_status column sync (approved/rejected reflected on pipeline board)

---

## FILE 1 — Supabase SQL: client_feedback table + client_status column

```sql
-- Add client_status to shortlists (already referenced in M07-02 GET candidates)
ALTER TABLE shortlists
  ADD COLUMN IF NOT EXISTS client_status TEXT
  CHECK (client_status IN ('approved', 'rejected'));

-- Client feedback table
CREATE TABLE client_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id         UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  shortlist_id    UUID NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  status          TEXT CHECK (status IN ('approved', 'rejected')),
  comment         TEXT CHECK (char_length(comment) <= 2000),

  -- Client identity (from link metadata, not login)
  client_name     TEXT,
  client_email    TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (link_id, shortlist_id)  -- one feedback per candidate per link
);

CREATE INDEX idx_client_feedback_link      ON client_feedback(link_id);
CREATE INDEX idx_client_feedback_shortlist ON client_feedback(shortlist_id);
CREATE INDEX idx_client_feedback_org       ON client_feedback(org_id);

-- No RLS — written by service role (unauthenticated clients)
-- Read via authenticated /api endpoint with org check
```

---

## FILE 2 — app/api/share/[token]/feedback/route.ts  (public — no auth)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const FeedbackSchema = z.object({
  shortlist_id: z.string().uuid(),
  status:       z.enum(["approved", "rejected"]).nullable().optional(),
  comment:      z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient();

  const parsed = FeedbackSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: link } = await supabase
    .from("share_links")
    .select("id, org_id, is_active, client_name, client_email")
    .eq("token", params.token)
    .single();

  if (!link?.is_active) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const { shortlist_id, status, comment } = parsed.data;

  // Upsert feedback (idempotent — client can change their mind)
  const { error: upsertError } = await supabase
    .from("client_feedback")
    .upsert({
      link_id:      link.id,
      shortlist_id,
      org_id:       link.org_id,
      status:       status ?? null,
      comment:      comment ?? null,
      client_name:  link.client_name,
      client_email: link.client_email,
      updated_at:   new Date().toISOString(),
    }, { onConflict: "link_id,shortlist_id" });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  // Sync status back to shortlists.client_status (latest feedback wins)
  if (status !== undefined) {
    await supabase
      .from("shortlists")
      .update({ client_status: status ?? null })
      .eq("id", shortlist_id);
  }

  // If this is the first time a client gives feedback, notify recruiter
  if (status || comment) {
    const { data: shortlist } = await supabase
      .from("shortlists")
      .select("added_by, candidates:candidate_id(full_name)")
      .eq("id", shortlist_id)
      .single();

    if (shortlist?.added_by) {
      await supabase.from("notifications").insert({
        user_id:  shortlist.added_by,
        type:     "client_feedback",
        title:    `${link.client_name ?? "Client"} ${status === "approved" ? "approved" : status === "rejected" ? "rejected" : "commented on"} ${(shortlist.candidates as any)?.full_name ?? "a candidate"}`,
        body:     comment ?? (status === "approved" ? "Candidate approved 👍" : "Candidate rejected"),
        metadata: { link_id: link.id, shortlist_id, status, comment },
        is_read:  false,
      });
    }
  }

  return NextResponse.json({ success: true });
}
```

---

## FILE 3 — app/api/projects/[id]/client-feedback/route.ts  (recruiter only)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Get all feedback for candidates in this project
  const { data: feedback } = await supabase
    .from("client_feedback")
    .select(`
      id, status, comment, client_name, client_email, created_at, updated_at,
      shortlist_id,
      share_links:link_id ( token, title, client_name ),
      shortlists:shortlist_id ( candidates:candidate_id ( full_name ) )
    `)
    .eq("org_id", profile?.org_id)
    .in("shortlist_id", (
      await supabase
        .from("shortlists")
        .select("id")
        .eq("project_id", params.id)
    ).data?.map((s: any) => s.id) ?? [])
    .order("created_at", { ascending: false });

  // Summary stats
  const approved = (feedback ?? []).filter(f => f.status === "approved").length;
  const rejected = (feedback ?? []).filter(f => f.status === "rejected").length;
  const comments = (feedback ?? []).filter(f => f.comment).length;

  return NextResponse.json({
    feedback: feedback ?? [],
    summary: { approved, rejected, comments, total: feedback?.length ?? 0 },
  });
}
```

---

## FILE 4 — components/share/ClientFeedbackBadge.tsx  (shown on kanban cards + slideover)

```tsx
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status?:       string | null;
  hasComment?:   boolean;
  clientName?:   string | null;
  compact?:      boolean;
}

export function ClientFeedbackBadge({ status, hasComment, clientName, compact }: Props) {
  if (!status && !hasComment) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {status === "approved" && (
          <div className="w-4 h-4 rounded-full bg-green-400/20 flex items-center justify-center" title={`Approved by ${clientName ?? "client"}`}>
            <ThumbsUp className="w-2.5 h-2.5 text-green-400 fill-green-400" />
          </div>
        )}
        {status === "rejected" && (
          <div className="w-4 h-4 rounded-full bg-red-400/20 flex items-center justify-center" title={`Rejected by ${clientName ?? "client"}`}>
            <ThumbsDown className="w-2.5 h-2.5 text-red-400 fill-red-400" />
          </div>
        )}
        {hasComment && (
          <div className="w-4 h-4 rounded-full bg-[#38BDF8]/20 flex items-center justify-center" title="Client left a comment">
            <MessageSquare className="w-2.5 h-2.5 text-[#38BDF8]" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border",
      status === "approved" ? "text-green-400 bg-green-400/10 border-green-400/20" :
      status === "rejected" ? "text-red-400 bg-red-400/10 border-red-400/20" :
      "text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/20"
    )}>
      {status === "approved" && <><ThumbsUp className="w-3 h-3 fill-green-400" /> {clientName ? `${clientName.split(" ")[0]} approved` : "Client approved"}</>}
      {status === "rejected" && <><ThumbsDown className="w-3 h-3 fill-red-400" /> {clientName ? `${clientName.split(" ")[0]} passed` : "Client passed"}</>}
      {!status && hasComment && <><MessageSquare className="w-3 h-3" /> Client commented</>}
    </div>
  );
}
```

---

## FILE 5 — components/share/FeedbackSummaryBar.tsx  (top of project detail page)

```tsx
"use client";
import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedbackEntry {
  id: string; status: string | null; comment: string | null;
  client_name: string | null; created_at: string;
  shortlists: { candidates: { full_name: string } } | null;
}

interface Props { projectId: string; }

export function FeedbackSummaryBar({ projectId }: Props) {
  const [summary, setSummary]   = useState<{ approved: number; rejected: number; comments: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/client-feedback`)
      .then(r => r.json())
      .then(d => { setSummary(d.summary); setFeedback(d.feedback ?? []); setLoading(false); });
  };

  useEffect(() => { load(); }, [projectId]);

  if (!summary || summary.total === 0) return null;

  return (
    <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-[#A0A0A0]">Client feedback</span>
          <div className="flex items-center gap-3 text-xs">
            {summary.approved > 0 && (
              <span className="flex items-center gap-1 text-green-400">
                <ThumbsUp className="w-3.5 h-3.5 fill-green-400" />
                {summary.approved} approved
              </span>
            )}
            {summary.rejected > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <ThumbsDown className="w-3.5 h-3.5 fill-red-400" />
                {summary.rejected} passed
              </span>
            )}
            {summary.comments > 0 && (
              <span className="flex items-center gap-1 text-[#38BDF8]">
                <MessageSquare className="w-3.5 h-3.5" />
                {summary.comments} comment{summary.comments !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-[#555555] hover:text-[#A0A0A0] transition-colors"
          >
            {open ? "Hide" : "View all"}
          </button>
        </div>
      </div>

      {open && feedback.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#1A1A1A] space-y-2.5">
          {feedback.map(f => (
            <div key={f.id} className="flex items-start gap-3">
              <div className={cn(
                "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                f.status === "approved" ? "bg-green-400/20" : f.status === "rejected" ? "bg-red-400/20" : "bg-[#38BDF8]/20"
              )}>
                {f.status === "approved" && <ThumbsUp className="w-3 h-3 text-green-400 fill-green-400" />}
                {f.status === "rejected" && <ThumbsDown className="w-3 h-3 text-red-400 fill-red-400" />}
                {!f.status && <MessageSquare className="w-3 h-3 text-[#38BDF8]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#A0A0A0]">
                  <span className="font-medium text-[#FAFAFA]">{f.client_name ?? "Client"}</span>
                  {f.status === "approved" && <span className="text-green-400"> approved</span>}
                  {f.status === "rejected" && <span className="text-red-400"> passed on</span>}
                  {" "}<span className="text-[#555555]">{f.shortlists?.candidates?.full_name ?? "a candidate"}</span>
                </p>
                {f.comment && (
                  <p className="text-xs text-[#555555] mt-0.5 italic">"{f.comment}"</p>
                )}
              </div>
              <span className="text-[10px] text-[#333333] flex-shrink-0">
                {new Date(f.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Wire FeedbackSummaryBar into project detail page:

```tsx
// In app/(app)/projects/[id]/page.tsx, add above the PipelineBoard:
import { FeedbackSummaryBar } from "@/components/share/FeedbackSummaryBar";

// In JSX:
<FeedbackSummaryBar projectId={project.id} />
<PipelineBoard ... />
```

---

## COMPLETION CHECKLIST
- [ ] client_feedback table: link_id + shortlist_id UNIQUE pair
- [ ] ALTER TABLE shortlists ADD client_status column
- [ ] POST /api/share/[token]/feedback: upsert feedback, sync shortlists.client_status, notify recruiter
- [ ] GET /api/projects/[id]/client-feedback: returns all feedback with summary counts
- [ ] ClientFeedbackBadge: compact mode (icon only) + full mode (text label)
- [ ] CandidateKanbanCard: show ClientFeedbackBadge compact when client_status set
- [ ] FeedbackSummaryBar: shows approved/rejected/comment counts at top of project detail
- [ ] Expandable list in FeedbackSummaryBar shows all feedback inline
- [ ] Recruiter gets in-app notification on first feedback per candidate per link
- [ ] Refresh button on FeedbackSummaryBar re-fetches latest feedback

## BUILD LOG ENTRY
## M07-04 Client Feedback Actions — [date]
### Files: client_feedback SQL, feedback API, ClientFeedbackBadge, FeedbackSummaryBar
### Status: ✅ Complete
