-- =============================================================================
-- 0015_create_api_accounts.sql
-- Purpose: Multi-account Prospeo API key management
-- Applied via MCP Supabase tool — included here for local dev reference
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.api_accounts (
  id                  text PRIMARY KEY DEFAULT 'acc_' || replace(gen_random_uuid()::text, '-', ''),
  org_id              uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  label               text NOT NULL DEFAULT 'Account 1',
  encrypted_api_key   text NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  priority            integer NOT NULL DEFAULT 0,
  credits_remaining   integer NOT NULL DEFAULT 0,
  daily_request_count integer NOT NULL DEFAULT 0,
  last_used_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- RPC for atomic daily_request_count increment (used by AccountManager)
CREATE OR REPLACE FUNCTION public.increment_api_account_requests(account_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.api_accounts
  SET daily_request_count = daily_request_count + 1
  WHERE id = account_id;
$$;

CREATE INDEX IF NOT EXISTS idx_api_accounts_org_active ON public.api_accounts(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_accounts_priority   ON public.api_accounts(org_id, priority, last_used_at);

ALTER TABLE public.api_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_admin_can_manage_api_accounts"
  ON public.api_accounts FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );
