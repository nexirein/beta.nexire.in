-- =============================================================================
-- 0004_create_reveals.sql
-- Owner: nexire-data
-- Purpose: Contact reveal records — email and phone enrichment.
--          UNIQUE (org_id, person_id, type) enables FREE re-enrichment:
--          if a row already exists, skip Prospeo; return cached data.
-- Dependencies: 0001, 0003
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: reveals
-- Stores the result of every successful contact enrichment.
-- The UNIQUE constraint is the key to free re-enrichment:
--   INSERT INTO reveals ... ON CONFLICT (org_id, person_id, type) DO NOTHING
--   Then SELECT the existing row — no Prospeo call, no credit charge.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reveals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  candidate_id    uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  person_id       text NOT NULL,      -- Prospeo person_id (indexed for fast lookup)
  type            text NOT NULL CHECK (type IN ('email', 'phone')),
  email           text,               -- populated when type = 'email'
  phone           text,               -- populated when type = 'phone'
  status          text NOT NULL DEFAULT 'unverified'
                    CHECK (status IN ('verified', 'unverified', 'invalid')),
  revealed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  credits_charged integer NOT NULL DEFAULT 0,   -- credits deducted for this reveal
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- KEY CONSTRAINT: one email reveal and one phone reveal per person per org
  -- Application logic: check for this row FIRST; only call Prospeo if missing
  CONSTRAINT reveals_org_person_type_unique UNIQUE (org_id, person_id, type)
);

COMMENT ON TABLE public.reveals IS
  'Contact enrichment records. UNIQUE (org_id, person_id, type) is the '
  'free re-enrichment key. Always check for existing row before billing+calling Prospeo.';
COMMENT ON COLUMN public.reveals.person_id IS
  'Indexed separately from candidate_id so reveals are queryable even '
  'before the candidate row is created.';
COMMENT ON COLUMN public.reveals.credits_charged IS
  '1 for email reveal, 8 for phone reveal. 0 if this was a free re-enrichment.';
COMMENT ON COLUMN public.reveals.status IS
  'verified = Prospeo validation passed; unverified = returned but not validated; '
  'invalid = email/phone returned but bounced / disconnected.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Primary free re-enrichment lookup
CREATE INDEX IF NOT EXISTS idx_reveals_org_person_type
  ON public.reveals(org_id, person_id, type);

-- Lookup by candidate_id (for candidate detail page)
CREATE INDEX IF NOT EXISTS idx_reveals_candidate
  ON public.reveals(candidate_id, type);

-- Lookup by who revealed (usage audit)
CREATE INDEX IF NOT EXISTS idx_reveals_revealed_by
  ON public.reveals(revealed_by, created_at DESC);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.reveals ENABLE ROW LEVEL SECURITY;

-- All org members can read reveals for their org
CREATE POLICY "org_members_reveals_select"
  ON public.reveals FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- All org members can insert reveals (triggered by reveal action)
CREATE POLICY "org_members_reveals_insert"
  ON public.reveals FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Allow UPDATE only for status correction (e.g. bounce marking)
-- Only owner/admin can update reveal status
CREATE POLICY "owner_admin_reveals_update"
  ON public.reveals FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );

-- NO DELETE policy — reveals are a permanent audit trail
