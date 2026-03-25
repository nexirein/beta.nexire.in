<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/sequences.md       ← this module's API contract
-->

# M06 — TASK 05: REPLY DETECTION WEBHOOK
# Trae: Read CLAUDE.md first.
# When a candidate replies to a sequence email, Nexire must:
# 1. Stop sending further steps to that candidate
# 2. Notify the recruiter (in-app + email notification)
# 3. Mark the enrollment as "replied" in the DB
# 4. Update sequence reply_count stat
# Resend sends webhooks for: email.delivered, email.opened, email.clicked, email.bounced
# Inbound replies use Resend's inbound email feature OR a catch-all inbox webhook.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build reply detection + email event tracking:
1. POST /api/webhooks/resend — handles all Resend webhook events
2. Webhook signature verification (Svix)
3. Handle: email.delivered, email.opened, email.clicked, email.bounced, email.complained
4. Handle inbound reply: mark enrollment replied, notify recruiter
5. POST /api/unsubscribe/[token] — one-click unsubscribe
6. GET  /unsubscribe/[token] — unsubscribe confirmation page

---

## INSTALL
```bash
npm install svix
```

## ENV VARS
```
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

---

## FILE 1 — app/api/webhooks/resend/route.ts  (main webhook handler)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServiceClient } from "@/lib/supabase/service";
import { handleEmailDelivered, handleEmailOpened, handleEmailClicked,
         handleEmailBounced, handleEmailComplaints, handleInboundReply } from "@/lib/sequences/webhook-handlers";

export const runtime = "edge";  // faster cold starts for webhooks

// Required: disable body parsing (raw body needed for signature verification)
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // Verify Svix signature
  const payload    = await req.text();
  const headers    = {
    "svix-id":        req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: any;
  try {
    const wh = new Webhook(webhookSecret);
    event    = wh.verify(payload, headers) as any;
  } catch (err) {
    console.error("[WEBHOOK] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase   = createServiceClient();
  const { type, data } = event;

  console.log(`[WEBHOOK] Received: ${type}`, data?.email_id);

  try {
    switch (type) {
      case "email.delivered":   await handleEmailDelivered(supabase, data);   break;
      case "email.opened":      await handleEmailOpened(supabase, data);      break;
      case "email.clicked":     await handleEmailClicked(supabase, data);     break;
      case "email.bounced":     await handleEmailBounced(supabase, data);     break;
      case "email.complained":  await handleEmailComplaints(supabase, data);  break;
      case "inbound.email":     await handleInboundReply(supabase, data);     break;
      default:
        console.log(`[WEBHOOK] Unhandled event type: ${type}`);
    }
  } catch (err) {
    console.error(`[WEBHOOK] Error handling ${type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

---

## FILE 2 — lib/sequences/webhook-handlers.ts

```typescript
// Finds sequence_email_logs row by resend message id
async function findEmailLog(supabase: any, resendId: string) {
  const { data } = await supabase
    .from("sequence_email_logs")
    .select("id, enrollment_id, sequence_id")
    .eq("resend_id", resendId)
    .maybeSingle();
  return data;
}

// ── email.delivered ────────────────────────────────────────────
export async function handleEmailDelivered(supabase: any, data: any) {
  const log = await findEmailLog(supabase, data.email_id);
  if (!log) return;
  await supabase.from("sequence_email_logs")
    .update({ status: "delivered" })
    .eq("id", log.id);
}

// ── email.opened ───────────────────────────────────────────────
export async function handleEmailOpened(supabase: any, data: any) {
  const log = await findEmailLog(supabase, data.email_id);
  if (!log) return;

  const now = new Date().toISOString();
  await supabase.from("sequence_email_logs")
    .update({ status: "opened", opened_at: now })
    .eq("id", log.id)
    .is("opened_at", null);  // only update first open

  // Increment enrollment open count
  await supabase.rpc("increment_enrollment_opens", { p_enrollment_id: log.enrollment_id });
}

// ── email.clicked ──────────────────────────────────────────────
export async function handleEmailClicked(supabase: any, data: any) {
  const log = await findEmailLog(supabase, data.email_id);
  if (!log) return;

  const now = new Date().toISOString();
  await supabase.from("sequence_email_logs")
    .update({ status: "clicked", clicked_at: now })
    .eq("id", log.id)
    .is("clicked_at", null);

  await supabase.rpc("increment_enrollment_clicks", { p_enrollment_id: log.enrollment_id });
}

// ── email.bounced ──────────────────────────────────────────────
export async function handleEmailBounced(supabase: any, data: any) {
  const log = await findEmailLog(supabase, data.email_id);
  if (!log) return;

  await supabase.from("sequence_email_logs")
    .update({ status: "bounced" }).eq("id", log.id);

  // Stop the enrollment
  await supabase.from("sequence_enrollments")
    .update({ status: "bounced", updated_at: new Date().toISOString() })
    .eq("id", log.enrollment_id);

  // Flag the candidate email as bounced
  await supabase.from("candidates")
    .update({ email_status: "bounced" })
    .eq("id", (await supabase.from("sequence_enrollments")
      .select("candidate_id").eq("id", log.enrollment_id).single()).data?.candidate_id);
}

// ── email.complained (spam report) ────────────────────────────
export async function handleEmailComplaints(supabase: any, data: any) {
  const log = await findEmailLog(supabase, data.email_id);
  if (!log) return;

  await supabase.from("sequence_enrollments")
    .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
    .eq("id", log.enrollment_id);
}

// ── inbound reply ──────────────────────────────────────────────
export async function handleInboundReply(supabase: any, data: any) {
  // Resend inbound: data.from = sender email, data.headers["In-Reply-To"] = original message id
  const replyToMessageId = data.headers?.["in-reply-to"]?.replace(/<|>/g, "");
  if (!replyToMessageId) return;

  const log = await findEmailLog(supabase, replyToMessageId);
  if (!log) return;

  const now = new Date().toISOString();

  // Mark enrollment as replied
  await supabase.from("sequence_enrollments")
    .update({
      status:     "replied",
      replied_at: now,
      updated_at: now,
    })
    .eq("id", log.enrollment_id);

  // Update sequence reply_count
  await supabase.rpc("increment_sequence_replies", { p_sequence_id: log.sequence_id });

  // Fetch enrollment + candidate for notification
  const { data: enrollment } = await supabase
    .from("sequence_enrollments")
    .select(`
      enrolled_by,
      candidates:candidate_id ( full_name, email )
    `)
    .eq("id", log.enrollment_id)
    .single();

  if (!enrollment?.enrolled_by) return;

  // Create in-app notification
  await supabase.from("notifications").insert({
    user_id:  enrollment.enrolled_by,
    type:     "sequence_reply",
    title:    `${enrollment.candidates?.full_name ?? "A candidate"} replied`,
    body:     `They replied to your sequence email.`,
    metadata: {
      enrollment_id: log.enrollment_id,
      candidate_name: enrollment.candidates?.full_name,
      reply_from:    data.from,
    },
    is_read:  false,
  });
}
```

---

## FILE 3 — Supabase SQL: notification table + RPCs

```sql
-- Notifications table
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  metadata   JSONB DEFAULT '{}',
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON notifications
  USING (user_id = auth.uid());

-- RPCs for webhook handlers
CREATE OR REPLACE FUNCTION increment_enrollment_opens(p_enrollment_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE sequence_enrollments SET emails_opened = emails_opened + 1 WHERE id = p_enrollment_id;
END; $$;

CREATE OR REPLACE FUNCTION increment_enrollment_clicks(p_enrollment_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE sequence_enrollments SET links_clicked = links_clicked + 1 WHERE id = p_enrollment_id;
END; $$;

CREATE OR REPLACE FUNCTION increment_sequence_replies(p_sequence_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE sequences SET reply_count = reply_count + 1 WHERE id = p_sequence_id;
END; $$;
```

---

## FILE 4 — app/api/unsubscribe/[token]/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient();

  let enrollmentId: string;
  try {
    enrollmentId = Buffer.from(params.token, "base64url").toString("utf-8");
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const { error } = await supabase
    .from("sequence_enrollments")
    .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
    .eq("id", enrollmentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

---

## FILE 5 — app/unsubscribe/[token]/page.tsx

```tsx
import { createServiceClient } from "@/lib/supabase/service";

export default async function UnsubscribePage({ params }: { params: { token: string } }) {
  const supabase = createServiceClient();

  let enrolled = false;
  try {
    const enrollmentId = Buffer.from(params.token, "base64url").toString("utf-8");
    const { error }    = await supabase
      .from("sequence_enrollments")
      .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
      .eq("id", enrollmentId);
    enrolled = !error;
  } catch {}

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">{enrolled ? "✅" : "⚠️"}</div>
        <h1 className="text-lg font-semibold text-[#FAFAFA] mb-2">
          {enrolled ? "Unsubscribed" : "Link expired"}
        </h1>
        <p className="text-sm text-[#555555]">
          {enrolled
            ? "You've been removed from this email sequence. You won't receive any further emails."
            : "This unsubscribe link is invalid or has already been used."}
        </p>
      </div>
    </div>
  );
}
```

---

## RESEND WEBHOOK CONFIG — set in Resend dashboard
```
Webhook URL: https://nexire.in/api/webhooks/resend
Events:
  ✅ email.delivered
  ✅ email.opened
  ✅ email.clicked
  ✅ email.bounced
  ✅ email.complained
  ✅ inbound.email  (if using Resend inbound)
```

---

## COMPLETION CHECKLIST
- [ ] svix installed for webhook signature verification
- [ ] RESEND_WEBHOOK_SECRET in env vars
- [ ] POST /api/webhooks/resend: verifies Svix signature, routes by event type
- [ ] handleEmailOpened: updates sequence_email_logs.opened_at, increments emails_opened
- [ ] handleEmailBounced: stops enrollment, flags candidate email as bounced
- [ ] handleInboundReply: marks enrollment "replied", creates in-app notification
- [ ] increment_sequence_replies RPC updates sequence reply_count
- [ ] notifications table + RLS created
- [ ] POST /api/unsubscribe/[token]: marks enrollment unsubscribed
- [ ] GET /unsubscribe/[token]: confirmation page (no auth required)
- [ ] Webhook URL configured in Resend dashboard

## BUILD LOG ENTRY
## M06-05 Reply Detection Webhook — [date]
### Files: /api/webhooks/resend, webhook-handlers.ts, notifications SQL, unsubscribe pages
### Status: ✅ Complete
