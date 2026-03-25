-- =============================================================================
-- 0009_create_client_views.sql
-- Owner: nexire-data
-- Purpose: Shareable client-facing views (public share links with optional password).
--          client_views.token is the only public identifier — no auth required to read.
-- Dependencies: 0001, 0002, 0003
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: client_views
-- A share link for an external client to review a curated shortlist.
-- Optional password protection and expiry.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  token         text UNIQUE NOT NULL,   -- URL-safe random token (app generates this)
  title         text,                   -- display title for the client view
  password_hash text,                   -- bcrypt hash; NULL = no password required
  expires_at    timestamptz,            -- NULL = never expires
  view_count    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_views IS
  'Shareable candidate shortlist links. token is the public identifier. '
  'password_hash is bcrypt. Verify in app with bcrypt.compare().';
COMMENT ON COLUMN public.client_views.token IS
  'URL-safe random string (e.g. nanoid). Used in /share/[token] route.';
COMMENT ON COLUMN public.client_views.password_hash IS
  'NULL = no password. bcrypt hash when password is set. '
  'Verify server-side in GET /api/client-view/[token]/verify.';

-- ---------------------------------------------------------------------------
-- TABLE: client_view_candidates
-- Which candidates are visible in a given share link.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_view_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id       uuid NOT NULL REFERENCES public.client_views(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  position      integer,          -- display order in client view
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_view_candidates_unique UNIQUE (view_id, candidate_id)
);

COMMENT ON TABLE public.client_view_candidates IS 'Curated list of candidates visible in a share link.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Primary lookup for /share/[token] public route
CREATE INDEX IF NOT EXISTS idx_client_views_token
  ON public.client_views(token)
  WHERE is_active = true;

-- Org management view
CREATE INDEX IF NOT EXISTS idx_client_views_org
  ON public.client_views(org_id, created_at DESC);

-- Candidates in a view (for rendering)
CREATE INDEX IF NOT EXISTS idx_client_view_candidates_view
  ON public.client_view_candidates(view_id, position NULLS LAST);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_client_views_updated_at
  BEFORE UPDATE ON public.client_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- SPECIAL: client_views needs a public SELECT policy for /share/[token] route
--          (unauthenticated users accessing a shared link)
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_views           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_view_candidates ENABLE ROW LEVEL SECURITY;

-- PUBLIC: anyone with the token can read the view metadata
-- (password check is done in the API handler, not in RLS)
CREATE POLICY "public_can_read_active_client_view_by_token"
  ON public.client_views FOR SELECT
  USING (is_active = true);

-- ORG MEMBERS: can manage their own org's shared views
CREATE POLICY "org_members_client_views_insert"
  ON public.client_views FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_client_views_update"
  ON public.client_views FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_client_views_delete"
  ON public.client_views FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- client_view_candidates: anyone can read (for public share link rendering)
CREATE POLICY "public_can_read_view_candidates"
  ON public.client_view_candidates FOR SELECT
  USING (
    view_id IN (SELECT id FROM public.client_views WHERE is_active = true)
  );

CREATE POLICY "org_members_view_candidates_insert"
  ON public.client_view_candidates FOR INSERT
  WITH CHECK (
    view_id IN (
      SELECT id FROM public.client_views
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "org_members_view_candidates_delete"
  ON public.client_view_candidates FOR DELETE
  USING (
    view_id IN (
      SELECT id FROM public.client_views
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );
