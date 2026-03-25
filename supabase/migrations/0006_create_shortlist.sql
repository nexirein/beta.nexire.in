-- =============================================================================
-- 0006_create_shortlist.sql
-- Owner: nexire-data
-- Purpose: Shortlist entries — pipeline tracking for candidates within a project.
--          UNIQUE (project_id, candidate_id) — one pipeline card per candidate per project.
-- Dependencies: 0001, 0002, 0003
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: shortlist_entries
-- Represents a candidate's pipeline status within a specific project.
-- The candidate (from Intelligence DB) can appear in multiple projects,
-- but only once per project in the shortlist.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shortlist_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'screening', 'interview', 'offer', 'rejected')),
  notes         text,
  ctc_lpa       numeric(6,2),   -- recruiter-filled CTC estimate in Indian LPA
  added_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One pipeline card per candidate per project
  CONSTRAINT shortlist_project_candidate_unique UNIQUE (project_id, candidate_id)
);

COMMENT ON TABLE public.shortlist_entries IS
  'Pipeline tracking for candidates within a project. '
  'UNIQUE (project_id, candidate_id) prevents duplicate cards.';
COMMENT ON COLUMN public.shortlist_entries.status IS
  'Kanban pipeline: new → screening → interview → offer | rejected.';
COMMENT ON COLUMN public.shortlist_entries.ctc_lpa IS
  'Current CTC estimate in Indian Lakhs Per Annum. Recruiter-filled field. '
  'Not available from Prospeo — must be entered manually.';
COMMENT ON COLUMN public.shortlist_entries.notes IS
  'Recruiter notes — visible to team members in same org.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Primary query: all shortlisted candidates for a project, by status
CREATE INDEX IF NOT EXISTS idx_shortlist_project_status
  ON public.shortlist_entries(project_id, status);

-- Org-level view (across all projects)
CREATE INDEX IF NOT EXISTS idx_shortlist_org
  ON public.shortlist_entries(org_id, created_at DESC);

-- Find all projects a candidate appears in (candidate history view)
CREATE INDEX IF NOT EXISTS idx_shortlist_candidate
  ON public.shortlist_entries(candidate_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_shortlist_updated_at
  BEFORE UPDATE ON public.shortlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.shortlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_shortlist_select"
  ON public.shortlist_entries FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_shortlist_insert"
  ON public.shortlist_entries FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_shortlist_update"
  ON public.shortlist_entries FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_shortlist_delete"
  ON public.shortlist_entries FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
