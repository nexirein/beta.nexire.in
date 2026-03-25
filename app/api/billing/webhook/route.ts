// nexire-app — app/api/billing/webhook/route.ts
// POST /api/billing/webhook — Razorpay payment webhook
// Verifies signature, then credits the org's balance on successful payment.
// CRITICAL: This is where money converts to credits — must be idempotent.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const TOPUP_CREDITS: Record<string, number> = {
  small: 50,
  medium: 150,
  large: 500,
  xl: 1000,
};

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // ── 1. Verify webhook signature ──────────────────────────────────────────
  if (!webhookSecret) {
    console.error("[Webhook] RAZORPAY_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const expectedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");

  if (expectedSig !== signature) {
    console.error("[Webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 2. Parse event ────────────────────────────────────────────────────────
  let event: Record<string, unknown>;
  try { event = JSON.parse(body); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle payment.captured (ignore payment.authorized etc.)
  if (event.event !== "payment.captured") {
    return NextResponse.json({ received: true });
  }

  // Extract payment data
  const payment = (event.payload as Record<string, unknown>)?.payment as Record<string, unknown>;
  const paymentEntity = payment?.entity as Record<string, unknown>;
  const notes = paymentEntity?.notes as Record<string, string> | null;

  if (!notes?.org_id || !notes?.pack) {
    console.error("[Webhook] Missing org_id or pack in notes:", notes);
    return NextResponse.json({ error: "Missing notes" }, { status: 400 });
  }

  const { org_id, user_id, pack } = notes;
  const credits = TOPUP_CREDITS[pack];

  if (!credits) {
    console.error("[Webhook] Unknown pack:", pack);
    return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
  }

  const paymentId = paymentEntity?.id as string;
  const amountPaise = paymentEntity?.amount as number;

  // ── 3. Idempotency check — skip if already processed ─────────────────────
  const admin = adminClient();
  const { data: existingTx } = await admin
    .from("credit_transactions")
    .select("id")
    .eq("org_id", org_id)
    .eq("notes", `Razorpay ${paymentId}`)
    .maybeSingle();

  if (existingTx) {
    console.log("[Webhook] Already processed:", paymentId);
    return NextResponse.json({ received: true, idempotent: true });
  }

  // ── 4. Add credits to org balance ─────────────────────────────────────────
  const { data: org } = await admin
    .from("orgs")
    .select("credits_balance")
    .eq("id", org_id)
    .single();

  const currentBalance = org?.credits_balance ?? 0;
  const newBalance = currentBalance + credits;

  await admin.from("orgs").update({ credits_balance: newBalance }).eq("id", org_id);

  // ── 5. Write immutable ledger row ─────────────────────────────────────────
  await admin.from("credit_transactions").insert({
    org_id,
    user_id: user_id ?? null,
    type: "manual_topup",
    amount: credits,                             // positive = credits added
    balance_after: newBalance,
    notes: `Razorpay ${paymentId} — ${pack} pack`,
  });

  console.log(`[Webhook] Credited ${credits} credits to org ${org_id} (payment ${paymentId})`);
  return NextResponse.json({ received: true, credited: credits });
}
