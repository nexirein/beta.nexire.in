-- =============================================================================
-- 0001_create_orgs_and_profiles.sql
-- Owner: nexire-data
-- Purpose: Core identity layer — orgs + profiles + auto-create trigger
-- Dependencies: auth.users (Supabase built-in)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: orgs
-- One org per company. Team members share an org.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orgs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL DEFAULT 'My Organisation',
  plan                      text NOT NULL DEFAULT 'free'
                              CHECK (plan IN ('free', 'solo', 'growth', 'custom')),
  billing_cycle             text NOT NULL DEFAULT 'monthly'
                              CHECK (billing_cycle IN ('monthly', 'annual')),
  credits_balance           integer NOT NULL DEFAULT 50,
  credits_used              integer NOT NULL DEFAULT 0,
  credits_monthly           integer NOT NULL DEFAULT 50,
  cycle_resets_at           timestamptz,
  razorpay_subscription_id  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orgs IS 'One row per organisation. All business data is scoped to org_id.';
COMMENT ON COLUMN public.orgs.credits_balance IS 'Live spendable balance. Decremented on reveal, incremented on top-up/grant.';
COMMENT ON COLUMN public.orgs.credits_monthly IS 'Monthly grant amount for this plan. Used by cron/reset-credits.';

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- One profile per Supabase auth user. id = auth.users.id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  member_role   text NOT NULL DEFAULT 'member'
                  CHECK (member_role IN ('owner', 'admin', 'member')),
  full_name     text,
  avatar_url    text,
  job_title     text,
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Extended user profile. id matches auth.users.id exactly.';
COMMENT ON COLUMN public.profiles.member_role IS 'owner = first user in org; admin = invited with admin; member = default invite role.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_org_id       ON public.profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_orgs_plan             ON public.orgs(plan);

-- ---------------------------------------------------------------------------
-- UPDATED_AT AUTO-TRIGGER (shared utility function)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- AUTO-CREATE ORG + PROFILE ON SIGNUP
-- Fires when a new row appears in auth.users (Google OAuth or Magic Link)
-- Creates a new org for the user (every signup = new org).
-- Team invite flow creates profile WITHOUT this trigger (invite acceptance).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  -- Create a new org for this user
  INSERT INTO public.orgs (name, plan, credits_balance, credits_monthly, cycle_resets_at)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'org_name', 'My Organisation'),
    'free',
    50,
    50,
    (now() + interval '1 month')
  )
  RETURNING id INTO new_org_id;

  -- Create the profile as 'owner'
  INSERT INTO public.profiles (id, org_id, member_role, full_name, avatar_url)
  VALUES (
    NEW.id,
    new_org_id,
    'owner',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.orgs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- orgs: members can SELECT their own org
CREATE POLICY "org_members_can_read_own_org"
  ON public.orgs FOR SELECT
  USING (
    id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- orgs: only owner/admin can UPDATE their org
CREATE POLICY "org_owner_admin_can_update_org"
  ON public.orgs FOR UPDATE
  USING (
    id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );

-- profiles: org members can read all profiles in their org
CREATE POLICY "org_members_can_read_profiles"
  ON public.profiles FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- profiles: users can update their own profile
CREATE POLICY "users_can_update_own_profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- profiles: handle_new_user trigger inserts (SECURITY DEFINER bypasses RLS)
-- No explicit INSERT policy needed for auto-trigger path.

-- profiles: owner/admin can insert profiles (for invite acceptance)
CREATE POLICY "owner_admin_can_insert_profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
  );

-- profiles: owner/admin can delete members (remove from team)
CREATE POLICY "owner_admin_can_delete_members"
  ON public.profiles FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND member_role IN ('owner', 'admin')
    )
    AND member_role != 'owner'  -- owner cannot be removed
  );
