<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/shortlist.md       ← this module's API contract
-->

# M05 — TASK 03: NOTES AND STATUS
# Trae: Read CLAUDE.md first.
# Every shortlisted candidate can have: recruiter notes, a star rating (1-5),
# activity timeline (stage changes, email opens, WhatsApp clicks), and a status tag.
# This file builds all of these inside the CandidateSlideOver "Notes" tab.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the full Notes & Status panel:
1. NotesEditor — autosaving textarea with timestamp
2. StarRating component — 1 to 5 stars, click to rate
3. ActivityTimeline — shows stage changes + email/phone/WhatsApp events
4. StatusTag — quick status labels (Available / Not looking / In process / Placed)
5. GET /api/shortlist/[id]/activity — fetch activity log for a candidate
6. All wired into CandidateSlideOver Notes tab

---

## FILE 1 — components/pipeline/NotesEditor.tsx

```tsx
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { StickyNote, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotesEditorProps {
  shortlistId:   string;
  initialNotes:  string | null;
  onSave?:       (notes: string) => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function NotesEditor({ shortlistId, initialNotes, onSave }: NotesEditorProps) {
  const [notes, setNotes]         = useState(initialNotes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty                   = useRef(false);

  // Auto-save with 1.5s debounce
  const triggerSave = useCallback(async (value: string) => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/shortlist/${shortlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveState("saved");
      setLastSaved(new Date());
      onSave?.(value);
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }, [shortlistId, onSave]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    isDirty.current = true;
    setSaveState("idle");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (isDirty.current) {
        isDirty.current = false;
        triggerSave(value);
      }
    }, 1500);
  };

  // Save on unmount if dirty
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (isDirty.current) triggerSave(notes);
    };
  }, [notes, triggerSave]);

  const saveIcon = {
    idle:   null,
    saving: <Loader2 className="w-3 h-3 animate-spin text-[#555555]" />,
    saved:  <Check className="w-3 h-3 text-green-400" />,
    error:  <span className="text-[10px] text-[#EF4444]">Save failed</span>,
  }[saveState];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <StickyNote className="w-3.5 h-3.5 text-[#555555]" />
          <span className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">
            Recruiter Notes
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {saveIcon}
          {saveState === "saved" && lastSaved && (
            <span className="text-[10px] text-[#333333]">
              Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      <textarea
        value={notes}
        onChange={handleChange}
        placeholder={`Add notes about ${shortlistId ? "this candidate" : "..."} — availability, salary expectation, interview feedback, red flags...`}
        rows={6}
        className={cn(
          "w-full bg-[#0A0A0A] border rounded-xl px-4 py-3 text-sm text-[#FAFAFA]",
          "placeholder-[#333333] focus:outline-none resize-none transition-all leading-relaxed",
          saveState === "error"
            ? "border-[#EF4444]/50 focus:border-[#EF4444]"
            : "border-[#222222] focus:border-[#38BDF8]/50 focus:ring-1 focus:ring-[#38BDF8]/10"
        )}
      />

      <p className="text-[10px] text-[#333333] mt-1.5">
        Auto-saves as you type · Only visible to your team
      </p>
    </div>
  );
}
```

---

## FILE 2 — components/pipeline/StarRating.tsx

```tsx
"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  shortlistId:    string;
  initialRating?: number | null;
  onRatingChange?: (rating: number) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: "Poor fit",
  2: "Below average",
  3: "Good",
  4: "Strong",
  5: "Exceptional",
};

export function StarRating({ shortlistId, initialRating, onRatingChange }: StarRatingProps) {
  const [rating, setRating]   = useState<number | null>(initialRating ?? null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);

  const handleClick = async (star: number) => {
    const newRating = rating === star ? null : star; // click same star = clear
    setRating(newRating);
    setSaving(true);
    await fetch(`/api/shortlist/${shortlistId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: newRating }),
    });
    setSaving(false);
    onRatingChange?.(newRating ?? 0);
  };

  const displayRating = hovered ?? rating ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Rating</span>
        {rating && (
          <span className="text-[10px] text-yellow-400">{RATING_LABELS[rating]}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => handleClick(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            disabled={saving}
            className="p-1 transition-transform hover:scale-110 disabled:opacity-50"
          >
            <Star
              className={cn(
                "w-5 h-5 transition-colors",
                star <= displayRating
                  ? "text-yellow-400 fill-yellow-400"
                  : "text-[#333333]"
              )}
            />
          </button>
        ))}
        {rating && (
          <span className="text-[10px] text-[#555555] ml-1">{rating}/5</span>
        )}
      </div>
    </div>
  );
}
```

---

## FILE 3 — components/pipeline/ActivityTimeline.tsx

```tsx
"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight, Mail, Phone, MessageCircle,
  Star, UserCheck, Clock, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_CONFIG, PipelineStage } from "@/lib/pipeline/stages";

interface ActivityEvent {
  id:          string;
  action_type: string;
  metadata:    Record<string, any>;
  created_at:  string;
  actor_name?: string;
}

function getEventConfig(actionType: string, metadata: Record<string, any>) {
  const configs: Record<string, { icon: any; color: string; label: string }> = {
    stage_changed:        { icon: ArrowRight, color: "text-[#38BDF8]", label: `Moved to ${STAGE_CONFIG[metadata.to_stage as PipelineStage]?.label ?? metadata.to_stage}` },
    reveal_email:         { icon: Mail,       color: "text-green-400",  label: "Email revealed"      },
    reveal_phone:         { icon: Phone,      color: "text-green-400",  label: "Phone revealed"      },
    whatsapp_click:       { icon: MessageCircle, color: "text-[#25D366]", label: "WhatsApp message sent" },
    shortlist_added:      { icon: UserCheck,  color: "text-[#38BDF8]",  label: "Added to shortlist"  },
    rating_updated:       { icon: Star,       color: "text-yellow-400", label: `Rated ${metadata.rating}/5` },
  };
  return configs[actionType] ?? { icon: Clock, color: "text-[#555555]", label: actionType };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface ActivityTimelineProps {
  candidateId: string;
  projectId:   string;
}

export function ActivityTimeline({ candidateId, projectId }: ActivityTimelineProps) {
  const [events, setEvents]   = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!candidateId) return;
    setLoading(true);
    fetch(`/api/activity?candidate_id=${candidateId}&project_id=${projectId}`)
      .then(r => r.json())
      .then(data => { setEvents(data.events ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [candidateId, projectId]);

  return (
    <div>
      <span className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">
        Activity
      </span>

      {loading && (
        <div className="flex items-center gap-2 mt-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#333333]" />
          <span className="text-xs text-[#333333]">Loading activity...</span>
        </div>
      )}

      {!loading && events.length === 0 && (
        <p className="text-xs text-[#333333] mt-3">No activity recorded yet.</p>
      )}

      {!loading && events.length > 0 && (
        <div className="mt-3 space-y-0">
          {events.map((event, idx) => {
            const cfg  = getEventConfig(event.action_type, event.metadata ?? {});
            const Icon = cfg.icon;
            const isLast = idx === events.length - 1;

            return (
              <div key={event.id} className="flex gap-3">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                    "bg-[#111111] border border-[#222222]"
                  )}>
                    <Icon className={cn("w-3 h-3", cfg.color)} />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-[#1A1A1A] my-1" />}
                </div>

                {/* Event content */}
                <div className={cn("pb-4 min-w-0 flex-1", isLast && "pb-0")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs text-[#A0A0A0]">{cfg.label}</p>
                    <span className="text-[10px] text-[#333333] flex-shrink-0">
                      {timeAgo(event.created_at)}
                    </span>
                  </div>
                  {event.actor_name && (
                    <p className="text-[10px] text-[#555555] mt-0.5">by {event.actor_name}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

## FILE 4 — components/pipeline/StatusTag.tsx

```tsx
"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CandidateStatus = "available" | "not_looking" | "in_process" | "placed" | null;

const STATUS_OPTIONS: { value: CandidateStatus; label: string; color: string; bg: string }[] = [
  { value: "available",    label: "Available",     color: "text-green-400",  bg: "bg-green-400/10 border-green-400/20"   },
  { value: "not_looking",  label: "Not looking",   color: "text-[#555555]",  bg: "bg-[#1A1A1A] border-[#222222]"         },
  { value: "in_process",   label: "In process",    color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" },
  { value: "placed",       label: "Placed ✓",      color: "text-[#38BDF8]",  bg: "bg-[#38BDF8]/10 border-[#38BDF8]/20"   },
];

interface StatusTagProps {
  shortlistId:    string;
  initialStatus?: CandidateStatus;
}

export function StatusTag({ shortlistId, initialStatus }: StatusTagProps) {
  const [status, setStatus]   = useState<CandidateStatus>(initialStatus ?? null);
  const [open, setOpen]       = useState(false);

  const selected = STATUS_OPTIONS.find(o => o.value === status);

  const handleSelect = async (value: CandidateStatus) => {
    setStatus(value);
    setOpen(false);
    await fetch(`/api/shortlist/${shortlistId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { candidate_status: value } }),
    });
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">
          Candidate Status
        </span>
      </div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
          selected ? `${selected.color} ${selected.bg}` : "text-[#555555] bg-[#111111] border-[#222222] hover:border-[#333333]"
        )}
      >
        {selected?.label ?? "Set status"}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-[#111111] border border-[#333333] rounded-xl shadow-xl w-44 py-1 animate-fade-in">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value ?? "none"}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "w-full text-left px-3 py-2 text-xs transition-colors hover:bg-[#1A1A1A]",
                status === opt.value ? opt.color : "text-[#A0A0A0]"
              )}
            >
              {opt.label}
            </button>
          ))}
          {status && (
            <>
              <div className="h-px bg-[#222222] my-1" />
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2 text-xs text-[#555555] hover:bg-[#1A1A1A] transition-colors"
              >
                Clear status
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## FILE 5 — app/api/activity/route.ts  (GET — fetch activity for candidate)

Add GET handler to the existing activity route:

```typescript
// Add to existing app/api/activity/route.ts:

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const candidateId = searchParams.get("candidate_id");
  const projectId   = searchParams.get("project_id");

  if (!candidateId) return NextResponse.json({ error: "candidate_id required" }, { status: 400 });

  const query = supabase
    .from("activity_logs")
    .select(`
      id, action_type, metadata, created_at,
      profiles:user_id ( full_name )
    `)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (projectId) query.eq("project_id", projectId);

  const { data, error: fetchError } = await query;
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const events = (data ?? []).map((e: any) => ({
    id:          e.id,
    action_type: e.action_type,
    metadata:    e.metadata ?? {},
    created_at:  e.created_at,
    actor_name:  e.profiles?.full_name ?? null,
  }));

  return NextResponse.json({ events });
}
```

---

## FILE 6 — Updated CandidateSlideOver Notes Tab
Replace the plain Notes tab content in task 01 with all 4 components:

```tsx
// In CandidateSlideOver.tsx — Notes tab:
{tab === "notes" && (
  <div className="space-y-6 animate-fade-in">
    <StarRating
      shortlistId={localCandidate.shortlist_id}
      initialRating={localCandidate.rating}
    />
    <div className="h-px bg-[#1A1A1A]" />
    <StatusTag
      shortlistId={localCandidate.shortlist_id}
      initialStatus={localCandidate.candidate_status}
    />
    <div className="h-px bg-[#1A1A1A]" />
    <NotesEditor
      shortlistId={localCandidate.shortlist_id}
      initialNotes={localCandidate.notes}
    />
    <div className="h-px bg-[#1A1A1A]" />
    <ActivityTimeline
      candidateId={localCandidate.candidate_id}
      projectId={localCandidate.shortlisted_project_id}
    />
  </div>
)}
```

---

## COMPLETION CHECKLIST
- [ ] NotesEditor: auto-saves after 1.5s debounce, shows saving/saved/error state
- [ ] NotesEditor: saves on component unmount if dirty
- [ ] StarRating: click same star clears rating (toggles off), saves via PATCH
- [ ] RATING_LABELS: shows label text next to stars (e.g. "Strong" for 4)
- [ ] ActivityTimeline: fetches from GET /api/activity?candidate_id=&project_id=
- [ ] ActivityTimeline: stage_changed, reveal_email, whatsapp_click events shown
- [ ] StatusTag: 4 options (Available/Not looking/In process/Placed), clearable
- [ ] All 4 components wired into CandidateSlideOver Notes tab
- [ ] GET /api/activity: returns events with actor name, ordered newest-first

## BUILD LOG ENTRY
## M05-03 Notes and Status — [date]
### Files: NotesEditor, StarRating, ActivityTimeline, StatusTag, GET /api/activity
### M05 COMPLETE ✅ — all 3 files done
### Status: ✅ Complete
