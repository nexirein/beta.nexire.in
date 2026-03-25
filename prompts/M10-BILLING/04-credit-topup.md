<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# M10 — TASK 04: CREDIT TOP-UP
# Trae: Read CLAUDE.md first.
# Contact credits can be purchased as a one-time top-up — separate from the plan.
# A recruiter on any plan can buy extra credits without upgrading.
# Credits are stored per org and consumed based on reveal type (Email=1, Phone=8).
# Route: /settings/billing/credits (tab inside billing settings)
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. Supabase SQL: Add credit columns to `orgs` table (v5.0 spec) + `credit_transactions` log
2. Credit packs: 200, 500, 1000, 2500 credits
3. POST /api/billing/credits/create-order
4. POST /api/billing/credits/verify
5. CreditsTopupPanel — UI inside billing settings
6. deductCredits() utility — supports variable amounts (1 or 8)

---

## FILE 1 — Supabase SQL: credits schema

```sql
-- Add credit columns to orgs (Single Source of Truth for balance)
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 15,   -- Current available credits
  ADD COLUMN IF NOT EXISTS credits_used    INTEGER DEFAULT 0,    -- Used this cycle/lifetime
  ADD COLUMN IF NOT EXISTS credits_monthly INTEGER DEFAULT 15;   -- Plan allocation

-- Credit transaction log (Audit trail)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id),
  type         TEXT NOT NULL CHECK (type IN ('monthly_grant','rollover','reveal_email','reveal_phone','topup','refund')),
  amount       INTEGER NOT NULL,   -- positive = added, negative = deducted
  balance_after INTEGER NOT NULL,
  description  TEXT,
  reference_id TEXT,               -- razorpay_payment_id or candidate_id
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_txn_org ON credit_transactions(org_id, created_at DESC);

-- RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read own credit transactions"
  ON credit_transactions FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

---

## FILE 2 — lib/billing/credits.ts  (credit utility)

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export async function getCreditsBalance(orgId: string): Promise<number> {
  const service = createServiceClient();
  const { data } = await service
    .from("orgs")
    .select("credits_balance")
    .eq("id", orgId)
    .single();
  return data?.credits_balance ?? 0;
}

export async function deductCredits(params: {
  orgId:       string;
  amount:      number;  // 1 for email, 8 for phone
  type:        "reveal_email" | "reveal_phone";
  description: string;
  referenceId: string;
  userId:      string;
}): Promise<{
  success: boolean;
  balance: number;
  error?:  string;
}> {
  const service = createServiceClient();

  // Atomic deduction via RPC
  const { data, error } = await service.rpc("deduct_credits", {
    p_org_id:       params.orgId,
    p_amount:       params.amount,
    p_type:         params.type,
    p_user_id:      params.userId,
    p_ref_id:       params.referenceId,
    p_desc:         params.description
  });

  if (error || !data?.success) {
    return { success: false, balance: data?.balance_after ?? 0, error: data?.error ?? "Insufficient credits" };
  }

  return { success: true, balance: data.balance_after };
}

export async function addCredits(params: {
  orgId:       string;
  amount:      number;
  type:        "topup" | "refund" | "monthly_grant";
  description: string;
  referenceId?: string;
}) {
  const service = createServiceClient();
  // We use a similar RPC for adding to ensure atomicity, or direct update if simple
  // Here assuming an RPC `add_credits` exists or using direct update for admin ops
  await service.rpc("add_credits", {
    p_org_id: params.orgId,
    p_amount: params.amount,
    p_type:   params.type,
    p_desc:   params.description,
    p_ref_id: params.referenceId
  });
}
```

---

## FILE 3 — Credit packs constant

```typescript
// In lib/billing/plans.ts — add:
export const CREDIT_PACKS = [
  { id: "credits_200",  amount: 200,  price_inr: 3999, label: "200 credits",   badge: null           },
  { id: "credits_500",  amount: 500,  price_inr: 8999, label: "500 credits",   badge: "Popular"      },
  { id: "credits_1000", amount: 1000, price_inr: 15999,label: "1,000 credits", badge: "Best value"   },
  { id: "credits_2500", amount: 2500, price_inr: 34999,label: "2,500 credits", badge: null           },
] as const;

export type CreditPackId = typeof CREDIT_PACKS[number]["id"];
```

---

## FILE 4 — app/api/billing/credits/create-order/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRazorpay } from "@/lib/billing/razorpay";
import { CREDIT_PACKS, type CreditPackId } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pack_id } = await req.json();
  const pack = CREDIT_PACKS.find(p => p.id === pack_id);
  if (!pack) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();
  const { data: org } = await supabase
    .from("orgs").select("id, name, razorpay_cust_id").eq("id", profile?.org_id).single();

  const razorpay = getRazorpay();
  const order    = await razorpay.orders.create({
    amount:   pack.price_inr * 100,
    currency: "INR",
    receipt:  `credits_${org?.id}_${Date.now()}`,
    notes: {
      org_id:  org?.id,
      type:    "credits",
      pack_id: pack.id,
      amount:  pack.amount,
    },
  });

  return NextResponse.json({
    order_id:  order.id,
    amount:    order.amount,
    currency:  order.currency,
    key_id:    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    pack,
    email:     user.email ?? "",
    org_name:  org?.name ?? "",
  });
}
```

---

## FILE 5 — app/(app)/settings/billing/CreditsTopupPanel.tsx

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { Zap, CheckCircle, Info } from "lucide-react";
import { CREDIT_PACKS } from "@/lib/billing/plans";
import { useRazorpay } from "@/hooks/useRazorpay";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CreditsTopupPanel() {
  const [balance, setBalance] = useState<number | null>(null);
  const [selected, setSelected] = useState("credits_500");
  const [buying, setBuying] = useState(false);

  const loadBalance = useCallback(async () => {
    const res  = await fetch("/api/billing/plans");
    const data = await res.json();
    setBalance(data.usage.credits_balance ?? 0);
  }, []);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const handleBuy = async () => {
    const pack = CREDIT_PACKS.find(p => p.id === selected);
    if (!pack) return;
    setBuying(true);

    const orderRes  = await fetch("/api/billing/credits/create-order", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack_id: selected }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) { toast.error("Failed to create order"); setBuying(false); return; }

    const rzp = new (window as any).Razorpay({
      key:         orderData.key_id,
      amount:      orderData.amount,
      currency:    orderData.currency,
      name:        "Nexire Credits",
      description: `${pack.label} — one-time top-up`,
      order_id:    orderData.order_id,
      prefill:     { email: orderData.email, name: orderData.org_name },
      theme:       { color: "#38BDF8" },
      handler: async (resp: any) => {
        const verifyRes = await fetch("/api/billing/credits/verify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id:   resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature:  resp.razorpay_signature,
            pack_id: selected,
          }),
        });
        if (verifyRes.ok) {
          toast.success(`✅ Credits added successfully`);
          loadBalance();
        } else {
          toast.error("Verification failed — contact support");
        }
        setBuying(false);
      },
      "modal.ondismiss": () => setBuying(false),
    });
    rzp.open();
  };

  return (
    <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <h3 className="text-sm font-bold text-[#FAFAFA]">Contact Credits</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-[#FAFAFA]">{balance === null ? "—" : balance.toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-[#555555]">available balance</p>
        </div>
      </div>

      <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl p-3 mb-6">
        <p className="text-[10px] text-[#555555] flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Credits never expire. 1 Email = 1 credit · 1 Phone = 8 credits.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {CREDIT_PACKS.map(pack => (
          <button key={pack.id} onClick={() => setSelected(pack.id)}
            className={cn(
              "relative p-4 rounded-xl border text-left transition-all",
              selected === pack.id
                ? "border-[#38BDF8]/50 bg-[#38BDF8]/5"
                : "border-[#222222] bg-[#0A0A0A] hover:border-[#333333]"
            )}>
            {pack.badge && (
              <span className="absolute -top-2 right-2 text-[8px] bg-[#38BDF8] text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                {pack.badge}
              </span>
            )}
            <p className="text-sm font-bold text-[#FAFAFA]">{pack.label}</p>
            <p className="text-xs text-[#555555] mt-1">₹{pack.price_inr.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-[#333333] mt-1">
              ₹{(pack.price_inr / pack.amount).toFixed(1)} / credit
            </p>
          </button>
        ))}
      </div>

      <button onClick={handleBuy} disabled={buying}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-semibold hover:from-[#0EA5E9] hover:to-[#0284C7] shadow-glow-blue disabled:opacity-50 transition-all">
        {buying ? "Initializing..." : `Purchase ${CREDIT_PACKS.find(p => p.id === selected)?.label}`}
      </button>
    </div>
  );
}
```

---

## Wire deductCredits into reveal API

```typescript
// /api/candidates/[id]/reveal/route.ts

const amount = revealType === "phone" ? 8 : 1;
const type   = revealType === "phone" ? "reveal_phone" : "reveal_email";

const result = await deductCredits({
  orgId,
  amount,
  type,
  description: `Revealed ${revealType} for candidate ${candidateId}`,
  referenceId: candidateId,
  userId: user.id
});

if (!result.success) {
  return NextResponse.json({
    error: "Insufficient credits. Please top up to reveal contact details.",
    code: "INSUFFICIENT_CREDITS",
  }, { status: 402 });
}
```

---

## COMPLETION CHECKLIST
- [ ] orgs: credits_balance, credits_used, credits_monthly columns added
- [ ] credit_transactions table: tracks all credit movements
- [ ] lib/billing/credits.ts: deductCredits() checks orgs.credits_balance
- [ ] 4 credit packs: 200, 500, 1000, 2500 credits
- [ ] CreditsTopupPanel: shows current balance and info tooltip for credit ratio
- [ ] CreditsTopupPanel: buy button with v5.0 styling
- [ ] reveal API: deducts 1 or 8 credits based on revealType

## BUILD LOG ENTRY
## M10-04 Credit Top-Up v5.0 — [date]
### Status: ✅ Complete
