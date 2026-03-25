<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/contacts.md        ← this module's API contract
-->

# M08 — TASK 04: CONTACT ACTIVITY TIMELINE  [ADDED — power user feature]
# Trae: Read CLAUDE.md first.
# Recruiters need a per-contact history: every call, email, meeting, and note.
# The activity timeline lives inside a ContactProfileSlideover panel that
# slides in from the right when you click any contact row.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build contact activity timeline + profile slideover:
1. contact_activities table (DB schema)
2. ContactProfileSlideover — slides in on contact row click
3. ActivityTimeline — sorted list of activities per contact
4. LogActivityForm — log a call/email/meeting/note inline
5. GET /api/contacts/[id] — fetch contact + activities
6. POST /api/contacts/[id]/activities — log a new activity

---

## FILE 1 — Supabase SQL: contact_activities table

```sql
CREATE TABLE contact_activities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by     UUID NOT NULL REFERENCES auth.users(id),

  type           TEXT NOT NULL
                 CHECK (type IN ('call', 'email', 'meeting', 'note', 'linkedin', 'whatsapp', 'sequence_sent', 'sequence_replied')),
  title          TEXT NOT NULL CHECK (char_length(title) <= 500),
  body           TEXT CHECK (char_length(body) <= 5000),
  outcome        TEXT CHECK (outcome IN ('positive','neutral','negative', NULL)),
  duration_min   INTEGER,  -- call/meeting duration in minutes
  scheduled_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_contact ON contact_activities(contact_id, created_at DESC);
CREATE INDEX idx_activities_org     ON contact_activities(org_id, created_at DESC);

ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage own activities"
  ON contact_activities
  USING  (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

---

## FILE 2 — app/api/contacts/[id]/route.ts  (GET full contact + activities)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: activities } = await supabase
    .from("contact_activities")
    .select("id, type, title, body, outcome, duration_min, created_at, created_by")
    .eq("contact_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ contact, activities: activities ?? [] });
}
```

---

## FILE 3 — app/api/contacts/[id]/activities/route.ts  (POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const ActivitySchema = z.object({
  type:         z.enum(["call","email","meeting","note","linkedin","whatsapp"]),
  title:        z.string().min(1).max(500),
  body:         z.string().max(5000).optional(),
  outcome:      z.enum(["positive","neutral","negative"]).optional(),
  duration_min: z.number().int().min(1).max(480).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ActivitySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: activity, error: insertError } = await supabase
    .from("contact_activities")
    .insert({
      contact_id:  params.id,
      org_id:      profile?.org_id,
      created_by:  user.id,
      ...parsed.data,
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Update contact.last_contacted_at
  await supabase
    .from("contacts")
    .update({ last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", params.id);

  return NextResponse.json(activity, { status: 201 });
}
```

---

## FILE 4 — components/contacts/ContactProfileSlideover.tsx

```tsx
"use client";
import { useEffect, useState } from "react";
import {
  X, Mail, Phone, Linkedin, ExternalLink, MapPin, Building2,
  Tag, Calendar, Edit2, Phone as PhoneIcon, MessageSquare,
  Video, FileText, Send, Globe, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogActivityForm } from "./LogActivityForm";

const TYPE_ICON: Record<string, any> = {
  call:             PhoneIcon,
  email:            Mail,
  meeting:          Video,
  note:             FileText,
  linkedin:         Linkedin,
  whatsapp:         MessageSquare,
  sequence_sent:    Send,
  sequence_replied: MessageSquare,
};

const TYPE_COLOR: Record<string, string> = {
  call:             "text-green-400 bg-green-400/10",
  email:            "text-[#38BDF8] bg-[#38BDF8]/10",
  meeting:          "text-purple-400 bg-purple-400/10",
  note:             "text-yellow-400 bg-yellow-400/10",
  linkedin:         "text-blue-400 bg-blue-400/10",
  whatsapp:         "text-green-400 bg-green-400/10",
  sequence_sent:    "text-[#555555] bg-[#1A1A1A]",
  sequence_replied: "text-[#38BDF8] bg-[#38BDF8]/10",
};

const OUTCOME_BADGE: Record<string, string> = {
  positive: "text-green-400 bg-green-400/10 border-green-400/20",
  neutral:  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  negative: "text-red-400 bg-red-400/10 border-red-400/20",
};

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface Props {
  contactId:  string;
  onClose:    () => void;
  onUpdate:   () => void;
  onEdit:     (contact: any) => void;
}

export function ContactProfileSlideover({ contactId, onClose, onUpdate, onEdit }: Props) {
  const [contact, setContact]       = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showLog, setShowLog]       = useState(false);

  const load = async () => {
    setLoading(true);
    const res  = await fetch(`/api/contacts/${contactId}`);
    const data = await res.json();
    setContact(data.contact);
    setActivities(data.activities ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [contactId]);

  const onActivityLogged = () => { setShowLog(false); load(); onUpdate(); };

  const initials = (contact?.full_name ?? "?")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-20" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[#0D0D0D] border-l border-[#1A1A1A] z-30 shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">

        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1A1A1A] flex-shrink-0">
          {loading ? (
            <div className="h-14 bg-[#111111] rounded-xl animate-pulse" />
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-sm font-bold text-[#555555]">
                  {initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#FAFAFA]">{contact?.full_name}</h2>
                    {contact?.status === "do_not_contact" && (
                      <span className="text-[9px] text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded-md font-medium">DNC</span>
                    )}
                  </div>
                  {contact?.job_title && (
                    <p className="text-xs text-[#555555]">{contact.job_title}{contact?.company && ` @ ${contact.company}`}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { onEdit(contact); onClose(); }}
                  className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {!loading && contact && (
            <>
              {/* Quick contact info */}
              <div className="space-y-2.5">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-2.5 text-sm text-[#38BDF8] hover:underline">
                    <Mail className="w-4 h-4 text-[#555555]" /> {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-2.5 text-sm text-[#A0A0A0] hover:text-[#FAFAFA]">
                    <Phone className="w-4 h-4 text-[#555555]" /> {contact.phone}
                  </a>
                )}
                {contact.linkedin_url && (
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm text-[#A0A0A0] hover:text-[#38BDF8] transition-colors">
                    <ExternalLink className="w-4 h-4 text-[#555555]" /> LinkedIn profile
                  </a>
                )}
                {(contact.city || contact.country) && (
                  <div className="flex items-center gap-2.5 text-sm text-[#555555]">
                    <MapPin className="w-4 h-4" />
                    {[contact.city, contact.country].filter(Boolean).join(", ")}
                  </div>
                )}
                {contact.last_contacted_at && (
                  <div className="flex items-center gap-2.5 text-sm text-[#555555]">
                    <Calendar className="w-4 h-4" />
                    Last contacted {timeAgo(contact.last_contacted_at)}
                  </div>
                )}
              </div>

              {/* Tags */}
              {contact.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map((tag: string) => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-xl bg-[#111111] border border-[#222222] text-[#A0A0A0]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Notes */}
              {contact.notes && (
                <div>
                  <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium mb-2">Notes</p>
                  <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3 text-xs text-[#A0A0A0] leading-relaxed">
                    {contact.notes}
                  </div>
                </div>
              )}

              {/* Log Activity button */}
              <div>
                <button
                  onClick={() => setShowLog(!showLog)}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                    showLog
                      ? "border-[#38BDF8]/30 text-[#38BDF8] bg-[#38BDF8]/5"
                      : "border-dashed border-[#333333] text-[#555555] hover:text-[#A0A0A0] hover:border-[#444444]"
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  {showLog ? "Cancel" : "Log activity"}
                </button>
                {showLog && (
                  <LogActivityForm contactId={contactId} onSaved={onActivityLogged} />
                )}
              </div>

              {/* Activity timeline */}
              <div>
                <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium mb-3">
                  Activity ({activities.length})
                </p>
                {activities.length === 0 ? (
                  <p className="text-xs text-[#333333] text-center py-4">No activity logged yet</p>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-[#1A1A1A]" />
                    <div className="space-y-4">
                      {activities.map(a => {
                        const Icon  = TYPE_ICON[a.type] ?? FileText;
                        const color = TYPE_COLOR[a.type] ?? "text-[#555555] bg-[#1A1A1A]";
                        return (
                          <div key={a.id} className="flex gap-3 relative pl-2">
                            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10 border border-[#1A1A1A]", color)}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 pb-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-medium text-[#FAFAFA] leading-snug">{a.title}</p>
                                <span className="text-[10px] text-[#333333] flex-shrink-0">{timeAgo(a.created_at)}</span>
                              </div>
                              {a.outcome && (
                                <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md border font-medium mt-1 inline-block", OUTCOME_BADGE[a.outcome])}>
                                  {a.outcome.charAt(0).toUpperCase() + a.outcome.slice(1)}
                                </span>
                              )}
                              {a.duration_min && (
                                <span className="text-[10px] text-[#555555] ml-2">{a.duration_min}min</span>
                              )}
                              {a.body && (
                                <p className="text-xs text-[#555555] mt-1 leading-relaxed">{a.body}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
```

---

## FILE 5 — components/contacts/LogActivityForm.tsx

```tsx
"use client";
import { useState } from "react";
import { Phone, Mail, Video, FileText, Linkedin, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ACTIVITY_TYPES = [
  { key: "call",     label: "Call",     icon: Phone       },
  { key: "email",    label: "Email",    icon: Mail        },
  { key: "meeting",  label: "Meeting",  icon: Video       },
  { key: "note",     label: "Note",     icon: FileText    },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin    },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
];

interface Props {
  contactId: string;
  onSaved:   () => void;
}

export function LogActivityForm({ contactId, onSaved }: Props) {
  const [type, setType]       = useState("call");
  const [title, setTitle]     = useState("");
  const [body, setBody]       = useState("");
  const [outcome, setOutcome] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving]   = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Activity title is required"); return; }
    setSaving(true);
    const res = await fetch(`/api/contacts/${contactId}/activities`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        type, title,
        ...(body && { body }),
        ...(outcome && { outcome }),
        ...(duration && { duration_min: Number(duration) }),
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to log activity"); return; }
    toast.success("Activity logged");
    onSaved();
  };

  return (
    <div className="mt-3 bg-[#0A0A0A] border border-[#222222] rounded-xl p-4 space-y-3">
      {/* Type picker */}
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all",
                type === t.key
                  ? "bg-[#38BDF8]/10 border-[#38BDF8]/30 text-[#38BDF8]"
                  : "bg-[#111111] border-[#222222] text-[#555555] hover:text-[#A0A0A0]"
              )}
            >
              <Icon className="w-3 h-3" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={
          type === "call" ? "e.g. Discussed Q2 hiring needs" :
          type === "email" ? "e.g. Sent intro email" :
          type === "meeting" ? "e.g. Discovery call booked" :
          "Add a note..."
        }
        className="w-full bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
      />

      {/* Details row */}
      <div className="flex gap-2">
        {(type === "call" || type === "meeting") && (
          <input
            value={duration}
            onChange={e => setDuration(e.target.value)}
            placeholder="Duration (mins)"
            type="number"
            className="w-32 bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
          />
        )}
        <select
          value={outcome}
          onChange={e => setOutcome(e.target.value)}
          className="flex-1 bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#555555] focus:outline-none focus:border-[#38BDF8]/50 appearance-none"
        >
          <option value="">Outcome (optional)</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
      </div>

      {/* Notes */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Additional notes..."
        rows={2}
        className="w-full bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 resize-none transition-all"
      />

      <button
        onClick={handleSubmit}
        disabled={!title.trim() || saving}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-50 transition-all"
      >
        {saving ? "Saving..." : "Log activity"}
      </button>
    </div>
  );
}
```

---

## Wire ContactProfileSlideover into ContactsClientPage:

```tsx
// In ContactsClientPage.tsx — add state + slideover:
const [slideoverId, setSlideoverId] = useState<string | null>(null);

// In ContactRow — pass onClick:
<ContactRow
  ...
  onOpen={() => setSlideoverId(contact.id)}
/>

// In JSX, after the table:
{slideoverContoverId && (
  <ContactProfileSlideover
    contactId={slideoverId}
    onClose={() => setSlideoverId(null)}
    onUpdate={fetchContacts}
    onEdit={(contact) => { setEditContact(contact); setShowCreate(true); }}
  />
)}
```

---

## COMPLETION CHECKLIST
- [ ] contact_activities table: type (call/email/meeting/note/linkedin/whatsapp), outcome, duration_min
- [ ] GET /api/contacts/[id]: returns contact + 50 most recent activities
- [ ] POST /api/contacts/[id]/activities: logs activity, updates contact.last_contacted_at
- [ ] ContactProfileSlideover: slides in from right on contact row click
- [ ] Profile header: initials, name, job title, DNC badge if applicable
- [ ] Quick contact row: email (mailto), phone (tel), LinkedIn (external)
- [ ] "Log activity" button: expands LogActivityForm inline
- [ ] LogActivityForm: type picker (6 types), title, optional duration/outcome/notes
- [ ] Activity timeline: icon + colour per type, outcome badge, duration, time ago
- [ ] Timeline left-edge decorative line connects all activity dots
- [ ] ContactRow onClick opens slideover (not just edit)
- [ ] sequence_sent + sequence_replied auto-activities (logged by cron/webhook)

## BUILD LOG ENTRY
## M08-04 Contact Activity Timeline — [date]
### Files: contact_activities SQL, /contacts/[id] API, ContactProfileSlideover, LogActivityForm
### M08 COMPLETE ✅ — All 4 files done
### Status: ✅ Complete
