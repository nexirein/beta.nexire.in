<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/auth.md            ← this module's API contract
-->

M01 — TASK 03: ROW LEVEL SECURITY (RLS) POLICIES
Trae: Run all SQL in Supabase SQL editor AFTER task 02 is complete.
RLS ensures users can ONLY access their own data.
OBJECTIVE
Enable RLS on all tables and create policies so:

Users only read/write their own rows

Public routes (client view share page) can read specific rows

Service role (admin operations) bypasses all RLS

STEP 1 — Enable RLS on all tables
sql
ALTER TABLE organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE searches               ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE reveals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortlists             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_emails_sent   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_views           ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_view_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnc_list               ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans                  ENABLE ROW LEVEL SECURITY;
STEP 2 — Profiles Policies
sql
-- Users can only read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Prevent users from inserting directly (handled by trigger)
-- INSERT is blocked; handle_new_user trigger does it
STEP 3 — Organizations Policies
sql
-- Owner can see their org
CREATE POLICY "orgs_select_member"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only owner can update org
CREATE POLICY "orgs_update_owner"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
STEP 4 — Credit Ledger Policies
sql
-- Users can only read their own ledger (NEVER write — use RPC)
CREATE POLICY "credit_ledger_select_own"
  ON credit_ledger FOR SELECT
  USING (user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE — use deduct_credits() RPC only
STEP 5 — Candidates Policies
sql
-- Anyone authenticated can SELECT candidates (they're a shared enrichment cache)
-- But email/phone columns are only accessible after a reveal (enforced at API level)
CREATE POLICY "candidates_select_authenticated"
  ON candidates FOR SELECT
  USING (auth.role() = 'authenticated');

-- No direct INSERT/UPDATE from client — API routes use service role
STEP 6 — Searches Policies
sql
CREATE POLICY "searches_select_own"
  ON searches FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "searches_insert_own"
  ON searches FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "searches_update_own"
  ON searches FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "searches_delete_own"
  ON searches FOR DELETE
  USING (user_id = auth.uid());
STEP 7 — Search Results Policies
sql
-- Users can see results from their own searches
CREATE POLICY "search_results_select_own"
  ON search_results FOR SELECT
  USING (
    search_id IN (
      SELECT id FROM searches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "search_results_insert_own"
  ON search_results FOR INSERT
  WITH CHECK (
    search_id IN (
      SELECT id FROM searches WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "search_results_update_own"
  ON search_results FOR UPDATE
  USING (
    search_id IN (
      SELECT id FROM searches WHERE user_id = auth.uid()
    )
  );
STEP 8 — Projects Policies
sql
CREATE POLICY "projects_select_own_or_org"
  ON projects FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      visibility = 'shared'
      AND org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "projects_insert_own"
  ON projects FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "projects_update_own"
  ON projects FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "projects_delete_own"
  ON projects FOR DELETE
  USING (user_id = auth.uid());
STEP 9 — Reveals Policies
sql
CREATE POLICY "reveals_select_own"
  ON reveals FOR SELECT
  USING (user_id = auth.uid());

-- No direct INSERT — handled via API route using service role after RPC
STEP 10 — Shortlists Policies
sql
CREATE POLICY "shortlists_select_own"
  ON shortlists FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "shortlists_insert_own"
  ON shortlists FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "shortlists_update_own"
  ON shortlists FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "shortlists_delete_own"
  ON shortlists FOR DELETE
  USING (user_id = auth.uid());
STEP 11 — Sequences Policies
sql
CREATE POLICY "sequences_select_own"
  ON sequences FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "sequences_insert_own"
  ON sequences FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "sequences_update_own"
  ON sequences FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "sequences_delete_own"
  ON sequences FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "enrollments_select_own"
  ON sequence_enrollments FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "enrollments_insert_own"
  ON sequence_enrollments FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "enrollments_update_own"
  ON sequence_enrollments FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "emails_sent_select_own"
  ON sequence_emails_sent FOR SELECT
  USING (
    enrollment_id IN (
      SELECT id FROM sequence_enrollments WHERE user_id = auth.uid()
    )
  );
STEP 12 — Client Views Policies
sql
-- Owner can CRUD their client views
CREATE POLICY "client_views_select_own"
  ON client_views FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "client_views_insert_own"
  ON client_views FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "client_views_update_own"
  ON client_views FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "client_views_delete_own"
  ON client_views FOR DELETE USING (user_id = auth.uid());

-- PUBLIC: Anyone with the token can view (for share page)
-- This is handled by service role in the API route, not RLS
-- The public /share/[token] page calls /api/client-view/[token] which uses service role

-- Client view events: public insert (for tracking), owner reads
CREATE POLICY "client_view_events_insert_public"
  ON client_view_events FOR INSERT
  WITH CHECK (TRUE);  -- Anyone can insert a view event

CREATE POLICY "client_view_events_select_own"
  ON client_view_events FOR SELECT
  USING (
    client_view_id IN (
      SELECT id FROM client_views WHERE user_id = auth.uid()
    )
  );
STEP 13 — Subscriptions + Plans Policies
sql
CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT USING (user_id = auth.uid());

-- Plans are readable by all authenticated users
CREATE POLICY "plans_select_all"
  ON plans FOR SELECT USING (auth.role() = 'authenticated');
STEP 14 — DNC List Policies
sql
CREATE POLICY "dnc_select_own"
  ON dnc_list FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "dnc_insert_own"
  ON dnc_list FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "dnc_delete_own"
  ON dnc_list FOR DELETE USING (user_id = auth.uid());
STEP 15 — VERIFY All Policies Active
Run this query to verify:

sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
Expected: 30+ policies across all tables.

COMPLETION CHECKLIST
 RLS enabled on all 17 tables

 profiles policies: select + update own

 credit_ledger: select only (no direct write)

 candidates: authenticated read (contact data guarded at API level)

 client_views: owner CRUD + public events insert

 plans: readable by all authenticated

 pg_policies query shows 30+ rows

BUILD LOG ENTRY
Append to _meta/BUILD-LOG.md:

M01-03 RLS Policies — [date]
Policies Created: 30+ policies across all 17 tables
Status: ✅ Complete