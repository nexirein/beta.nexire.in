-- =============================================================================
-- 0002_create_projects.sql
-- Owner: nexire-data
-- Purpose: Projects table — recruiter workspaces that hold searches + shortlists
-- Dependencies: 0001_create_orgs_and_profiles.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: projects
-- A project represents one open role / hiring requirement.
-- Searches, shortlists, and sequences are all scoped to a project.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'closed', 'archived')),
  jd_text       text,           -- job description pasted or typed by recruiter
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.projects IS 'Each project = one open role. All searches and shortlists hang off a project.';
COMMENT ON COLUMN public.projects.jd_text IS 'Raw JD text used as AI scoring context for candidates in this project.';
COMMENT ON COLUMN public.projects.status IS 'active = open role; closed = filled; archived = on hold.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_projects_org_id_status ON public.projects(org_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by    ON public.projects(created_by);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- All org members can create, read, and update projects in their org.
-- Only owner/admin can archive/delete.
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_can_select_projects"
  ON public.projects FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "org_members_can_insert_projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "org_members_can_update_projects"
  ON public.projects FOR UPDATE
  USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Only owner/admin can hard-delete a project
CREATE POLICY "owner_admin_can_delete_projects"
  ON public.projects FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );
