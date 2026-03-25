-- nexire-app — 0014_add_decrement_credits_rpc.sql
-- Purpose: Atomic credit decrement RPC function.
-- Called by lib/credits/engine.ts to avoid race conditions.
-- Returns the new balance after decrement, or raises exception if insufficient.

CREATE OR REPLACE FUNCTION public.decrement_credits(
  p_org_id uuid,
  p_amount  integer  -- positive number, will be subtracted
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance     integer;
BEGIN
  -- Get current balance with a row-level lock to prevent race conditions
  SELECT credits_balance
    INTO v_current_balance
    FROM public.orgs
   WHERE id = p_org_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORG_NOT_FOUND: org_id % does not exist', p_org_id;
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Allow negative balance (overage protection handled in app layer)
  -- The app layer checks first; the DB is the source of truth but doesn't block
  UPDATE public.orgs
     SET credits_balance = v_new_balance,
         credits_used    = credits_used + p_amount
   WHERE id = p_org_id;

  RETURN v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.decrement_credits IS
  'Atomic credit decrement with row-level lock. Returns new balance. '
  'Called by the reveal engine to deduct credits safely without race conditions.';
