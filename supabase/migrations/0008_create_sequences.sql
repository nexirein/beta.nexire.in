-- =============================================================================
-- 0008_create_sequences.sql
-- Owner: nexire-data
-- Purpose: Email sequences (drip campaigns) + enrollment tracking.
--          sequence_enrollments has next_send_at for efficient cron scheduling.
-- Dependencies: 0001, 0002, 0003, 0007
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: sequences
-- A sequence is a named multi-step email campaign linked to a project.
-- steps_json stores the ordered list of email steps.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  steps_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- steps_json shape: [{ "step": 1, "delay_days": 0, "subject": "", "body": "" }, ...]
  -- body supports tokens: {{first_name}}, {{company}}, {{role}}
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sequences IS 'Multi-step email sequences for candidate outreach. Linked to a project.';
COMMENT ON COLUMN public.sequences.steps_json IS
  'Array of step objects: [{"step":1,"delay_days":0,"subject":"...","body":"..."}]. '
  'Body supports {{first_name}}, {{company}}, {{role}} template tokens.';

-- ---------------------------------------------------------------------------
-- TABLE: sequence_enrollments
-- Tracks each candidate's progress through a sequence.
-- next_send_at: the timestamp when the NEXT email should fire.
-- The cron job queries: WHERE status = ''active'' AND next_send_at <= now()
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  sequence_id     uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  mailbox_id      uuid REFERENCES public.mailboxes(id) ON DELETE SET NULL,
  current_step    integer NOT NULL DEFAULT 0,   -- 0 = not started, 1 = step 1 sent, etc.
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'completed', 'bounced', 'dnc')),
  next_send_at    timestamptz,    -- NULL when completed; set on enrollment + after each send
  enrolled_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  error_message   text,           -- populated when status = 'bounced'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Candidate enrolled only once per sequence
  CONSTRAINT enrollment_sequence_candidate_unique UNIQUE (sequence_id, candidate_id)
);

COMMENT ON TABLE public.sequence_enrollments IS
  'Tracks per-candidate progress in a sequence. '
  'next_send_at is the primary cron scheduling column — query: status=active AND next_send_at <= now().';
COMMENT ON COLUMN public.sequence_enrollments.current_step IS
  '0 = enrolled but no email sent yet. N = Nth email has been sent.';
COMMENT ON COLUMN public.sequence_enrollments.next_send_at IS
  'Pre-computed timestamp for next email. Set at enrollment time and updated after each send.';
COMMENT ON COLUMN public.sequence_enrollments.status IS
  'dnc = candidate email matched DNC list; bounced = delivery failed; paused = manual.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Sequences by org/project
CREATE INDEX IF NOT EXISTS idx_sequences_org_project
  ON public.sequences(org_id, project_id, status);

-- Primary cron query: find active enrollments due to send
CREATE INDEX IF NOT EXISTS idx_enrollments_cron
  ON public.sequence_enrollments(status, next_send_at)
  WHERE status = 'active';

-- Enrollments by sequence (for sequence management UI)
CREATE INDEX IF NOT EXISTS idx_enrollments_sequence
  ON public.sequence_enrollments(sequence_id, status);

-- Enrollments by candidate (candidate history)
CREATE INDEX IF NOT EXISTS idx_enrollments_candidate
  ON public.sequence_enrollments(candidate_id, status);

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGERS
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_sequences_updated_at
  BEFORE UPDATE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_enrollments_updated_at
  BEFORE UPDATE ON public.sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.sequences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- sequences: all org members full CRUD
CREATE POLICY "org_members_sequences_select"
  ON public.sequences FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_sequences_insert"
  ON public.sequences FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_sequences_update"
  ON public.sequences FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_sequences_delete"
  ON public.sequences FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- sequence_enrollments: all org members can read/insert/update
CREATE POLICY "org_members_enrollments_select"
  ON public.sequence_enrollments FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_enrollments_insert"
  ON public.sequence_enrollments FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org_members_enrollments_update"
  ON public.sequence_enrollments FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Admin/owner can delete enrollments (unenroll a candidate)
CREATE POLICY "owner_admin_enrollments_delete"
  ON public.sequence_enrollments FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );
