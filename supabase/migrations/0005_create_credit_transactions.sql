-- =============================================================================
-- 0005_create_credit_transactions.sql
-- Owner: nexire-data
-- Purpose: Append-only credit ledger. NEVER UPDATE or DELETE rows.
--          Balance = sum of all amounts. balance_after is a snapshot for fast reads.
-- Dependencies: 0001, 0003, 0004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: credit_transactions
-- APPEND-ONLY LEDGER. Every credit event writes a new row.
-- To correct a mistake: add a new row of type 'refund' or 'adjustment'.
-- RLS intentionally blocks UPDATE and DELETE.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type            text NOT NULL CHECK (type IN (
                    'monthly_grant',    -- cron gives monthly allowance
                    'rollover',         -- unused credits carry forward
                    'reveal_email',     -- 1 credit deducted
                    'reveal_phone',     -- 8 credits deducted
                    'manual_topup',     -- paid top-up via Razorpay
                    'refund',           -- manual refund by admin
                    'adjustment'        -- correction entry (positive or negative)
                  )),
  amount          integer NOT NULL,     -- positive = credit, negative = debit
  balance_after   integer NOT NULL,     -- org.credits_balance snapshot after this tx
  notes           text,                 -- human-readable context
  candidate_id    uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  reveal_id       uuid REFERENCES public.reveals(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()

  -- No updated_at — this table is insert-only
);

COMMENT ON TABLE public.credit_transactions IS
  'Append-only credit ledger. Never update or delete rows. '
  'Add a correcting row of type refund or adjustment instead.';
COMMENT ON COLUMN public.credit_transactions.amount IS
  'Positive = credits added. Negative = credits consumed. '
  'Example: reveal_email = -1, monthly_grant = +200.';
COMMENT ON COLUMN public.credit_transactions.balance_after IS
  'Snapshot of org.credits_balance immediately after this transaction. '
  'Allows fast audit view without summing all rows.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Usage timeline per org (most common query)
CREATE INDEX IF NOT EXISTS idx_credit_tx_org_time
  ON public.credit_transactions(org_id, created_at DESC);

-- Per-user credit consumption audit
CREATE INDEX IF NOT EXISTS idx_credit_tx_user
  ON public.credit_transactions(user_id, created_at DESC);

-- By type (for billing reports)
CREATE INDEX IF NOT EXISTS idx_credit_tx_type
  ON public.credit_transactions(org_id, type, created_at DESC);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- CRITICAL: NO UPDATE and NO DELETE policies — ledger is immutable.
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- All org members can read their org's transaction history
CREATE POLICY "org_members_credit_tx_select"
  ON public.credit_transactions FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- All org members can insert (e.g. when they trigger a reveal)
-- Application code (via SUPABASE_SERVICE_ROLE_KEY) also inserts directly.
CREATE POLICY "org_members_credit_tx_insert"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- NO UPDATE POLICY — intentionally absent.
-- NO DELETE POLICY — intentionally absent.
-- Attempting UPDATE or DELETE will be blocked by RLS (returns permission denied).
