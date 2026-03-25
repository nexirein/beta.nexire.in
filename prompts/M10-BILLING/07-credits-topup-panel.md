<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# M10 — TASK 07: CREDITS TOP-UP PANEL
# Trae: Read CLAUDE.md first.
# Recruiters on any plan can buy contact credits in bundles (v5.0 strategy).
# Credits are consumed based on reveal type: Email (1) or Phone (8).
# Razorpay order → payment → webhook → credit balance update.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. Supabase SQL: org_credits table + credit_transactions log
2. RPC functions: atomic add/deduct credits (supports variable amounts)
3. POST /api/billing/credits/order — create Razorpay order for credit bundle
4. POST /api/billing/credits/verify — verify payment + credit balance
5. CreditsTopupPanel — v5.0 bundle selector + Razorpay checkout
6. lib/billing/credits.ts — deductCredits(), getBalance() helpers

---

## FILE 1 — Supabase SQL: credits schema

```sql
-- Org credit balance (single row per org)
CREATE TABLE org_credits (
  org_id       UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  balance      INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_used INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Credit transaction log
CREATE TABLE credit_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('topup', 'reveal_email', 'reveal_phone', 'refund', 'plan_reset')),
  amount       INTEGER NOT NULL,   -- positive = added, negative = deducted (1 or 8)
  description  TEXT,
  reference_id TEXT,               -- razorpay_payment_id or candidate_id
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_org ON credit_transactions(org_id, created_at DESC);

-- RLS
ALTER TABLE org_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own credits"
  ON org_credits FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members read own transactions"
  ON credit_transactions FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Auto-create credit row when org is created
CREATE OR REPLACE FUNCTION create_org_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO org_credits(org_id, balance) VALUES (NEW.id, 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_org_created
  AFTER INSERT ON orgs
  FOR EACH ROW EXECUTE FUNCTION create_org_credits();
```

---

## FILE 2 — Supabase SQL: RPC functions for atomic credit ops

```sql
-- Atomic deduct (returns false if balance < p_amount)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_org_id UUID,
  p_amount INTEGER,
  p_type   TEXT,
  p_ref_id TEXT,
  p_desc   TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance INTO v_balance FROM org_credits WHERE org_id = p_org_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RETURN FALSE; END IF;

  UPDATE org_credits
     SET balance = balance - p_amount, lifetime_used = lifetime_used + p_amount, updated_at = NOW()
   WHERE org_id = p_org_id;

  INSERT INTO credit_transactions(org_id, type, amount, description, reference_id)
  VALUES (p_org_id, p_type, -p_amount, p_desc, p_ref_id);

  RETURN TRUE;
END;
$$;

-- Atomic add credits
CREATE OR REPLACE FUNCTION add_credits(
  p_org_id  UUID,
  p_amount  INTEGER,
  p_type    TEXT,
  p_desc    TEXT,
  p_ref_id  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO org_credits(org_id, balance)
  VALUES (p_org_id, p_amount)
  ON CONFLICT (org_id) DO UPDATE
    SET balance = org_credits.balance + p_amount, updated_at = NOW();

  INSERT INTO credit_transactions(org_id, type, amount, description, reference_id)
  VALUES (p_org_id, p_type, p_amount, p_desc, p_ref_id);
END;
$$;
```

---

## FILE 3 — lib/billing/credits.ts  (service helpers)

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export async function getBalance(orgId: string): Promise<number> {
  const service = createServiceClient();
  const { data } = await service
    .from("org_credits")
    .select("balance")
    .eq("org_id", orgId)
    .single();
  return data?.balance ?? 0;
}

/**
 * Deduct credits based on reveal type.
 * Email = 1, Phone = 8.
 */
export async function deductCredits(params: {
  orgId:       string;
  amount:      number;
  type:        "reveal_email" | "reveal_phone";
  description: string;
  referenceId: string;
}): Promise<boolean> {
  const service = createServiceClient();

  const { data, error } = await service.rpc("deduct_credits", {
    p_org_id:   params.orgId,
    p_amount:   params.amount,
    p_type:     params.type,
    p_ref_id:   params.referenceId,
    p_desc:     params.description,
  });

  if (error || !data) return false;
  return true;
}

export async function addCredits(params: {
  orgId:       string;
  amount:      number;
  type:        "topup" | "refund" | "plan_reset";
  description: string;
  referenceId?: string;
}): Promise<void> {
  const service = createServiceClient();

  await service.rpc("add_credits", {
    p_org_id:   params.orgId,
    p_amount:   params.amount,
    p_type:     params.type,
    p_desc:     params.description,
    p_ref_id:   params.referenceId ?? null,
  });
}
```

---

## FILE 4 — app/api/billing/credits/order/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRazorpay } from "@/lib/billing/razorpay";
import { z } from "zod";

const BUNDLES = {
  "200":  { credits: 200,  price_paise: 399900 },
  "500":  { credits: 500,  price_paise: 899900 },
  "1000": { credits: 1000, price_paise: 1599900 },
  "2500": { credits: 2500, price_paise: 3499900 },
} as const;

const Schema = z.object({
  bundle_key: z.enum(["200", "500", "1000", "2500"]),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid bundle" }, { status: 400 });

  const bundle   = BUNDLES[parsed.data.bundle_key];
  const razorpay = getRazorpay();

  const order = await razorpay.orders.create({
    amount:   bundle.price_paise,
    currency: "INR",
    notes: {
      type:       "credits",
      bundle_key: parsed.data.bundle_key,
      credits:    String(bundle.credits),
      user_id:    user.id,
    },
  });

  return NextResponse.json({
    order_id:     order.id,
    amount:       bundle.price_paise,
    credits:      bundle.credits,
    currency:     "INR",
    key_id:       process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  });
}
```

---

## FILE 5 — app/(app)/settings/billing/CreditsTopupPanel.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { Zap, Info, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const BUNDLES = [
  { key: "200",  credits: 200,  price: "₹3,999", per: "₹20/credit", popular: false },
  { key: "500",  credits: 500,  price: "₹8,999", per: "₹18/credit", popular: true  },
  { key: "1000", credits: 1000, price: "₹15,999",per: "₹16/credit", popular: false },
  { key: "2500", credits: 2500, price: "₹34,999",per: "₹14/credit", popular: false },
] as const;

export function CreditsTopupPanel() {
  const [balance, setBalance]     = useState<number | null>(null);
  const [selected, setSelected]   = useState<string>("500");
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then(r => r.json())
      .then(d => setBalance(d.usage.credits_balance ?? 0));
  }, []);

  const handlePurchase = async () => {
    setLoading(true);
    const res  = await fetch("/api/billing/credits/order", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bundle_key: selected }),
    });
    const order = await res.json();
    setLoading(false);

    if (!res.ok) { toast.error("Failed to create order"); return; }

    const rzp = new (window as any).Razorpay({
      key:         order.key_id,
      amount:      order.amount,
      currency:    "INR",
      name:        "Nexire Credits",
      description: `${BUNDLES.find(b => b.key === selected)?.credits} Contact Credits`,
      order_id:    order.order_id,
      theme:       { color: "#38BDF8" },
      handler: async (response: any) => {
        const verifyRes = await fetch("/api/billing/credits/verify", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            bundle_key:          selected,
          }),
        });
        const json = await verifyRes.json();
        if (verifyRes.ok) {
          toast.success(`🎉 ${json.credits_added} credits added to your account!`);
          setBalance(b => (b ?? 0) + json.credits_added);
        } else {
          toast.error("Payment verification failed. Contact support.");
        }
      },
    });
    rzp.open();
  };

  return (
    <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold text-[#FAFAFA] flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          Contact Credits
        </h3>
        <div className="text-right">
          <p className="text-2xl font-black text-[#FAFAFA] tracking-tight">
            {balance === null ? "—" : balance.toLocaleString()}
          </p>
          <p className="text-[10px] text-[#555555] font-medium uppercase tracking-wider">Balance</p>
        </div>
      </div>

      <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl p-3.5 mb-6 flex items-start gap-3">
        <Info className="w-4 h-4 text-[#38BDF8] flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-[#A0A0A0] leading-relaxed">
          Credits never expire. 1 Email reveal = <b>1 credit</b>. 1 Phone reveal = <b>8 credits</b> (email included).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 mb-6">
        {BUNDLES.map(b => (
          <button
            key={b.key}
            onClick={() => setSelected(b.key)}
            className={cn(
              "relative flex items-center justify-between p-4 rounded-xl border text-left transition-all",
              selected === b.key
                ? "border-[#38BDF8] bg-[#38BDF8]/5"
                : "border-[#1A1A1A] bg-[#0A0A0A] hover:border-[#222222]"
            )}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                selected === b.key ? "border-[#38BDF8]" : "border-[#333333]"
              )}>
                {selected === b.key && <div className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#FAFAFA]">{b.credits} Credits</span>
                  {b.popular && (
                    <span className="text-[9px] bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white px-2 py-0.5 rounded-full font-bold uppercase">
                      Popular
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#555555] mt-0.5">{b.per}</p>
              </div>
            </div>
            <span className="text-sm font-black text-[#FAFAFA]">{b.price}</span>
          </button>
        ))}
      </div>

      <button
        onClick={handlePurchase}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-bold hover:from-[#0EA5E9] hover:to-[#0284C7] shadow-glow-blue disabled:opacity-50 transition-all"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-4 h-4" />}
        {loading ? "Initializing..." : `Purchase ${BUNDLES.find(b => b.key === selected)?.credits} Credits`}
      </button>

      <div className="mt-4 flex items-center justify-center gap-2 opacity-30">
        <CheckCircle2 className="w-3 h-3 text-[#A0A0A0]" />
        <p className="text-[9px] text-[#A0A0A0] uppercase font-bold tracking-widest">Secured by Razorpay</p>
      </div>
    </div>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] org_credits: atomic balance tracking with variable amount support
- [ ] credit_transactions: log types reveal_email and reveal_phone (1 and 8 credits)
- [ ] RPC deduct_credits: implements balance check + atomic update
- [ ] BUNDLES: updated to 200, 500, 1000, 2500 credits for NEXIRE v5.0
- [ ] CreditsTopupPanel: includes v5.0 specific credit ratio info tooltip
- [ ] UI: Matches v5.0 dark mode aesthetic with glow-blue CTAs

## BUILD LOG ENTRY
## M10-07 Credits Top-Up Panel v5.0 — [date]
### Status: ✅ Complete
