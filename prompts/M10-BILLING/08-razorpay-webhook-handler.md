<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# M10 — TASK 08: RAZORPAY WEBHOOK HANDLER
# Trae: Read CLAUDE.md first.
# Razorpay sends webhooks for subscription events, payment captures,
# failed charges, and credit top-ups for NEXIRE v5.0.
# Route: POST /api/webhooks/razorpay (public, signature-verified)
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. POST /api/webhooks/razorpay — HMAC-verified webhook endpoint
2. Handlers for: payment.captured (Plans & Credits), subscription.charged,
   subscription.cancelled, payment.failed, refund.created
3. lib/billing/webhook-handlers.ts — individual event processors for v5.0 tiers
4. Idempotency: skip already-processed events via billing_events.razorpay_payment_id

---

## FILE 1 — app/api/webhooks/razorpay/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  handlePaymentCaptured,
  handleSubscriptionCharged,
  handleSubscriptionCancelled,
  handlePaymentFailed,
  handleRefundCreated,
} from "@/lib/billing/webhook-handlers";

export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET!;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected !== signature) {
    console.error("[WEBHOOK/RZP] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const event = payload.event as string;
  console.log(`[WEBHOOK/RZP] Event: ${event}`);

  try {
    switch (event) {
      case "payment.captured":
        await handlePaymentCaptured(payload.payload.payment.entity);
        break;
      case "subscription.charged":
        await handleSubscriptionCharged(payload.payload.subscription.entity, payload.payload.payment?.entity);
        break;
      case "subscription.cancelled":
        await handleSubscriptionCancelled(payload.payload.subscription.entity);
        break;
      case "payment.failed":
        await handlePaymentFailed(payload.payload.payment.entity);
        break;
      case "refund.created":
        await handleRefundCreated(payload.payload.refund.entity);
        break;
      default:
        console.log(`[WEBHOOK/RZP] Unhandled event: ${event}`);
    }
  } catch (err) {
    console.error(`[WEBHOOK/RZP] Handler error for ${event}:`, err);
    return NextResponse.json({ received: true, error: "Handler failed" });
  }

  return NextResponse.json({ received: true });
}
```

---

## FILE 2 — lib/billing/webhook-handlers.ts

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import { addCredits } from "@/lib/billing/credits";

const service = createServiceClient();

async function getOrgFromNotes(notes: Record<string, string>): Promise<string | null> {
  if (!notes?.org_id) return null;
  const { data } = await service.from("orgs").select("id").eq("id", notes.org_id).single();
  return data?.id ?? null;
}

async function isAlreadyProcessed(paymentId: string): Promise<boolean> {
  const { data } = await service
    .from("billing_events")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .in("event_type", ["payment_success", "subscription_charged", "credits_topup"])
    .limit(1);
  return (data?.length ?? 0) > 0;
}

const PLAN_MAP: Record<string, { plan_id: string; cycle: string; days: number }> = {
  [process.env.RZP_PLAN_SOLO_M    ?? "plan_solo_m"]:    { plan_id: "solo",   cycle: "monthly", days: 30  },
  [process.env.RZP_PLAN_SOLO_Y    ?? "plan_solo_y"]:    { plan_id: "solo",   cycle: "yearly",  days: 365 },
  [process.env.RZP_PLAN_GROWTH_M  ?? "plan_growth_m"]:  { plan_id: "growth", cycle: "monthly", days: 30  },
  [process.env.RZP_PLAN_GROWTH_Y  ?? "plan_growth_y"]:  { plan_id: "growth", cycle: "yearly",  days: 365 },
};

export async function handlePaymentCaptured(payment: any) {
  if (await isAlreadyProcessed(payment.id)) return;

  const notes = payment.notes ?? {};
  const orgId = await getOrgFromNotes(notes);
  if (!orgId) return;

  // Handle Credit Top-up
  if (notes.type === "credits") {
    const credits = Number(notes.credits ?? 0);
    await addCredits({
      orgId,
      amount: credits,
      type: "topup",
      description: `Purchased ${credits} contact credits`,
      referenceId: payment.id,
    });

    await service.from("billing_events").insert({
      org_id: orgId,
      event_type: "credits_topup",
      amount_paise: payment.amount,
      razorpay_payment_id: payment.id,
      razorpay_order_id: payment.order_id,
      metadata: { credits, bundle_key: notes.bundle_key },
    });
    return;
  }

  // Handle Manual Plan Purchase
  if (notes.plan_id) {
    const planId = notes.plan_id;
    const cycle  = notes.billing_cycle ?? "monthly";
    const days   = cycle === "yearly" ? 365 : 30;
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

    await service.from("orgs").update({
      plan_id: planId,
      billing_cycle: cycle,
      plan_expires_at: expiresAt,
      billing_cancelled_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orgId);

    await service.from("billing_events").insert({
      org_id: orgId,
      event_type: "payment_success",
      plan_id: planId,
      billing_cycle: cycle,
      amount_paise: payment.amount,
      razorpay_payment_id: payment.id,
      razorpay_order_id: payment.order_id,
    });
  }
}

export async function handleSubscriptionCharged(subscription: any, payment: any) {
  if (payment?.id && await isAlreadyProcessed(payment.id)) return;

  const { data: org } = await service.from("orgs").select("id").eq("razorpay_sub_id", subscription.id).single();
  if (!org) return;

  const plan = PLAN_MAP[subscription.plan_id];
  if (!plan) return;

  const expiresAt = new Date(Date.now() + plan.days * 86_400_000).toISOString();
  await service.from("orgs").update({
    plan_id: plan.plan_id,
    billing_cycle: plan.cycle,
    plan_expires_at: expiresAt,
    billing_cancelled_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", org.id);

  await service.from("billing_events").insert({
    org_id: org.id,
    event_type: "subscription_charged",
    plan_id: plan.plan_id,
    billing_cycle: plan.cycle,
    amount_paise: payment?.amount ?? 0,
    razorpay_payment_id: payment?.id ?? null,
    razorpay_order_id: payment?.order_id ?? null,
  });
}

export async function handleSubscriptionCancelled(subscription: any) {
  const { data: org } = await service.from("orgs").select("id").eq("razorpay_sub_id", subscription.id).single();
  if (!org) return;

  await service.from("orgs").update({
    billing_cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", org.id).is("billing_cancelled_at", null);

  await service.from("billing_events").insert({
    org_id: org.id,
    event_type: "subscription_cancelled",
    metadata: { razorpay_sub_id: subscription.id, status: subscription.status },
  });
}

export async function handlePaymentFailed(payment: any) {
  const orgId = await getOrgFromNotes(payment.notes);
  if (!orgId) return;

  await service.from("billing_events").insert({
    org_id: orgId,
    event_type: "payment_failed",
    amount_paise: payment.amount,
    razorpay_order_id: payment.order_id,
    metadata: { error_code: payment.error_code, description: payment.error_description },
  });
}

export async function handleRefundCreated(refund: any) {
  const { data: originalEvent } = await service
    .from("billing_events")
    .select("org_id")
    .eq("razorpay_payment_id", refund.payment_id)
    .single();

  if (!originalEvent) return;

  await service.from("billing_events").insert({
    org_id: originalEvent.org_id,
    event_type: "refund_created",
    amount_paise: -refund.amount,
    razorpay_payment_id: refund.payment_id,
    metadata: { refund_id: refund.id, reason: refund.notes?.reason ?? "refund" },
  });
}
```

---

## ENV VARIABLES TO ADD

```env
RAZORPAY_WEBHOOK_SECRET=<from_dashboard>

# Plan IDs for v5.0 strategy
RZP_PLAN_SOLO_M=plan_SOLO_MONTHLY
RZP_PLAN_SOLO_Y=plan_SOLO_YEARLY
RZP_PLAN_GROWTH_M=plan_GROWTH_MONTHLY
RZP_PLAN_GROWTH_Y=plan_GROWTH_YEARLY
```

---

## COMPLETION CHECKLIST
- [ ] HMAC signature verification uses RAZORPAY_WEBHOOK_SECRET
- [ ] payment.captured: handles credits (topup) and plans (solo/growth)
- [ ] PLAN_MAP: updated for v5.0 Solo and Growth tiers
- [ ] Idempotency: checks billing_events before processing
- [ ] subscription.charged: extends expiry based on cycle (30 or 365 days)
- [ ] refund.created: logs negative amount in billing_events

## BUILD LOG ENTRY
## M10-08 Razorpay Webhook Handler v5.0 — [date]
### Status: ✅ Complete
