-- =============================================================================
-- 0011_create_saved_searches.sql
-- Owner: nexire-data
-- Purpose: Saved filter presets for the Search Library module.
--          Recruiters save filter+criteria combos for quick re-run.
-- Dependencies: 0001
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: saved_searches
-- Stores named snapshots of search filter sets.
-- use_count is incremented on every "re-run this search" action.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name            text NOT NULL,
  filters_json    jsonb,          -- Prospeo filter payload
  criteria_json   jsonb,          -- AI scoring criteria
  use_count       integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.saved_searches IS
  'Named search filter presets. use_count tracks popularity for Search Library sorting.';
COMMENT ON COLUMN public.saved_searches.filters_json IS 'Same shape as searches.filters_json — Prospeo filter payload.';
COMMENT ON COLUMN public.saved_searches.criteria_json IS 'Same shape as searches.criteria_json — AI scoring criteria.';
COMMENT ON COLUMN public.saved_searches.use_count IS 'Incremented each time a recruiter clicks "Re-run this search".';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Most popular saved searches first
CREATE INDEX IF NOT EXISTS idx_saved_searches_org_popular
  ON public.saved_searches(org_id, use_count DESC);

-- Recent saves
CREATE INDEX IF NOT EXISTS idx_saved_searches_org_recent
  ON public.saved_searches(org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_saved_searches_select"
  ON public.saved_searches FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_saved_searches_insert"
  ON public.saved_searches FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_saved_searches_update"
  ON public.saved_searches FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_saved_searches_delete"
  ON public.saved_searches FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
