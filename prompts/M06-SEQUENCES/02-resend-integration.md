<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/sequences.md       ← this module's API contract
-->

# M06 — TASK 02: RESEND INTEGRATION
# Trae: Read CLAUDE.md first.
# Resend is the email sending provider. This file builds:
# - Resend SDK wrapper with retry + error handling
# - Template rendering engine (replace {{variables}} + HTML/text)
# - POST /api/sequences (CRUD API for sequences)
# - POST /api/sequences/[id]/activate | pause
# - Email sending helper used by the cron scheduler (task 04)
# After completion, append to _meta/BUILD-LOG.md

---

## INSTALL
```bash
npm install resend
```

## ENV VARS — add to .env.local + Vercel dashboard
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=outreach@nexire.in
RESEND_FROM_NAME=Nexire Outreach
```

---

## FILE 1 — lib/resend/client.ts

```typescript
import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_ADDRESS = `${process.env.RESEND_FROM_NAME ?? "Nexire"} <${process.env.RESEND_FROM_EMAIL ?? "outreach@nexire.in"}>`;
```

---

## FILE 2 — lib/resend/template-engine.ts

```typescript
export interface TemplateVariables {
  first_name:      string;
  full_name:       string;
  company:         string;
  job_title:       string;
  recruiter_name:  string;
  recruiter_email: string;
  sequence_title:  string;
  unsubscribe_url: string;
}

const TOKEN_MAP: (keyof TemplateVariables)[] = [
  "first_name", "full_name", "company", "job_title",
  "recruiter_name", "recruiter_email", "sequence_title", "unsubscribe_url",
];

export function renderTemplate(template: string, vars: Partial<TemplateVariables>): string {
  let result = template;
  TOKEN_MAP.forEach(key => {
    const value = vars[key] ?? `[${key}]`;
    result = result.replaceAll(`{{${key}}}`, value);
  });
  return result;
}

export function buildEmailHtml(bodyText: string, vars: Partial<TemplateVariables>): string {
  const rendered = renderTemplate(bodyText, vars);

  // Wrap plain text in minimal responsive HTML
  const paragraphs = rendered
    .split("

")
    .map(p => `<p style="margin:0 0 16px 0;color:#e0e0e0;font-size:14px;line-height:1.6;">${
      p.replace(/
/g, "<br/>")
    }</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${renderTemplate(vars.sequence_title ?? "Email", vars)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111111;border-radius:16px;border:1px solid #222222;">
        <!-- Header bar -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#38bdf8,#0ea5e9);border-radius:16px 16px 0 0;"></td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px 24px;">
          ${paragraphs}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 40px 24px;border-top:1px solid #1a1a1a;">
          <p style="margin:0;font-size:11px;color:#555555;">
            Sent via <a href="https://nexire.in" style="color:#38bdf8;text-decoration:none;">Nexire</a> ·
            <a href="${vars.unsubscribe_url ?? "#"}" style="color:#555555;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildUnsubscribeUrl(enrollmentId: string): string {
  const token = Buffer.from(enrollmentId).toString("base64url");
  return `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe/${token}`;
}
```

---

## FILE 3 — lib/resend/send-email.ts

```typescript
import { resend, FROM_ADDRESS } from "./client";
import { buildEmailHtml, renderTemplate, TemplateVariables } from "./template-engine";

export interface SendEmailOptions {
  to:           string;
  subject:      string;
  bodyText:     string;
  vars:         Partial<TemplateVariables>;
  enrollmentId: string;   // used for open tracking + unsubscribe
  sequenceId:   string;
  stepId:       string;
}

export interface SendEmailResult {
  success:  boolean;
  messageId?: string;
  error?:   string;
}

export async function sendSequenceEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const subject  = renderTemplate(opts.subject, opts.vars);
  const htmlBody = buildEmailHtml(opts.bodyText, opts.vars);
  const textBody = renderTemplate(opts.bodyText, opts.vars);

  let attempt = 0;
  const MAX_RETRIES = 2;

  while (attempt <= MAX_RETRIES) {
    try {
      const { data, error } = await resend.emails.send({
        from:    FROM_ADDRESS,
        to:      opts.to,
        subject: subject,
        html:    htmlBody,
        text:    textBody,
        headers: {
          "X-Nexire-Enrollment-Id": opts.enrollmentId,
          "X-Nexire-Step-Id":       opts.stepId,
          "X-Nexire-Sequence-Id":   opts.sequenceId,
          // Custom List-Unsubscribe header for deliverability
          "List-Unsubscribe": `<${opts.vars.unsubscribe_url}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [
          { name: "nexire_sequence", value: opts.sequenceId },
          { name: "nexire_step",     value: opts.stepId     },
        ],
      });

      if (error) {
        if (attempt < MAX_RETRIES && isRetryableError(error.message)) {
          attempt++;
          await sleep(1000 * attempt);
          continue;
        }
        return { success: false, error: error.message };
      }

      return { success: true, messageId: data?.id };
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        attempt++;
        await sleep(1000 * attempt);
        continue;
      }
      return { success: false, error: err.message ?? "Unknown error" };
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

function isRetryableError(message: string): boolean {
  const retryable = ["rate_limit", "503", "502", "timeout", "ECONNRESET"];
  return retryable.some(e => message.toLowerCase().includes(e.toLowerCase()));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## FILE 4 — app/api/sequences/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const CreateSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

// GET — list all sequences for org
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data } = await supabase
    .from("sequences")
    .select("id, title, description, status, step_count, enrolled_count, reply_count, created_at")
    .eq("org_id", profile?.org_id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ sequences: data ?? [] });
}

// POST — create sequence
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data: seq, error: insertError } = await supabase
    .from("sequences")
    .insert({ org_id: profile?.org_id, created_by: user.id, ...parsed.data })
    .select("id").single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(seq, { status: 201 });
}
```

---

## FILE 5 — app/api/sequences/[id]/route.ts  (PATCH — save steps)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const StepSchema = z.object({
  id:             z.string().uuid().optional(),
  step_number:    z.number().int().min(1),
  delay_days:     z.number().int().min(0),
  subject:        z.string().min(1).max(500),
  body_html:      z.string().min(1),
  body_text:      z.string().min(1),
  send_condition: z.enum(["always", "no_reply", "no_open"]),
});

const UpdateSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  steps:       z.array(StepSchema).min(1).max(10).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { steps, ...seqUpdates } = parsed.data;

  // Update sequence metadata
  if (Object.keys(seqUpdates).length > 0) {
    await supabase
      .from("sequences")
      .update({ ...seqUpdates, updated_at: new Date().toISOString() })
      .eq("id", params.id);
  }

  // Replace all steps
  if (steps) {
    await supabase.from("sequence_steps").delete().eq("sequence_id", params.id);
    const { error: stepsError } = await supabase
      .from("sequence_steps")
      .insert(steps.map(s => ({
        sequence_id:    params.id,
        step_number:    s.step_number,
        delay_days:     s.delay_days,
        subject:        s.subject,
        body_html:      s.body_html,
        body_text:      s.body_text,
        send_condition: s.send_condition,
      })));
    if (stepsError) return NextResponse.json({ error: stepsError.message }, { status: 500 });

    // Update step_count on sequence
    await supabase
      .from("sequences")
      .update({ step_count: steps.length })
      .eq("id", params.id);
  }

  return NextResponse.json({ success: true });
}
```

---

## FILE 6 — app/api/sequences/[id]/activate/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify sequence has at least 1 step
  const { count } = await supabase
    .from("sequence_steps")
    .select("id", { count: "exact", head: true })
    .eq("sequence_id", params.id);

  if (!count || count === 0) {
    return NextResponse.json({ error: "Sequence must have at least one step to activate" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("sequences")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true, status: "active" });
}
```

---

## COMPLETION CHECKLIST
- [ ] resend npm package installed
- [ ] RESEND_API_KEY in .env.local + Vercel
- [ ] lib/resend/client.ts — resend singleton
- [ ] template-engine.ts: renderTemplate + buildEmailHtml (responsive dark HTML)
- [ ] buildUnsubscribeUrl: base64url encoded enrollment ID
- [ ] send-email.ts: retry logic (2 retries, exponential backoff)
- [ ] List-Unsubscribe header set for deliverability
- [ ] GET /api/sequences — list org sequences
- [ ] POST /api/sequences — create new sequence
- [ ] PATCH /api/sequences/[id] — save title + steps (replaces all steps)
- [ ] POST /api/sequences/[id]/activate — validates steps exist, sets active

## BUILD LOG ENTRY
## M06-02 Resend Integration — [date]
### Files: lib/resend/* (3 files), sequences API routes (4 files)
### Status: ✅ Complete
