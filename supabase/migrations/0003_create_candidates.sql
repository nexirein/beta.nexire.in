-- =============================================================================
-- 0003_create_candidates.sql
-- Owner: nexire-data
-- Purpose: Nexire Intelligence DB — candidates are persistent org-level records,
--          not temporary search results. Also creates the searches table.
-- Dependencies: 0001, 0002
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: searches
-- Log of every Prospeo search run by the org.
-- Linked to a project; filters_json and criteria_json are stored for replay.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  query           text,           -- free-text query if used
  filters_json    jsonb,          -- Prospeo filter payload
  criteria_json   jsonb,          -- AI scoring criteria (skills, seniority, etc.)
  result_count    integer NOT NULL DEFAULT 0,
  page            integer NOT NULL DEFAULT 1,
  credits_used    integer NOT NULL DEFAULT 0,
  was_cached      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.searches IS 'Audit log of all searches. Cached results do not appear here (only billed searches logged).';
COMMENT ON COLUMN public.searches.filters_json IS 'Raw Prospeo filter object — same shape as API request body.';
COMMENT ON COLUMN public.searches.criteria_json IS 'Nexire AI scoring criteria — min_score, required_skills, seniority preference, etc.';
COMMENT ON COLUMN public.searches.was_cached IS 'True = Redis cache hit, credit was not charged this run.';

-- ---------------------------------------------------------------------------
-- TABLE: candidates
-- THE NEXIRE INTELLIGENCE DB.
--
-- Key design rules:
--   1. UNIQUE (org_id, person_id) — upsert on every search, never duplicate
--   2. Upsert enriches the row — later searches may update name/headline/score
--   3. Reveals attach to this row via the reveals table
--   4. Shortlist references this row — candidate persists across projects
--   5. raw_json stores the full Prospeo payload for future feature extraction
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  person_id               text NOT NULL,    -- Prospeo's person identifier (stable)
  full_name               text,
  headline                text,             -- current role + company (Prospeo field)
  current_title           text,
  current_company         text,
  location                text,
  skills_json             jsonb,            -- array of skill strings
  linkedin_url            text,
  profile_pic_url         text,
  tenure_months           integer,          -- months at current role (from Prospeo)
  estimated_notice_days   integer           -- derived: <6m=0, 6-18m=30, 18-36m=60, >36m=90
                            GENERATED ALWAYS AS (
                              CASE
                                WHEN tenure_months IS NULL  THEN NULL
                                WHEN tenure_months < 6      THEN 0
                                WHEN tenure_months < 18     THEN 30
                                WHEN tenure_months < 36     THEN 60
                                ELSE 90
                              END
                            ) STORED,
  ai_score                integer CHECK (ai_score BETWEEN 0 AND 100),
  hidden                  boolean NOT NULL DEFAULT false,
  raw_json                jsonb,            -- full Prospeo response payload
  first_seen_at           timestamptz NOT NULL DEFAULT now(),
  last_enriched_at        timestamptz NOT NULL DEFAULT now(),

  -- Unique constraint: each org owns one row per Prospeo person
  CONSTRAINT candidates_org_person_unique UNIQUE (org_id, person_id)
);

COMMENT ON TABLE public.candidates IS
  'Nexire Intelligence DB. Persistent per-org candidate records. '
  'Use INSERT ... ON CONFLICT (org_id, person_id) DO UPDATE to upsert from search results.';
COMMENT ON COLUMN public.candidates.person_id IS
  'Prospeo stable person identifier. Never changes for the same real person.';
COMMENT ON COLUMN public.candidates.estimated_notice_days IS
  'Computed from tenure_months. Not a Prospeo field — Nexire Intelligence Layer value.';
COMMENT ON COLUMN public.candidates.ai_score IS
  'Nexire AI match score 0-100. 80-100=good, 50-79=potential, <50=no match.';
COMMENT ON COLUMN public.candidates.raw_json IS
  'Full Prospeo response stored for future feature extraction without new API calls.';
COMMENT ON COLUMN public.candidates.hidden IS
  'If true, hidden from search results (e.g. unqualified candidates recruiter dismissed).';

-- ---------------------------------------------------------------------------
-- TABLE: search_candidates (join — which candidates appeared in which search)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     uuid NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  position      integer,          -- rank in search results (1-indexed)
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_candidates_unique UNIQUE (search_id, candidate_id)
);

COMMENT ON TABLE public.search_candidates IS 'Tracks which candidates appeared in which search run, for replay and AI reranking.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Primary Intelligence DB lookup: find candidate by person_id within org
CREATE INDEX IF NOT EXISTS idx_candidates_org_person
  ON public.candidates(org_id, person_id);

-- Score-based filtering (most common sort for search results UI)
CREATE INDEX IF NOT EXISTS idx_candidates_org_score
  ON public.candidates(org_id, ai_score DESC NULLS LAST);

-- Hidden filter (recruiters toggle hidden candidates)
CREATE INDEX IF NOT EXISTS idx_candidates_org_hidden
  ON public.candidates(org_id, hidden);

-- Search log by project
CREATE INDEX IF NOT EXISTS idx_searches_org_project
  ON public.searches(org_id, project_id, created_at DESC);

-- Join table by search
CREATE INDEX IF NOT EXISTS idx_search_candidates_search
  ON public.search_candidates(search_id, position);

-- Join table by candidate (find all searches a candidate appeared in)
CREATE INDEX IF NOT EXISTS idx_search_candidates_candidate
  ON public.search_candidates(candidate_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.searches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_candidates  ENABLE ROW LEVEL SECURITY;

-- Helper: get caller's org_id inline
-- (avoids repeating the subquery in every policy)

-- searches: org members full access
CREATE POLICY "org_members_searches_select"
  ON public.searches FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_searches_insert"
  ON public.searches FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- candidates: org members can read their org's Intelligence DB
CREATE POLICY "org_members_candidates_select"
  ON public.candidates FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- candidates: org members can upsert (search results write into Intelligence DB)
CREATE POLICY "org_members_candidates_insert"
  ON public.candidates FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_candidates_update"
  ON public.candidates FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- search_candidates: same as parent tables
CREATE POLICY "org_members_search_candidates_select"
  ON public.search_candidates FOR SELECT
  USING (
    search_id IN (
      SELECT id FROM public.searches
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "org_members_search_candidates_insert"
  ON public.search_candidates FOR INSERT
  WITH CHECK (
    search_id IN (
      SELECT id FROM public.searches
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );
