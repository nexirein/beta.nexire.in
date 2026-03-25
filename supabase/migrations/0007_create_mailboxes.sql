-- =============================================================================
-- 0007_create_mailboxes.sql
-- Owner: nexire-data
-- Purpose: OAuth-connected mailboxes for sending email sequences.
--          Tokens stored in DB — encrypt at rest using Supabase Vault in production.
-- Dependencies: 0001
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: mailboxes
-- Each mailbox = one connected Gmail or Outlook account.
-- A user can connect multiple mailboxes; a sequence uses one at a time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mailboxes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email           text NOT NULL,
  provider        text NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  -- OAuth tokens: store encrypted in production using pg_sodium / Supabase Vault
  access_token    text,
  refresh_token   text,
  token_expires_at timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  display_name    text,           -- friendly label shown in UI
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One connection per email address per org
  CONSTRAINT mailboxes_org_email_unique UNIQUE (org_id, email)
);

COMMENT ON TABLE public.mailboxes IS
  'OAuth-connected email accounts for sequence sending. '
  'access_token and refresh_token should be encrypted at rest in production.';
COMMENT ON COLUMN public.mailboxes.provider IS 'gmail or outlook — determines which OAuth flow and SMTP settings to use.';
COMMENT ON COLUMN public.mailboxes.is_active IS 'Set to false when token is revoked or mailbox is disconnected by user.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Most common query: find active mailboxes for a user in an org
CREATE INDEX IF NOT EXISTS idx_mailboxes_org_user_active
  ON public.mailboxes(org_id, user_id, is_active);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_mailboxes_updated_at
  BEFORE UPDATE ON public.mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Users see their own mailboxes; owner/admin see all org mailboxes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

-- Users see their own; owner/admin see all in org
CREATE POLICY "mailboxes_select"
  ON public.mailboxes FOR SELECT
  USING (
    -- User sees own mailboxes
    user_id = auth.uid()
    OR
    -- Owner/admin sees all org mailboxes
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );

-- Users can only insert their own mailbox
CREATE POLICY "mailboxes_insert"
  ON public.mailboxes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Users can update their own; owner/admin can update any in org
CREATE POLICY "mailboxes_update"
  ON public.mailboxes FOR UPDATE
  USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );

-- Users can delete their own; owner/admin can delete any in org
CREATE POLICY "mailboxes_delete"
  ON public.mailboxes FOR DELETE
  USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );
