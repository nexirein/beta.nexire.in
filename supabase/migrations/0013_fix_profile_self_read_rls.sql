-- =============================================================================
-- Fix: Add direct self-read policy for profiles + orgs
-- The existing RLS policy uses a self-referencing subquery that can fail
-- for newly created profiles after OAuth signup.
-- =============================================================================

-- Allow users to always read their OWN profile row (id = auth.uid() directly)
CREATE POLICY "users_can_read_own_profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Allow users to read their org by joining through their own profile
-- (this is more reliable than the existing policy for freshly created rows)
CREATE POLICY "user_can_read_own_org"
  ON public.orgs FOR SELECT
  USING (
    id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );
