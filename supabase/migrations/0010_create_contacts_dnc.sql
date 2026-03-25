-- =============================================================================
-- 0010_create_contacts_dnc.sql
-- Owner: nexire-data
-- Purpose: Contacts ledger + Do Not Contact list.
--          contacts mirrors reveal data at the org level.
--          dnc_list blocks outreach by email address or entire domain.
-- Dependencies: 0001, 0003, 0004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: contacts
-- An org-level view of all known contacts (from reveals or manual import).
-- Linked to a candidate when sourced from Intelligence DB.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  candidate_id  uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  email         text,
  phone         text,
  source        text NOT NULL DEFAULT 'reveal'
                  CHECK (source IN ('reveal', 'manual', 'import')),
  dnc           boolean NOT NULL DEFAULT false,
  dnc_reason    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contacts IS
  'Org-level contact book. Populated from reveals and manual entry. '
  'dnc flag is per-contact; dnc_list covers domains and patterns.';
COMMENT ON COLUMN public.contacts.source IS
  'reveal = added when email/phone was revealed; manual = recruiter added; import = bulk.';

-- ---------------------------------------------------------------------------
-- TABLE: dnc_list
-- Email addresses or entire domains to never contact.
-- Checked before every sequence email send.
-- UNIQUE (org_id, value) prevents duplicate entries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dnc_list (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  value       text NOT NULL,       -- email address OR domain (e.g. competitor.com)
  type        text NOT NULL CHECK (type IN ('email', 'domain')),
  reason      text,
  added_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate DNC entries per org
  CONSTRAINT dnc_list_org_value_unique UNIQUE (org_id, value)
);

COMMENT ON TABLE public.dnc_list IS
  'Do Not Contact list. Block by email or by domain. '
  'Checked before every sequence email send and on reveal.';
COMMENT ON COLUMN public.dnc_list.type IS
  'email = specific address; domain = entire @domain.com is blocked.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contacts_org_dnc
  ON public.contacts(org_id, dnc);

CREATE INDEX IF NOT EXISTS idx_contacts_candidate
  ON public.contacts(candidate_id);

-- DNC lookup: check a specific value within an org
CREATE INDEX IF NOT EXISTS idx_dnc_list_org_value
  ON public.dnc_list(org_id, value);

-- DNC lookup by type (fast domain-only or email-only queries)
CREATE INDEX IF NOT EXISTS idx_dnc_list_org_type
  ON public.dnc_list(org_id, type);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER (contacts only — dnc_list is effectively immutable)
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_list  ENABLE ROW LEVEL SECURITY;

-- contacts: all org members
CREATE POLICY "org_members_contacts_select"
  ON public.contacts FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_contacts_insert"
  ON public.contacts FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_contacts_update"
  ON public.contacts FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- dnc_list: all org members can read and insert
CREATE POLICY "org_members_dnc_select"
  ON public.dnc_list FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_dnc_insert"
  ON public.dnc_list FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Only owner/admin can remove a DNC entry (accidental removal is a compliance risk)
CREATE POLICY "owner_admin_dnc_delete"
  ON public.dnc_list FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );
