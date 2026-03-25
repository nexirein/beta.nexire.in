<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/auth.md            ← this module's API contract
-->

M01 — TASK 02: DATABASE SCHEMA + SUPABASE SETUP
Trae: Read CLAUDE.md first. Execute all SQL in Supabase SQL editor.
After completion, run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
OBJECTIVE
Create all Supabase database tables, enums, functions, and triggers for Nexire.
This schema covers ALL 11 modules — create it fully now so no breaking changes later.

STEP 1 — SUPABASE CLIENT FILES
lib/supabase/client.ts (browser client)
typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
lib/supabase/server.ts (server component + API route client)
typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

// Service role client (admin operations — NEVER expose to client)
export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
lib/supabase/middleware.ts
typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/onboarding");
  const isAppPage = path.startsWith("/projects") || path.startsWith("/search") || path.startsWith("/contacts") || path.startsWith("/sequences") || path.startsWith("/library") || path.startsWith("/billing") || path.startsWith("/settings");

  if (isAppPage && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isAuthPage && user && path !== "/onboarding") {
    return NextResponse.redirect(new URL("/projects", request.url));
  }

  return supabaseResponse;
}
middleware.ts (Next.js root middleware)
typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|share|api/client-view|api/billing/webhook|api/resend-webhook).*)"],
};
STEP 2 — SQL SCHEMA (run in Supabase SQL editor)
2a — Custom Types / Enums
sql
-- Plan tiers
CREATE TYPE plan_tier AS ENUM ('free', 'solo', 'growth', 'custom');

-- Organization role
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member', 'hiring_manager');

-- Onboarding step tracking
CREATE TYPE onboarding_step AS ENUM ('plan_selection', 'profile_setup', 'complete');

-- Project status
CREATE TYPE project_status AS ENUM ('active', 'closed', 'on_hold');

-- Project visibility
CREATE TYPE project_visibility AS ENUM ('private', 'shared');

-- Shortlist pipeline status
CREATE TYPE shortlist_status AS ENUM ('new', 'reviewing', 'contacting', 'offered', 'rejected', 'hired');

-- Sequence status
CREATE TYPE sequence_status AS ENUM ('draft', 'active', 'paused', 'archived');

-- Sequence enrollment status
CREATE TYPE enrollment_status AS ENUM ('active', 'replied', 'unsubscribed', 'bounced', 'completed');

-- Credit transaction reason
CREATE TYPE credit_reason AS ENUM (
  'monthly_credit', 'topup', 'email_reveal', 'phone_reveal',
  'manual_admin', 'refund', 'signup_bonus'
);

-- Reveal type
CREATE TYPE reveal_type AS ENUM ('email', 'phone_email');

-- Subscription status (mirrors Razorpay)
CREATE TYPE subscription_status AS ENUM (
  'created', 'authenticated', 'active', 'paused', 'cancelled', 'expired'
);

-- Billing cycle
CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual');

-- Match label
CREATE TYPE match_label AS ENUM ('good', 'potential', 'no_match');
2b — Organizations Table
sql
CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  plan_tier         plan_tier NOT NULL DEFAULT 'free',
  owner_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  credits_pool      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
2c — Profiles Table (extends auth.users)
sql
CREATE TABLE profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            TEXT,
  email                TEXT UNIQUE,
  phone                TEXT,
  avatar_url           TEXT,
  plan_tier            plan_tier NOT NULL DEFAULT 'free',
  org_id               UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role_in_org          org_role DEFAULT 'owner',
  onboarding_step      onboarding_step NOT NULL DEFAULT 'plan_selection',
  onboarding_done      BOOLEAN NOT NULL DEFAULT FALSE,
  credits_balance      INTEGER NOT NULL DEFAULT 15,
  credits_monthly_cap  INTEGER NOT NULL DEFAULT 15,
  results_used_mtd     INTEGER NOT NULL DEFAULT 0,
  active_roles_count   INTEGER NOT NULL DEFAULT 0,
  active_sequences_count INTEGER NOT NULL DEFAULT 0,
  razorpay_customer_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create a personal org for the user
  INSERT INTO organizations (name, owner_id, plan_tier)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Workspace',
    NEW.id,
    'free'
  )
  RETURNING id INTO new_org_id;

  -- Create profile
  INSERT INTO profiles (id, full_name, email, org_id, role_in_org, plan_tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    new_org_id,
    'owner',
    'free'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
2d — Plans Reference Table
sql
CREATE TABLE plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  plan_tier UNIQUE NOT NULL,
  price_monthly_inr     INTEGER NOT NULL DEFAULT 0,
  price_annual_inr      INTEGER NOT NULL DEFAULT 0,
  credits_monthly       INTEGER NOT NULL DEFAULT 15,
  max_results_monthly   INTEGER NOT NULL DEFAULT 10,   -- -1 = unlimited
  max_roles             INTEGER NOT NULL DEFAULT 1,    -- -1 = unlimited
  max_sequences         INTEGER NOT NULL DEFAULT 1,    -- -1 = unlimited
  max_seats             INTEGER NOT NULL DEFAULT 1,    -- -1 = unlimited
  razorpay_plan_id_monthly TEXT,
  razorpay_plan_id_annual  TEXT
);

-- Insert plan data
INSERT INTO plans (name, price_monthly_inr, price_annual_inr, credits_monthly, max_results_monthly, max_roles, max_sequences, max_seats) VALUES
('free',   0,      0,       15,   10,    1,  1,  1),
('solo',   3999,   39990,   200,  1500,  5,  5,  1),
('growth', 7999,   79990,   600,  -1,   -1, -1,  3),
('custom', 24999,  249990,  -1,   -1,   -1, -1, -1);
2e — Credit Ledger (immutable)
sql
CREATE TABLE credit_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delta           INTEGER NOT NULL,           -- positive=add, negative=deduct
  balance_after   INTEGER NOT NULL,
  reason          credit_reason NOT NULL,
  reference_id    UUID,                       -- FK to reveals.id or subscriptions.id
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX credit_ledger_user_id_idx ON credit_ledger(user_id, created_at DESC);
2f — CRITICAL: Atomic Credit Deduction RPC
sql
-- This is the ONLY function that should deduct credits.
-- Returns error if insufficient balance.
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_reason     credit_reason,
  p_reference  UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- Lock the row for update
  SELECT credits_balance INTO current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF current_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF current_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'balance', current_balance,
      'required', p_amount
    );
  END IF;

  new_balance := current_balance - p_amount;

  -- Deduct from profile
  UPDATE profiles
  SET credits_balance = new_balance, updated_at = NOW()
  WHERE id = p_user_id;

  -- Log to ledger (immutable)
  INSERT INTO credit_ledger (user_id, delta, balance_after, reason, reference_id)
  VALUES (p_user_id, -p_amount, new_balance, p_reason, p_reference);

  RETURN json_build_object(
    'success', true,
    'credits_used', p_amount,
    'balance_after', new_balance
  );
END;
$$;

-- Refund function (used when Prospeo call fails after deduction)
CREATE OR REPLACE FUNCTION refund_credits(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_note       TEXT DEFAULT 'API failure refund'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE profiles
  SET credits_balance = credits_balance + p_amount, updated_at = NOW()
  WHERE id = p_user_id
  RETURNING credits_balance INTO new_balance;

  INSERT INTO credit_ledger (user_id, delta, balance_after, reason, note)
  VALUES (p_user_id, p_amount, new_balance, 'refund', p_note);

  RETURN json_build_object('success', true, 'balance_after', new_balance);
END;
$$;

-- Add credits (on subscription renewal)
CREATE OR REPLACE FUNCTION add_monthly_credits(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_reference  UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE profiles
  SET credits_balance = credits_balance + p_amount, updated_at = NOW()
  WHERE id = p_user_id
  RETURNING credits_balance INTO new_balance;

  INSERT INTO credit_ledger (user_id, delta, balance_after, reason, reference_id)
  VALUES (p_user_id, p_amount, new_balance, 'monthly_credit', p_reference);

  RETURN json_build_object('success', true, 'credits_added', p_amount, 'balance_after', new_balance);
END;
$$;
2g — Candidates Table
sql
CREATE TABLE candidates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospeo_id        TEXT UNIQUE NOT NULL,
  full_name         TEXT NOT NULL,
  headline          TEXT,
  current_title     TEXT,
  current_company   TEXT,
  location_city     TEXT,
  location_state    TEXT,
  location_country  TEXT DEFAULT 'India',
  experience_years  INTEGER,
  skills            TEXT[] DEFAULT '{}',
  education_json    JSONB DEFAULT '[]',
  work_history_json JSONB DEFAULT '[]',
  linkedin_url      TEXT,
  email             TEXT,                -- NULL until enriched
  email_status      TEXT,               -- VERIFIED | UNVERIFIED | null
  phone             TEXT,               -- NULL until enriched
  phone_status      TEXT,               -- VERIFIED | null
  last_enriched_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX candidates_prospeo_id_idx ON candidates(prospeo_id);
CREATE INDEX candidates_email_idx ON candidates(email) WHERE email IS NOT NULL;
2h — Searches Table
sql
CREATE TABLE searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id      UUID,                 -- FK added after projects table
  query_text      TEXT,
  filters_json    JSONB NOT NULL DEFAULT '{}',
  criteria_json   JSONB NOT NULL DEFAULT '[]',
  result_count    INTEGER DEFAULT 0,
  redis_cache_key TEXT,
  saved           BOOLEAN DEFAULT FALSE,
  saved_name      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX searches_user_id_idx ON searches(user_id, created_at DESC);
CREATE INDEX searches_saved_idx ON searches(user_id) WHERE saved = TRUE;
2i — Projects Table
sql
CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id            UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  company           TEXT,
  location          TEXT,
  ctc_min_lpa       NUMERIC(6,2),
  ctc_max_lpa       NUMERIC(6,2),
  notice_max_days   INTEGER,
  jd_text           TEXT,
  jd_url            TEXT,
  status            project_status NOT NULL DEFAULT 'active',
  visibility        project_visibility NOT NULL DEFAULT 'private',
  shortlist_count   INTEGER NOT NULL DEFAULT 0,
  contacted_count   INTEGER NOT NULL DEFAULT 0,
  ats_job_id        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ
);

-- Add FK to searches now that projects exists
ALTER TABLE searches ADD CONSTRAINT searches_project_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX projects_user_id_idx ON projects(user_id, created_at DESC);
CREATE INDEX projects_status_idx ON projects(user_id, status);
2j — Search Results Table
sql
CREATE TABLE search_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id       UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  ai_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  match_label     match_label NOT NULL DEFAULT 'potential',
  match_reasons   JSONB NOT NULL DEFAULT '[]',
  rank_position   INTEGER NOT NULL DEFAULT 0,
  hidden          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(search_id, candidate_id)
);

CREATE INDEX search_results_search_id_idx ON search_results(search_id, rank_position);
2k — Reveals Table (immutable log)
sql
CREATE TABLE reveals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id        UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  reveal_type         reveal_type NOT NULL,
  credits_used        INTEGER NOT NULL,
  prospeo_cost_inr    NUMERIC(8,2) NOT NULL,
  prospeo_request_id  TEXT,
  free_enrichment     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX reveals_user_id_idx ON reveals(user_id, created_at DESC);
CREATE INDEX reveals_candidate_user_idx ON reveals(user_id, candidate_id);
2l — Shortlists Table
sql
CREATE TABLE shortlists (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  candidate_id        UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  status              shortlist_status NOT NULL DEFAULT 'new',
  notes               TEXT,
  ctc_expected_lpa    NUMERIC(6,2),    -- manual field (Prospeo doesn't have this)
  notice_days_actual  INTEGER,          -- manual field (recruiter fills this)
  added_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id, candidate_id)
);

CREATE INDEX shortlists_project_id_idx ON shortlists(project_id, status);
CREATE INDEX shortlists_user_id_idx ON shortlists(user_id, added_at DESC);
2m — Sequences + Enrollments
sql
CREATE TABLE sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  status          sequence_status NOT NULL DEFAULT 'draft',
  steps_json      JSONB NOT NULL DEFAULT '[]',
  enrolled_count  INTEGER NOT NULL DEFAULT 0,
  replied_count   INTEGER NOT NULL DEFAULT 0,
  open_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sequence_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_step    INTEGER NOT NULL DEFAULT 0,
  status          enrollment_status NOT NULL DEFAULT 'active',
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_send_at    TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  UNIQUE(sequence_id, candidate_id)
);

CREATE TABLE sequence_emails_sent (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_index      INTEGER NOT NULL,
  resend_email_id TEXT,
  subject         TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ
);
2n — Client Views Table
sql
CREATE TABLE client_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  token           UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  candidates_json JSONB NOT NULL DEFAULT '[]',
  password_hash   TEXT,
  view_count      INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_view_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_view_id  UUID NOT NULL REFERENCES client_views(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,       -- 'viewed' | 'candidate_clicked'
  candidate_id    UUID,
  ip_hash         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX client_views_token_idx ON client_views(token);
2o — Subscriptions Table
sql
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id                 UUID REFERENCES plans(id),
  razorpay_sub_id         TEXT UNIQUE,
  razorpay_plan_id        TEXT,
  status                  subscription_status NOT NULL DEFAULT 'created',
  billing_cycle           billing_cycle NOT NULL DEFAULT 'monthly',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
2p — DNC List
sql
CREATE TABLE dnc_list (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email     TEXT,
  phone     TEXT,
  reason    TEXT,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dnc_must_have_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX dnc_email_idx ON dnc_list(user_id, email) WHERE email IS NOT NULL;
STEP 3 — Generate TypeScript Types
After running all SQL above, run this command:

bash
npx supabase gen types typescript --project-id YOUR_SUPABASE_PROJECT_ID > types/database.ts
Then verify types/database.ts was created and has all tables listed.

COMPLETION CHECKLIST
 All ENUMs created

 All 17 tables created

 deduct_credits() RPC function works (test: SELECT deduct_credits('user-id', 1, 'email_reveal'))

 refund_credits() works

 add_monthly_credits() works

 handle_new_user() trigger fires on auth.users insert

 types/database.ts generated

 lib/supabase/client.ts, server.ts, middleware.ts created

BUILD LOG ENTRY
Append to _meta/BUILD-LOG.md:

M01-02 Database Schema — [date]
Tables Created: organizations, profiles, plans, credit_ledger, candidates, searches, search_results, projects, reveals, shortlists, sequences, sequence_enrollments, sequence_emails_sent, client_views, client_view_events, subscriptions, dnc_list (17 total)
RPC Functions: deduct_credits, refund_credits, add_monthly_credits
Triggers: handle_new_user, update_updated_at (all tables)
Status: ✅ Complete