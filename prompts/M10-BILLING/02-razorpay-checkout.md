<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# M10 — TASK 02: RAZORPAY CHECKOUT
# Trae: Read CLAUDE.md first.
# When a recruiter clicks Upgrade, we create a Razorpay Order server-side,
# return the order_id to the client, open the Razorpay modal, then verify
# the payment signature server-side before activating the plan.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. Install Razorpay SDK + env vars
2. POST /api/billing/create-order — creates Razorpay order for Solo/Growth plans
3. POST /api/billing/verify-payment — verifies signature + activates plan
4. CheckoutPage at /settings/billing/checkout
5. useRazorpay hook — loads SDK + opens modal
6. orgs table: add plan_id, plan_expires_at, billing_cycle, razorpay_sub_id columns

---

## INSTALL
```bash
npm install razorpay
```

## ENV
```
RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=YYYYYYYYYYYYYYYYYYYYYYYY
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXXXX
```

---

## FILE 1 — Supabase SQL: billing columns on orgs

```sql
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS plan_id          TEXT    NOT NULL DEFAULT 'free';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS billing_cycle    TEXT    NOT NULL DEFAULT 'monthly'
  CHECK (billing_cycle IN ('monthly', 'yearly'));
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS plan_expires_at  TIMESTAMPTZ;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS razorpay_sub_id  TEXT;       -- for subscriptions
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS razorpay_cust_id TEXT;       -- Razorpay customer id

CREATE TABLE billing_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,    -- "order_created","payment_success","payment_failed","plan_activated"
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  plan_id         TEXT,
  billing_cycle   TEXT,
  amount_paise    INTEGER,          -- amount in paise (INR × 100)
  currency        TEXT DEFAULT 'INR',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_billing_events_org ON billing_events(org_id, created_at DESC);
```

---

## FILE 2 — lib/billing/razorpay.ts  (Razorpay singleton)

```typescript
import Razorpay from "razorpay";

let _instance: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!_instance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
    }
    _instance = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _instance;
}

export function verifyPaymentSignature(params: {
  orderId:   string;
  paymentId: string;
  signature: string;
}): boolean {
  const crypto = require("crypto");
  const body   = `${params.orderId}|${params.paymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");
  return expected === params.signature;
}
```

---

## FILE 3 — app/api/billing/create-order/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRazorpay } from "@/lib/billing/razorpay";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { z } from "zod";

const OrderSchema = z.object({
  plan_id:       z.enum(["solo","growth"]),
  billing_cycle: z.enum(["monthly","yearly"]),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = OrderSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { plan_id, billing_cycle } = parsed.data;
  const plan = PLANS[plan_id as PlanId];

  // Use explicit annual price from config
  const priceINR = billing_cycle === "yearly"
    ? plan.price_annual
    : plan.price_monthly;

  const { data: profile } = await supabase
    .from("profiles").select("org_id, full_name, email: auth.users(email)").eq("id", user.id).single();

  const { data: org } = await supabase
    .from("orgs").select("id, name, razorpay_cust_id").eq("id", profile?.org_id).single();

  const razorpay = getRazorpay();

  // Create or reuse Razorpay customer
  let custId = org?.razorpay_cust_id;
  if (!custId) {
    const customer = await razorpay.customers.create({
      name:    org?.name ?? "Nexire User",
      email:   user.email ?? "",
      contact: "",
      notes:   { org_id: org?.id },
    });
    custId = customer.id;
    await supabase.from("orgs")
      .update({ razorpay_cust_id: custId })
      .eq("id", org?.id);
  }

  // Create order
  const order = await razorpay.orders.create({
    amount:   priceINR * 100,   // paise
    currency: "INR",
    receipt:  `nexire_${org?.id}_${Date.now()}`,
    notes: {
      org_id:        org?.id,
      plan_id,
      billing_cycle,
    },
  });

  // Log billing event
  await supabase.from("billing_events").insert({
    org_id:             org?.id,
    event_type:         "order_created",
    razorpay_order_id:  order.id,
    plan_id,
    billing_cycle,
    amount_paise:       priceINR * 100,
    metadata:           { order },
  });

  return NextResponse.json({
    order_id:      order.id,
    amount:        order.amount,
    currency:      order.currency,
    key_id:        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    customer_id:   custId,
    plan_id,
    billing_cycle,
    plan_name:     plan.name,
    org_name:      org?.name ?? "",
    email:         user.email ?? "",
  });
}
```

---

## FILE 4 — app/api/billing/verify-payment/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyPaymentSignature } from "@/lib/billing/razorpay";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { z } from "zod";

const VerifySchema = z.object({
  razorpay_order_id:   z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature:  z.string(),
  plan_id:             z.string(),
  billing_cycle:       z.enum(["monthly","yearly"]),
});

export async function POST(req: NextRequest) {
  const supabase  = await createClient();
  const service   = createServiceClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = VerifySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const {
    razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, billing_cycle
  } = parsed.data;

  // 1. Verify signature
  const valid = verifyPaymentSignature({
    orderId:   razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    return NextResponse.json({ error: "Payment signature verification failed" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const plan = PLANS[plan_id as PlanId];

  // 2. Calculate new expiry
  const expiresAt = new Date();
  if (billing_cycle === "yearly") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  // 3. Activate plan (using service role to bypass RLS)
  await service.from("orgs").update({
    plan_id,
    billing_cycle,
    plan_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", profile?.org_id);

  // 4. Log billing event
  const priceINR = billing_cycle === "yearly"
    ? plan.price_annual
    : plan.price_monthly;

  await service.from("billing_events").insert({
    org_id:             profile?.org_id,
    event_type:         "payment_success",
    razorpay_order_id,
    razorpay_payment_id,
    plan_id,
    billing_cycle,
    amount_paise:       priceINR * 100,
    metadata:           { signature: razorpay_signature },
  });

  return NextResponse.json({
    success:      true,
    plan_id,
    billing_cycle,
    expires_at:   expiresAt.toISOString(),
  });
}
```

---

## FILE 5 — hooks/useRazorpay.ts

```typescript
"use client";
import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

declare global {
  interface Window { Razorpay: any; }
}

export function useRazorpay() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const script    = document.createElement("script");
      script.src      = "https://checkout.razorpay.com/v1/checkout.js";
      script.async    = true;
      document.body.appendChild(script);
    }
  }, []);

  const openCheckout = useCallback(async (planId: string, billingCycle: "monthly" | "yearly") => {
    // 1. Create order
    const orderRes  = await fetch("/api/billing/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, billing_cycle: billingCycle }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) { toast.error(orderData.error ?? "Failed to create order"); return; }

    // 2. Open Razorpay modal
    const options = {
      key:         orderData.key_id,
      amount:      orderData.amount,
      currency:    orderData.currency,
      name:        "Nexire",
      description: `${orderData.plan_name} Plan — ${orderData.billing_cycle}`,
      image:       "/logo.png",
      order_id:    orderData.order_id,
      prefill: {
        name:  orderData.org_name,
        email: orderData.email,
      },
      theme: { color: "#38BDF8" },
      modal: { backdropclose: false },

      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id:   string;
        razorpay_signature:  string;
      }) => {
        // 3. Verify + activate
        const verifyRes = await fetch("/api/billing/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            plan_id:             planId,
            billing_cycle:       billingCycle,
          }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) { toast.error("Payment verification failed — contact support"); return; }
        toast.success(`🎉 Upgraded to ${orderData.plan_name}!`);
        router.push("/settings/billing?success=true");
        router.refresh();
      },

      "modal.ondismiss": () => {
        toast("Payment cancelled");
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (resp: any) => {
      toast.error(`Payment failed: ${resp.error.description}`);
    });
    rzp.open();
  }, [router]);

  return { openCheckout };
}
```

---

## FILE 6 — app/(app)/settings/billing/checkout/page.tsx

```tsx
"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, Shield, CreditCard, Zap, CheckCircle2 } from "lucide-react";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { useRazorpay } from "@/hooks/useRazorpay";
import { cn } from "@/lib/utils";

function CheckoutContent() {
  const params       = useSearchParams();
  const router       = useRouter();
  const planId       = (params.get("plan") ?? "growth") as PlanId;
  const billingCycle = (params.get("cycle") ?? "monthly") as "monthly" | "yearly";
  const plan         = PLANS[planId];
  const { openCheckout } = useRazorpay();
  const [loading, setLoading] = useState(false);

  // 10 months for annual billing (2 months free)
  const total = billingCycle === "yearly" ? plan.price_annual : plan.price_monthly;

  const handlePay = async () => {
    setLoading(true);
    await openCheckout(planId, billingCycle);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-[#555555] hover:text-[#A0A0A0] mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden shadow-2xl">
          {/* Plan summary */}
          <div className="px-6 py-6 border-b border-[#1A1A1A] bg-gradient-to-b from-[#161616] to-[#111111]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: plan.color }} />
                  <span className="text-sm font-bold text-[#FAFAFA]">{plan.name} Plan</span>
                </div>
                <p className="text-xs text-[#555555] mt-1 capitalize">{billingCycle} billing</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-[#FAFAFA]">₹{total.toLocaleString("en-IN")}</p>
                <p className="text-[10px] text-[#555555] mt-0.5">{billingCycle === "yearly" ? "billed today" : "/month"}</p>
              </div>
            </div>
            {billingCycle === "yearly" && (
              <div className="bg-green-400/10 border border-green-400/20 rounded-xl px-3 py-2.5 text-xs text-green-400 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Pay 10 months. Get 12. <b>2 months FREE.</b></span>
              </div>
            )}
          </div>

          {/* What you get */}
          <div className="px-6 py-5 border-b border-[#1A1A1A]">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider font-semibold mb-4">Plan Benefits</p>
            <ul className="space-y-3 text-xs text-[#A0A0A0]">
              <li className="flex items-center gap-2.5">
                <div className="w-1 h-1 rounded-full bg-[#38BDF8]" />
                {plan.credits_monthly === -1 ? "Custom" : plan.credits_monthly} Contact Credits
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-1 h-1 rounded-full bg-[#38BDF8]" />
                {plan.search_results === -1 ? "Unlimited" : plan.search_results.toLocaleString()} Searches
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-1 h-1 rounded-full bg-[#38BDF8]" />
                {plan.max_roles === -1 ? "Unlimited" : plan.max_roles} Active Roles
              </li>
              {plan.ai_search && (
                <li className="flex items-center gap-2.5">
                  <div className="w-1 h-1 rounded-full bg-[#38BDF8]" />
                  AI-powered candidate ranking
                </li>
              )}
            </ul>
          </div>

          {/* Pay button */}
          <div className="px-6 py-6">
            <button onClick={handlePay} disabled={loading}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all",
                "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white hover:from-[#0EA5E9] hover:to-[#0284C7]",
                "shadow-glow-blue disabled:opacity-50"
              )}>
              <CreditCard className="w-4 h-4" />
              {loading ? "Initializing..." : `Pay ₹${total.toLocaleString("en-IN")}`}
            </button>
            <div className="flex items-center justify-center gap-1.5 mt-4 opacity-40">
              <Shield className="w-3 h-3 text-[#A0A0A0]" />
              <p className="text-[10px] text-[#A0A0A0]">Secured by Razorpay · 256-bit SSL</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return <Suspense><CheckoutContent /></Suspense>;
}
```

---

## COMPLETION CHECKLIST
- [ ] orgs: default plan_id set to 'free'
- [ ] POST /api/billing/create-order: handles Solo/Growth plans, calculates 10 months for annual
- [ ] POST /api/billing/verify-payment: Calculates annual price correctly in billing_events
- [ ] CheckoutPage: "Pay 10 months. Get 12. 2 months FREE." messaging for yearly
- [ ] CheckoutPage: Displays Contact Credits and Searches correctly for v5.0 tiers
- [ ] Toast notifications and routing on success

## BUILD LOG ENTRY
## M10-02 Razorpay Checkout v5.0 — [date]
### Status: ✅ Complete
