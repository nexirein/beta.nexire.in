<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/sequences.md       ← this module's API contract
-->

# M06 — TASK 01: SEQUENCE BUILDER UI
# Trae: Read CLAUDE.md first.
# The Sequence Builder lets recruiters create multi-step email drip campaigns.
# Each step has: delay (days), subject, body (with {{variables}}), and send conditions.
# Sequences are reusable templates that can be enrolled into from any project.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the Sequence Builder UI:
1. /sequences page — list all sequences + create new button
2. SequenceBuilderPage — drag-to-reorder steps, add/remove steps
3. StepEditor — rich subject + body with variable insertion
4. Variable picker: {{first_name}}, {{company}}, {{job_title}}, {{recruiter_name}}
5. Step delay picker: 0 (immediately), 1, 2, 3, 5, 7, 14 days
6. Preview panel — shows rendered email with sample data
7. DB schema: sequences + sequence_steps tables

---

## DB SCHEMA — Run in Supabase SQL Editor

```sql
CREATE TABLE sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  step_count   INTEGER NOT NULL DEFAULT 0,
  enrolled_count INTEGER NOT NULL DEFAULT 0,
  reply_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sequence_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_number     INTEGER NOT NULL,
  delay_days      INTEGER NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  body_text       TEXT NOT NULL,   -- plain text fallback
  send_condition  TEXT NOT NULL DEFAULT 'always'
                  CHECK (send_condition IN ('always', 'no_reply', 'no_open')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sequence_id, step_number)
);

-- RLS
ALTER TABLE sequences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage sequences"
  ON sequences USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members manage sequence steps"
  ON sequence_steps USING (
    sequence_id IN (SELECT id FROM sequences WHERE org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    ))
  );
```

---

## FILE 1 — app/(app)/sequences/page.tsx

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SequencesClient } from "./SequencesClient";

export default async function SequencesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: sequences } = await supabase
    .from("sequences")
    .select("id, title, description, status, step_count, enrolled_count, reply_count, created_at")
    .eq("org_id", profile?.org_id)
    .order("created_at", { ascending: false });

  return <SequencesClient sequences={sequences ?? []} />;
}
```

---

## FILE 2 — app/(app)/sequences/SequencesClient.tsx

```tsx
"use client";
import { useState } from "react";
import { Plus, Mail, Users, MessageSquare, Play, Pause, Archive, MoreHorizontal, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_BADGE: Record<string, string> = {
  draft:    "text-[#555555] bg-[#1A1A1A] border-[#222222]",
  active:   "text-green-400 bg-green-400/10 border-green-400/20",
  paused:   "text-orange-400 bg-orange-400/10 border-orange-400/20",
  archived: "text-[#333333] bg-[#111111] border-[#222222]",
};

interface SequenceRow {
  id: string; title: string; description: string | null;
  status: string; step_count: number; enrolled_count: number;
  reply_count: number; created_at: string;
}

export function SequencesClient({ sequences }: { sequences: SequenceRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const createSequence = async () => {
    setCreating(true);
    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Sequence" }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) router.push(`/sequences/${data.id}/edit`);
    else toast.error("Failed to create sequence");
  };

  const replyRate = (s: SequenceRow) =>
    s.enrolled_count > 0 ? Math.round((s.reply_count / s.enrolled_count) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA]">Email Sequences</h1>
          <p className="text-sm text-[#555555] mt-1">Automate outreach with multi-step drip campaigns</p>
        </div>
        <button
          onClick={createSequence}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium rounded-xl hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all disabled:opacity-60 shadow-glow-blue-sm"
        >
          <Plus className="w-4 h-4" />
          {creating ? "Creating..." : "New sequence"}
        </button>
      </div>

      {/* Empty state */}
      {sequences.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#222222] flex items-center justify-center mb-5">
            <Mail className="w-8 h-8 text-[#333333]" />
          </div>
          <h3 className="text-base font-semibold text-[#FAFAFA] mb-2">No sequences yet</h3>
          <p className="text-sm text-[#555555] max-w-xs mb-6">
            Create an email sequence to automate follow-ups and increase reply rates.
          </p>
          <button onClick={createSequence} className="flex items-center gap-2 text-sm text-[#38BDF8] hover:text-[#0EA5E9] transition-colors">
            <Plus className="w-4 h-4" /> Create your first sequence
          </button>
        </div>
      )}

      {/* Sequence cards */}
      <div className="space-y-3">
        {sequences.map(seq => (
          <div
            key={seq.id}
            onClick={() => router.push(`/sequences/${seq.id}/edit`)}
            className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5 hover:border-[#333333] transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <h3 className="text-sm font-semibold text-[#FAFAFA] truncate">{seq.title}</h3>
                  <span className={cn(
                    "flex-shrink-0 text-[10px] px-2 py-0.5 rounded-md border font-medium",
                    STATUS_BADGE[seq.status]
                  )}>
                    {seq.status.charAt(0).toUpperCase() + seq.status.slice(1)}
                  </span>
                </div>
                {seq.description && (
                  <p className="text-xs text-[#555555] truncate">{seq.description}</p>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-[#1A1A1A]">
              <div className="flex items-center gap-1.5 text-xs text-[#555555]">
                <Mail className="w-3.5 h-3.5" />
                <span>{seq.step_count} step{seq.step_count !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#555555]">
                <Users className="w-3.5 h-3.5" />
                <span>{seq.enrolled_count} enrolled</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#555555]">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{replyRate(seq)}% reply rate</span>
              </div>
              {seq.enrolled_count > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-24 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] rounded-full"
                      style={{ width: `${replyRate(seq)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## FILE 3 — app/(app)/sequences/[id]/edit/page.tsx + SequenceBuilderClient.tsx

```tsx
// app/(app)/sequences/[id]/edit/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SequenceBuilderClient } from "./SequenceBuilderClient";

export default async function SequenceEditPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: sequence } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!sequence) notFound();

  const { data: steps } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", params.id)
    .order("step_number");

  return <SequenceBuilderClient sequence={sequence} initialSteps={steps ?? []} />;
}
```

```tsx
// app/(app)/sequences/[id]/edit/SequenceBuilderClient.tsx
"use client";
import { useState, useCallback } from "react";
import { Plus, Save, Play, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SequenceStepEditor } from "@/components/sequences/SequenceStepEditor";
import { SequencePreviewPanel } from "@/components/sequences/SequencePreviewPanel";
import { cn } from "@/lib/utils";

const DELAY_OPTIONS = [
  { value: 0,  label: "Immediately"  },
  { value: 1,  label: "After 1 day"  },
  { value: 2,  label: "After 2 days" },
  { value: 3,  label: "After 3 days" },
  { value: 5,  label: "After 5 days" },
  { value: 7,  label: "After 1 week" },
  { value: 14, label: "After 2 weeks"},
];

export interface SequenceStep {
  id?:            string;
  step_number:    number;
  delay_days:     number;
  subject:        string;
  body_html:      string;
  body_text:      string;
  send_condition: "always" | "no_reply" | "no_open";
  isNew?:         boolean;
}

export function SequenceBuilderClient({ sequence, initialSteps }: { sequence: any; initialSteps: any[] }) {
  const router = useRouter();
  const [title, setTitle]         = useState(sequence.title);
  const [steps, setSteps]         = useState<SequenceStep[]>(
    initialSteps.length > 0
      ? initialSteps
      : [{ step_number: 1, delay_days: 0, subject: "", body_html: "", body_text: "", send_condition: "always", isNew: true }]
  );
  const [activeStep, setActiveStep] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [activating, setActivating] = useState(false);

  const updateStep = useCallback((idx: number, updates: Partial<SequenceStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  }, []);

  const addStep = () => {
    const newStep: SequenceStep = {
      step_number:    steps.length + 1,
      delay_days:     3,
      subject:        "",
      body_html:      "",
      body_text:      "",
      send_condition: "no_reply",
      isNew:          true,
    };
    setSteps(prev => [...prev, newStep]);
    setActiveStep(steps.length);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) { toast.error("A sequence needs at least one step"); return; }
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
    setActiveStep(Math.min(activeStep, steps.length - 2));
  };

  const saveSequence = async () => {
    if (!title.trim()) { toast.error("Give your sequence a title"); return; }
    const invalidStep = steps.find(s => !s.subject.trim() || !s.body_html.trim());
    if (invalidStep) { toast.error(`Step ${invalidStep.step_number} is missing subject or body`); return; }

    setSaving(true);
    const res = await fetch(`/api/sequences/${sequence.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, steps }),
    });
    setSaving(false);
    if (res.ok) toast.success("Sequence saved");
    else toast.error("Failed to save");
  };

  const activateSequence = async () => {
    await saveSequence();
    setActivating(true);
    const res = await fetch(`/api/sequences/${sequence.id}/activate`, { method: "POST" });
    setActivating(false);
    if (res.ok) { toast.success("Sequence is now active!"); router.refresh(); }
    else toast.error("Failed to activate");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      {/* Top bar */}
      <div className="border-b border-[#1A1A1A] bg-[#0D0D0D] px-6 py-3 flex items-center gap-4">
        <button onClick={() => router.push("/sequences")} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-[#FAFAFA] placeholder-[#333333] focus:outline-none max-w-xs"
          placeholder="Sequence title..."
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#222222] text-xs text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? "Hide preview" : "Preview"}
          </button>
          <button
            onClick={saveSequence} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#222222] text-xs text-[#A0A0A0] hover:border-[#333333] hover:text-[#FAFAFA] transition-all disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save draft"}
          </button>
          <button
            onClick={activateSequence} disabled={activating || sequence.status === "active"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-xs font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {sequence.status === "active" ? "Active" : activating ? "Activating..." : "Activate"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Step list sidebar */}
        <div className="w-56 border-r border-[#1A1A1A] bg-[#0D0D0D] flex flex-col">
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {steps.map((step, idx) => (
              <button
                key={idx}
                onClick={() => setActiveStep(idx)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all",
                  activeStep === idx
                    ? "bg-[#1A1A1A] border border-[#333333]"
                    : "hover:bg-[#111111] border border-transparent"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                  activeStep === idx ? "bg-[#38BDF8] text-white" : "bg-[#222222] text-[#555555]"
                )}>
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#A0A0A0] truncate">
                    {step.subject || "No subject"}
                  </p>
                  <p className="text-[10px] text-[#555555]">
                    {idx === 0 ? "Immediately" : `Day ${steps.slice(0, idx + 1).reduce((sum, s) => sum + s.delay_days, 0)}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-[#1A1A1A]">
            <button
              onClick={addStep}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[#333333] text-xs text-[#555555] hover:text-[#A0A0A0] hover:border-[#444444] transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add step
            </button>
          </div>
        </div>

        {/* Step editor main area */}
        <div className={cn("flex-1 overflow-y-auto", showPreview && "max-w-[55%]")}>
          {steps[activeStep] && (
            <SequenceStepEditor
              step={steps[activeStep]}
              stepIndex={activeStep}
              totalSteps={steps.length}
              delayOptions={DELAY_OPTIONS}
              onUpdate={(updates) => updateStep(activeStep, updates)}
              onRemove={() => removeStep(activeStep)}
            />
          )}
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="flex-1 border-l border-[#1A1A1A] overflow-y-auto">
            <SequencePreviewPanel step={steps[activeStep]} />
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## FILE 4 — components/sequences/SequenceStepEditor.tsx

```tsx
"use client";
import { useRef } from "react";
import { Trash2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SequenceStep } from "@/app/(app)/sequences/[id]/edit/SequenceBuilderClient";

const VARIABLES = [
  { token: "{{first_name}}",    label: "First name"     },
  { token: "{{full_name}}",     label: "Full name"      },
  { token: "{{company}}",       label: "Company"        },
  { token: "{{job_title}}",     label: "Job title"      },
  { token: "{{recruiter_name}}",label: "Recruiter name" },
  { token: "{{sequence_title}}",label: "Sequence title" },
];

const CONDITION_OPTIONS = [
  { value: "always",   label: "Always send"                        },
  { value: "no_reply", label: "Only if no reply to previous step"  },
  { value: "no_open",  label: "Only if previous step not opened"   },
];

interface Props {
  step:         SequenceStep;
  stepIndex:    number;
  totalSteps:   number;
  delayOptions: { value: number; label: string }[];
  onUpdate:     (updates: Partial<SequenceStep>) => void;
  onRemove:     () => void;
}

export function SequenceStepEditor({ step, stepIndex, totalSteps, delayOptions, onUpdate, onRemove }: Props) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (token: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const newBody = step.body_html.slice(0, start) + token + step.body_html.slice(end);
    onUpdate({ body_html: newBody, body_text: newBody.replace(/<[^>]+>/g, "") });
    setTimeout(() => {
      el.selectionStart = start + token.length;
      el.selectionEnd   = start + token.length;
      el.focus();
    }, 0);
  };

  return (
    <div className="px-6 py-6 space-y-5 max-w-2xl">
      {/* Step header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center text-xs font-bold text-[#38BDF8]">
            {stepIndex + 1}
          </div>
          <h2 className="text-sm font-semibold text-[#FAFAFA]">
            Step {stepIndex + 1} {stepIndex === 0 ? "· Initial email" : "· Follow-up"}
          </h2>
        </div>
        {totalSteps > 1 && (
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 text-xs text-[#555555] hover:text-[#EF4444] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove step
          </button>
        )}
      </div>

      {/* Delay selector */}
      {stepIndex > 0 && (
        <div>
          <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-2">
            Send timing
          </label>
          <div className="relative w-52">
            <select
              value={step.delay_days}
              onChange={e => onUpdate({ delay_days: Number(e.target.value) })}
              className="w-full appearance-none bg-[#111111] border border-[#333333] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 cursor-pointer"
            >
              {delayOptions.filter(o => o.value > 0).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555] pointer-events-none" />
          </div>
        </div>
      )}

      {/* Send condition */}
      {stepIndex > 0 && (
        <div>
          <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-2">
            Send condition
          </label>
          <div className="space-y-2">
            {CONDITION_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name={`condition-${stepIndex}`}
                  value={opt.value}
                  checked={step.send_condition === opt.value}
                  onChange={() => onUpdate({ send_condition: opt.value as any })}
                  className="w-3.5 h-3.5 accent-[#38BDF8]"
                />
                <span className="text-xs text-[#A0A0A0]">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Subject */}
      <div>
        <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-2">
          Subject line
        </label>
        <input
          value={step.subject}
          onChange={e => onUpdate({ subject: e.target.value })}
          placeholder="Exciting opportunity at {{company}} — {{job_title}}"
          className="w-full bg-[#111111] border border-[#333333] rounded-xl px-4 py-3 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
        />
      </div>

      {/* Variable picker */}
      <div>
        <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium mb-2">Insert variable</p>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES.map(v => (
            <button
              key={v.token}
              onClick={() => insertVariable(v.token)}
              className="px-2.5 py-1 rounded-lg bg-[#111111] border border-[#222222] text-[11px] text-[#A0A0A0] hover:border-[#38BDF8]/40 hover:text-[#38BDF8] transition-all font-mono"
            >
              {v.token}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-2">
          Email body
        </label>
        <textarea
          ref={bodyRef}
          value={step.body_html}
          onChange={e => onUpdate({ body_html: e.target.value, body_text: e.target.value })}
          placeholder={`Hi {{first_name}},

I came across your profile on LinkedIn and wanted to reach out about an exciting ${stepIndex === 0 ? "opportunity" : "follow-up"} at {{company}}...

Would you be open to a quick call?

Best,
{{recruiter_name}}`}
          rows={12}
          className="w-full bg-[#111111] border border-[#333333] rounded-xl px-4 py-3 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 resize-none transition-all leading-relaxed font-mono"
        />
        <p className="text-[10px] text-[#333333] mt-1.5">
          Plain text format. Variables will be replaced when sent.
        </p>
      </div>
    </div>
  );
}
```

---

## FILE 5 — components/sequences/SequencePreviewPanel.tsx

```tsx
"use client";
import { Mail } from "lucide-react";
import { SequenceStep } from "@/app/(app)/sequences/[id]/edit/SequenceBuilderClient";

const SAMPLE_VARS: Record<string, string> = {
  "{{first_name}}":     "Rahul",
  "{{full_name}}":      "Rahul Sharma",
  "{{company}}":        "Razorpay",
  "{{job_title}}":      "Senior Backend Engineer",
  "{{recruiter_name}}": "Bipul",
  "{{sequence_title}}": "Backend Engineers Outreach",
};

function renderTemplate(text: string): string {
  let result = text;
  Object.entries(SAMPLE_VARS).forEach(([token, value]) => {
    result = result.replaceAll(token, value);
  });
  return result;
}

export function SequencePreviewPanel({ step }: { step: SequenceStep | null }) {
  if (!step) return null;

  const subject = renderTemplate(step.subject || "No subject");
  const body    = renderTemplate(step.body_html || "No content yet.");

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="w-4 h-4 text-[#555555]" />
        <span className="text-xs font-medium text-[#555555] uppercase tracking-wider">Email preview</span>
        <span className="text-[10px] text-[#333333] ml-auto">Sample data</span>
      </div>

      {/* Email mock */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl overflow-hidden">
        {/* Email header */}
        <div className="px-5 py-4 border-b border-[#1A1A1A] space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#555555] w-12">From:</span>
            <span className="text-xs text-[#A0A0A0]">Bipul (via Nexire) &lt;outreach@nexire.in&gt;</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#555555] w-12">To:</span>
            <span className="text-xs text-[#A0A0A0]">rahul.sharma@razorpay.com</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[10px] text-[#555555] w-12">Subject:</span>
            <span className="text-xs font-semibold text-[#FAFAFA]">{subject}</span>
          </div>
        </div>
        {/* Email body */}
        <div className="px-5 py-5">
          <pre className="text-sm text-[#A0A0A0] whitespace-pre-wrap font-sans leading-relaxed">
            {body}
          </pre>
        </div>
        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1A1A1A]">
          <p className="text-[10px] text-[#333333]">
            Sent via Nexire · Unsubscribe
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

## API ROUTES NEEDED (stubs — built in task 02)

```
POST   /api/sequences                     — create new sequence
GET    /api/sequences                     — list sequences for org
PATCH  /api/sequences/[id]               — update title + save steps
POST   /api/sequences/[id]/activate      — set status = active
POST   /api/sequences/[id]/pause         — set status = paused
DELETE /api/sequences/[id]               — archive
```

---

## COMPLETION CHECKLIST
- [ ] sequences + sequence_steps tables created with RLS
- [ ] /sequences page lists all sequences with stats
- [ ] SequenceBuilderClient: step sidebar + editor + preview panel
- [ ] SequenceStepEditor: subject, body, delay, send condition
- [ ] Variable tokens insertable at cursor position
- [ ] SequencePreviewPanel: renders email with sample data
- [ ] Step 1 delay = "Immediately" (not configurable)
- [ ] Steps 2+ have send condition selector (always / no_reply / no_open)
- [ ] Activate button saves draft then activates

## BUILD LOG ENTRY
## M06-01 Sequence Builder UI — [date]
### Files: sequences page, SequenceBuilderClient, StepEditor, PreviewPanel
### Status: ✅ Complete
