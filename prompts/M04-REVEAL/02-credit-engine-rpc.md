<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/reveal.md          ← this module's API contract
-->

# M04 — TASK 02: CREDIT ENGINE RPC (Supabase Atomic Function)
# Trae: Read CLAUDE.md first.
# This is the financial brain of Nexire. Every credit movement — deductions,
# top-ups, plan resets — flows through this SQL function.
# NEVER deduct credits from application code directly. Always use this RPC.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Create the Supabase RPC `deduct_credit` — a single atomic function that:
1. Locks the profile row (prevents race conditions)
2. Checks balance >= required amount
3. Deducts credits
4. Logs the transaction in credit_logs
5. Returns new balance + log ID

Also create:
- `topup_credits` RPC for adding credits after payment
- `reset_monthly_usage` RPC (called by cron on 1st of month)
- credit_logs table schema

---

## FILE 1 — Supabase SQL: credit_logs table

Run in Supabase SQL Editor FIRST before creating RPCs:

```sql
CREATE TABLE IF NOT EXISTS credit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES orgs(id),
  amount          INTEGER NOT NULL CHECK (amount > 0),
  direction       TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  action_type     TEXT NOT NULL,
  -- action_type examples: reveal_email, reveal_phone, topup_razorpay,
  --   plan_monthly_grant, refund, admin_adjustment
  ref_id          UUID,          -- candidate_id for reveals, payment_id for topups
  ref_type        TEXT,          -- 'candidate', 'payment', 'plan_grant'
  balance_after   INTEGER NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_logs_user_id ON credit_logs(user_id, created_at DESC);
CREATE INDEX idx_credit_logs_org_id  ON credit_logs(org_id, created_at DESC);

-- Row Level Security
ALTER TABLE credit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credit logs"
  ON credit_logs FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT/UPDATE only via service role (RPC functions use SECURITY DEFINER)
```

---

## FILE 2 — Supabase RPC: deduct_credit

```sql
CREATE OR REPLACE FUNCTION deduct_credit(
  p_user_id     UUID,
  p_amount      INTEGER DEFAULT 1,
  p_action_type TEXT DEFAULT 'reveal_email',
  p_ref_id      UUID DEFAULT NULL,
  p_ref_type    TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      UUID;
  v_balance     INTEGER;
  v_new_balance INTEGER;
  v_log_id      UUID;
BEGIN
  -- Lock profile row to prevent concurrent deductions
  SELECT org_id, credits_balance
  INTO v_org_id, v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: balance=%, required=%', v_balance, p_amount;
  END IF;

  v_new_balance := v_balance - p_amount;

  -- Deduct from profile
  UPDATE profiles SET
    credits_balance  = v_new_balance,
    credits_used_mtd = credits_used_mtd + p_amount,
    updated_at       = NOW()
  WHERE id = p_user_id;

  -- Write credit log
  INSERT INTO credit_logs (
    user_id, org_id, amount, direction,
    action_type, ref_id, ref_type, balance_after, metadata
  ) VALUES (
    p_user_id, v_org_id, p_amount, 'debit',
    p_action_type, p_ref_id, p_ref_type, v_new_balance, p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN json_build_object(
    'success',       true,
    'balance_after', v_new_balance,
    'log_id',        v_log_id,
    'deducted',      p_amount
  );
END;
$$;
```

---

## FILE 3 — Supabase RPC: topup_credits

```sql
CREATE OR REPLACE FUNCTION topup_credits(
  p_user_id      UUID,
  p_amount       INTEGER,
  p_payment_id   UUID,
  p_metadata     JSONB DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      UUID;
  v_new_balance INTEGER;
  v_log_id      UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM profiles WHERE id = p_user_id FOR UPDATE;

  UPDATE profiles SET
    credits_balance = credits_balance + p_amount,
    updated_at      = NOW()
  WHERE id = p_user_id
  RETURNING credits_balance INTO v_new_balance;

  INSERT INTO credit_logs (
    user_id, org_id, amount, direction,
    action_type, ref_id, ref_type, balance_after, metadata
  ) VALUES (
    p_user_id, v_org_id, p_amount, 'credit',
    'topup_razorpay', p_payment_id, 'payment', v_new_balance, p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN json_build_object(
    'success',       true,
    'balance_after', v_new_balance,
    'log_id',        v_log_id,
    'credited',      p_amount
  );
END;
$$;
```

---

## FILE 4 — Supabase RPC: reset_monthly_usage (called by cron)

```sql
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  PLAN_CREDITS JSONB := '{"free": 10, "solo": 100, "growth": 500, "custom": 0}'::jsonb;
  r RECORD;
BEGIN
  FOR r IN SELECT id, plan_tier FROM profiles LOOP
    UPDATE profiles SET
      credits_used_mtd = 0,
      credits_balance  = credits_balance + COALESCE((PLAN_CREDITS ->> r.plan_tier)::int, 0),
      updated_at       = NOW()
    WHERE id = r.id;
  END LOOP;
END;
$$;
```

---

## FILE 5 — lib/supabase/credits.ts (TypeScript wrapper)

```typescript
import { createClient } from "@/lib/supabase/server";

export interface CreditResult {
  success: boolean;
  balance_after: number;
  log_id: string;
}

export async function deductCredit(
  userId: string,
  options: {
    amount?: number;
    action_type?: string;
    ref_id?: string;
    ref_type?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<CreditResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deduct_credit", {
    p_user_id:     userId,
    p_amount:      options.amount ?? 1,
    p_action_type: options.action_type ?? "reveal_email",
    p_ref_id:      options.ref_id ?? null,
    p_ref_type:    options.ref_type ?? null,
    p_metadata:    options.metadata ?? {},
  });

  if (error) {
    if (error.message.includes("INSUFFICIENT_CREDITS")) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
    throw new Error(error.message);
  }

  return data as CreditResult;
}

export async function topupCredits(
  userId: string,
  amount: number,
  paymentId: string,
  metadata: Record<string, any> = {}
): Promise<CreditResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("topup_credits", {
    p_user_id:    userId,
    p_amount:     amount,
    p_payment_id: paymentId,
    p_metadata:   metadata,
  });
  if (error) throw new Error(error.message);
  return data as CreditResult;
}
```

---

## COMPLETION CHECKLIST
- [ ] credit_logs table created with RLS (users see own logs only)
- [ ] deduct_credit RPC: FOR UPDATE lock, INSUFFICIENT_CREDITS exception
- [ ] topup_credits RPC: adds credits + logs with payment ref
- [ ] reset_monthly_usage RPC: resets MTD counter + adds monthly plan credits
- [ ] lib/supabase/credits.ts: TypeScript wrapper for both RPCs
- [ ] IMPORTANT: Replace raw supabase.rpc calls in reveal/route.ts with deductCredit()
- [ ] Test: concurrent reveal requests don't double-charge (race condition safe)

## BUILD LOG ENTRY
## M04-02 Credit Engine RPC — [date]
### Files: SQL (3 RPCs + table), lib/supabase/credits.ts
### Status: ✅ Complete
