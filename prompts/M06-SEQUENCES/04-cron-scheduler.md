<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/sequences.md       ← this module's API contract
-->

# M06 — TASK 04: CRON SCHEDULER
# Trae: Read CLAUDE.md first.
# The cron job is the engine that drives sequences forward.
# Every 15 minutes, it queries for enrollments whose next_send_at <= NOW(),
# sends the appropriate step email via Resend, then advances the enrollment
# to the next step (or marks it completed).
# Deployed as a Vercel Cron Job (vercel.json config) or QStash.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the sequence cron engine:
1. GET /api/cron/sequences — the cron endpoint (secured with CRON_SECRET)
2. sendPendingEmails() — processes up to 100 enrollments per run
3. Respects send_condition: no_reply, no_open, always
4. Advances current_step after sending OR marks completed
5. Calculates next_send_at based on next step delay_days
6. vercel.json cron config (every 15 minutes)

---

## ENV VARS — add to .env.local + Vercel
```
CRON_SECRET=your_long_random_secret_here
```

---

## FILE 1 — vercel.json  (add to repo root)

```json
{
  "crons": [
    {
      "path": "/api/cron/sequences",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

---

## FILE 2 — app/api/cron/sequences/route.ts  (main cron handler)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { sendPendingEmails } from "@/lib/sequences/cron-processor";

export const maxDuration = 60; // Vercel Pro: up to 300s

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel injects Authorization header)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log(`[CRON] sequences cron started at ${new Date().toISOString()}`);

  const result = await sendPendingEmails();

  const duration = Date.now() - startTime;
  console.log(`[CRON] sequences cron finished in ${duration}ms`, result);

  return NextResponse.json({
    ...result,
    duration_ms: duration,
    timestamp:   new Date().toISOString(),
  });
}
```

---

## FILE 3 — lib/sequences/cron-processor.ts  (core engine)

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { sendSequenceEmail } from "@/lib/resend/send-email";
import { buildUnsubscribeUrl } from "@/lib/resend/template-engine";

const BATCH_SIZE = 100;

export interface CronResult {
  processed:   number;
  sent:        number;
  skipped:     number;
  failed:      number;
  completed:   number;
}

export async function sendPendingEmails(): Promise<CronResult> {
  const supabase = createServiceClient();  // service role — bypasses RLS
  const result: CronResult = { processed: 0, sent: 0, skipped: 0, failed: 0, completed: 0 };
  const now = new Date().toISOString();

  // Fetch enrollments due to send
  const { data: enrollments, error } = await supabase
    .from("sequence_enrollments")
    .select(`
      id, org_id, sequence_id, candidate_id, project_id,
      status, current_step, total_steps, custom_vars,
      emails_sent, last_sent_at, next_send_at,
      candidates:candidate_id ( id, full_name, email, current_title, current_company ),
      sequences:sequence_id ( id, title )
    `)
    .in("status", ["pending", "in_progress"])
    .lte("next_send_at", now)
    .limit(BATCH_SIZE)
    .order("next_send_at", { ascending: true });

  if (error) {
    console.error("[CRON] Failed to fetch enrollments:", error.message);
    return result;
  }

  if (!enrollments?.length) {
    console.log("[CRON] No enrollments due to send.");
    return result;
  }

  for (const enrollment of enrollments) {
    result.processed++;
    const candidate = enrollment.candidates as any;
    const sequence  = enrollment.sequences as any;

    if (!candidate?.email) {
      await markEnrollment(supabase, enrollment.id, "stopped", { notes: "No email address" });
      result.skipped++;
      continue;
    }

    // Fetch the current step
    const { data: step } = await supabase
      .from("sequence_steps")
      .select("id, step_number, delay_days, subject, body_html, body_text, send_condition")
      .eq("sequence_id", enrollment.sequence_id)
      .eq("step_number", enrollment.current_step)
      .single();

    if (!step) {
      await markEnrollment(supabase, enrollment.id, "completed", {});
      result.completed++;
      continue;
    }

    // Check send_condition for non-first steps
    if (step.step_number > 1 && step.send_condition !== "always") {
      const shouldSkip = await checkSendCondition(supabase, enrollment.id, step.send_condition);
      if (shouldSkip) {
        // Skip this step, advance to next
        await advanceToNextStep(supabase, enrollment, step);
        result.skipped++;
        continue;
      }
    }

    // Fetch recruiter info for template vars
    const { data: recruiter } = await supabase
      .from("profiles")
      .select("full_name, email:id")
      .eq("org_id", enrollment.org_id)
      .single();

    const vars = {
      first_name:      candidate.full_name?.split(" ")[0] ?? "there",
      full_name:       candidate.full_name ?? "",
      company:         candidate.current_company ?? (enrollment.custom_vars as any)?.company ?? "",
      job_title:       candidate.current_title  ?? (enrollment.custom_vars as any)?.job_title ?? "the role",
      recruiter_name:  recruiter?.full_name ?? "the recruiter",
      recruiter_email: candidate.email,
      sequence_title:  sequence?.title ?? "",
      unsubscribe_url: buildUnsubscribeUrl(enrollment.id),
    };

    // Send email via Resend
    const sendResult = await sendSequenceEmail({
      to:           candidate.email,
      subject:      step.subject,
      bodyText:     step.body_text || step.body_html,
      vars,
      enrollmentId: enrollment.id,
      sequenceId:   enrollment.sequence_id,
      stepId:       step.id,
    });

    if (!sendResult.success) {
      console.error(`[CRON] Failed to send to ${candidate.email}:`, sendResult.error);
      await supabase.from("sequence_enrollments")
        .update({ status: "stopped", updated_at: now })
        .eq("id", enrollment.id);
      result.failed++;
      continue;
    }

    // Log the sent email
    await supabase.from("sequence_email_logs").insert({
      enrollment_id:  enrollment.id,
      sequence_id:    enrollment.sequence_id,
      step_id:        step.id,
      step_number:    step.step_number,
      resend_id:      sendResult.messageId ?? null,
      status:         "sent",
      sent_at:        now,
    });

    // Advance to next step or complete
    await advanceToNextStep(supabase, enrollment, step, now);
    result.sent++;
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────

async function advanceToNextStep(
  supabase: any,
  enrollment: any,
  currentStep: any,
  now: string = new Date().toISOString()
) {
  const nextStepNumber = enrollment.current_step + 1;
  const isLastStep     = nextStepNumber > enrollment.total_steps;

  if (isLastStep) {
    await markEnrollment(supabase, enrollment.id, "completed", {
      last_sent_at:  now,
      emails_sent:   enrollment.emails_sent + 1,
    });
    return;
  }

  // Fetch next step to get delay_days
  const { data: nextStep } = await supabase
    .from("sequence_steps")
    .select("delay_days")
    .eq("sequence_id", enrollment.sequence_id)
    .eq("step_number", nextStepNumber)
    .single();

  const nextSendAt = new Date(now);
  nextSendAt.setDate(nextSendAt.getDate() + (nextStep?.delay_days ?? 1));

  await supabase.from("sequence_enrollments")
    .update({
      status:       "in_progress",
      current_step: nextStepNumber,
      emails_sent:  enrollment.emails_sent + 1,
      last_sent_at: now,
      next_send_at: nextSendAt.toISOString(),
      updated_at:   now,
    })
    .eq("id", enrollment.id);
}

async function markEnrollment(
  supabase: any,
  id: string,
  status: string,
  extra: Record<string, any>
) {
  await supabase.from("sequence_enrollments")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id);
}

async function checkSendCondition(
  supabase: any,
  enrollmentId: string,
  condition: "no_reply" | "no_open"
): Promise<boolean> {  // returns true if should SKIP
  if (condition === "no_reply") {
    const { data } = await supabase
      .from("sequence_enrollments")
      .select("replied_at")
      .eq("id", enrollmentId)
      .single();
    return !!data?.replied_at;  // skip if replied
  }
  if (condition === "no_open") {
    const { count } = await supabase
      .from("sequence_email_logs")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
      .not("opened_at", "is", null);
    return (count ?? 0) > 0;  // skip if opened
  }
  return false;
}
```

---

## FILE 4 — lib/supabase/service.ts  (service role client — no RLS)

```typescript
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

Add to .env.local:
```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## MANUAL TRIGGER (for testing in dev)
Add to package.json scripts:
```json
"trigger-cron": "curl -H 'Authorization: Bearer YOUR_CRON_SECRET' http://localhost:3000/api/cron/sequences"
```

---

## COMPLETION CHECKLIST
- [ ] vercel.json created with */15 cron schedule
- [ ] GET /api/cron/sequences: validates CRON_SECRET, calls sendPendingEmails()
- [ ] cron-processor.ts: fetches up to 100 enrollments with next_send_at <= NOW()
- [ ] Template vars built per candidate (first_name, company, job_title, etc.)
- [ ] Email sent via lib/resend/send-email.ts sendSequenceEmail()
- [ ] sequence_email_logs: insert row per sent email with resend_id
- [ ] advanceToNextStep: sets next_send_at = now + delay_days of NEXT step
- [ ] Last step: status = completed, no next_send_at set
- [ ] checkSendCondition: skips step if candidate replied (no_reply) or opened (no_open)
- [ ] lib/supabase/service.ts: service role client bypasses RLS for cron
- [ ] SUPABASE_SERVICE_ROLE_KEY + CRON_SECRET added to Vercel env vars

## BUILD LOG ENTRY
## M06-04 Cron Scheduler — [date]
### Files: vercel.json, /api/cron/sequences, lib/sequences/cron-processor.ts, lib/supabase/service.ts
### Status: ✅ Complete

