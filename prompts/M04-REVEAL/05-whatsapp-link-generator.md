<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/reveal.md          ← this module's API contract
-->

# M04 — TASK 05: WHATSAPP LINK GENERATOR
# Trae: Read CLAUDE.md first.
# WhatsApp outreach is a PRIMARY communication channel for Indian recruiters.
# Build a full WhatsApp link generator with:
# - Pre-filled message templates (Initial outreach / Follow-up / JD sharing)
# - Template variable substitution (name, role, company)
# - "Copy link" fallback for desktop
# - wa.me link generation
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build WhatsApp outreach feature:
1. WhatsAppButton — opens wa.me with pre-filled message
2. WhatsAppTemplateSelector — choose from 3 message templates
3. Phone number normalisation (handles Indian formats: 9876543210, +919876543210, 09876543210)
4. Desktop fallback: web.whatsapp.com link
5. Analytics event: log whatsapp_click to activity_logs table

---

## FILE 1 — lib/whatsapp/templates.ts

```typescript
export interface WhatsAppTemplate {
  id:    string;
  label: string;
  build: (vars: TemplateVars) => string;
}

export interface TemplateVars {
  candidateName:  string;
  jobTitle?:      string;
  companyName?:   string;
  recruiterName?: string;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id:    "initial_outreach",
    label: "Initial outreach",
    build: ({ candidateName, jobTitle, companyName, recruiterName }) => {
      const firstName = candidateName.split(" ")[0];
      const role = jobTitle ? ` for a *${jobTitle}* role` : " about an exciting opportunity";
      const company = companyName ? ` at *${companyName}*` : "";
      const from = recruiterName ? `

Best,
${recruiterName}` : "";
      return `Hi ${firstName} 👋

I came across your profile on LinkedIn and wanted to reach out${role}${company}.

Would you be open to a quick 10-minute call this week?${from}`;
    },
  },
  {
    id:    "follow_up",
    label: "Follow-up",
    build: ({ candidateName, jobTitle }) => {
      const firstName = candidateName.split(" ")[0];
      const role = jobTitle ? ` for the ${jobTitle} position` : "";
      return `Hi ${firstName}, just following up on my earlier message${role}. 

Would love to connect if you're exploring opportunities. Let me know a convenient time! 🙏`;
    },
  },
  {
    id:    "jd_sharing",
    label: "Share JD",
    build: ({ candidateName, jobTitle, companyName }) => {
      const firstName = candidateName.split(" ")[0];
      const role = jobTitle ? `*${jobTitle}*` : "this role";
      const company = companyName ? ` at ${companyName}` : "";
      return `Hi ${firstName} 👋

Sharing the detailed job description for ${role}${company}. Please take a look and let me know if this interests you.

Looking forward to your response!`;
    },
  },
];

export function normalisePhone(raw: string): string {
  // Strip everything except digits and leading +
  let digits = raw.replace(/[^\d+]/g, "");

  // Already has country code
  if (digits.startsWith("+")) return digits;

  // Indian mobile: 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;

  // Indian with leading 0: 0XXXXXXXXXX
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;

  // Indian with 91 prefix but no +
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;

  // Return as-is if unknown format
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function buildWhatsAppUrl(phone: string, message: string, isMobile = false): string {
  const normalised = normalisePhone(phone);
  const encoded    = encodeURIComponent(message);
  if (isMobile) {
    return `whatsapp://send?phone=${normalised}&text=${encoded}`;
  }
  return `https://wa.me/${normalised.replace("+", "")}?text=${encoded}`;
}
```

---

## FILE 2 — components/reveal/WhatsAppButton.tsx

```tsx
"use client";
import { useState } from "react";
import { MessageCircle, ChevronDown, Copy, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  WHATSAPP_TEMPLATES,
  buildWhatsAppUrl,
  TemplateVars,
} from "@/lib/whatsapp/templates";

interface WhatsAppButtonProps {
  phone:          string;
  candidateName:  string;
  jobTitle?:      string;
  companyName?:   string;
  recruiterName?: string;
  candidateId?:   string;
}

export function WhatsAppButton({
  phone, candidateName, jobTitle, companyName, recruiterName, candidateId,
}: WhatsAppButtonProps) {
  const [expanded, setExpanded]       = useState(false);
  const [selectedTemplate, setSelected] = useState(WHATSAPP_TEMPLATES[0].id);
  const [copied, setCopied]           = useState(false);

  const vars: TemplateVars = { candidateName, jobTitle, companyName, recruiterName };
  const template = WHATSAPP_TEMPLATES.find(t => t.id === selectedTemplate)!;
  const message  = template.build(vars);
  const waUrl    = buildWhatsAppUrl(phone, message);

  const handleOpen = async () => {
    // Log click
    if (candidateId) {
      fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type:  "whatsapp_click",
          candidate_id: candidateId,
          metadata:     { template_id: selectedTemplate },
        }),
      }).catch(() => {}); // fire and forget
    }
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(waUrl);
    setCopied(true);
    toast.success("WhatsApp link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#111111] border border-[#25D366]/20 rounded-xl overflow-hidden">
      {/* Main button row */}
      <div className="flex items-stretch">
        <button
          onClick={handleOpen}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/5 transition-all"
        >
          <MessageCircle className="w-4 h-4" />
          Message on WhatsApp
        </button>
        <div className="w-px bg-[#25D366]/10" />
        <button
          onClick={() => setExpanded(!expanded)}
          title="Choose template"
          className="px-3 text-[#25D366]/60 hover:text-[#25D366] hover:bg-[#25D366]/5 transition-all"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* Expanded: template selector + preview */}
      {expanded && (
        <div className="border-t border-[#25D366]/10 p-4 space-y-3 animate-fade-in">
          {/* Template tabs */}
          <div className="flex flex-wrap gap-1.5">
            {WHATSAPP_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                  selectedTemplate === t.id
                    ? "bg-[#25D366]/15 text-[#25D366]"
                    : "bg-[#1A1A1A] text-[#555555] hover:text-[#A0A0A0]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Message preview */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-3">
            <p className="text-[11px] text-[#555555] mb-1.5 uppercase tracking-wider font-medium">Preview</p>
            <p className="text-xs text-[#A0A0A0] whitespace-pre-line leading-relaxed">
              {message}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleOpen}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#25D366]/10 text-[#25D366] text-xs font-medium hover:bg-[#25D366]/15 transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Open WhatsApp
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#333333] text-[#555555] hover:text-[#A0A0A0] text-xs transition-all"
              title="Copy link (for desktop)"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>

          <p className="text-[10px] text-[#333333] text-center">
            Opens WhatsApp Web on desktop · app on mobile
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## FILE 3 — app/api/activity/route.ts  (Activity logger — used by WhatsApp + other events)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const ActivitySchema = z.object({
  action_type:  z.enum([
    "whatsapp_click", "email_sent", "phone_copied",
    "candidate_viewed", "shortlist_added", "shortlist_status_changed",
  ]),
  candidate_id: z.string().uuid().optional(),
  project_id:   z.string().uuid().optional(),
  shortlist_id: z.string().uuid().optional(),
  metadata:     z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  await supabase.from("activity_logs").insert({
    user_id:      user.id,
    ...parsed.data,
    created_at:   new Date().toISOString(),
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
```

---

## COMPLETION CHECKLIST
- [ ] WHATSAPP_TEMPLATES: 3 templates (initial / follow-up / JD sharing)
- [ ] normalisePhone handles: 10-digit, 0-prefix, 91-prefix, +91-prefix
- [ ] WhatsAppButton: main button opens wa.me, chevron expands template picker
- [ ] Template preview shown before sending
- [ ] "Copy link" fallback for desktop recruiters
- [ ] Activity logged to activity_logs table (fire-and-forget)
- [ ] WhatsApp brand green: #25D366 used throughout

## BUILD LOG ENTRY
## M04-05 WhatsApp Link Generator — [date]
### Files: lib/whatsapp/templates.ts, WhatsAppButton.tsx, api/activity/route.ts
### Status: ✅ Complete
