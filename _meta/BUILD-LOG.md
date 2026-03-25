# NEXIRE — BUILD LOG
# Format: ## [Module]-[Task] [Feature Name] — [YYYY-MM-DD]
# Maintained by: nexire-docs agent + any agent that completes a task
# Rule: Append only. Never delete entries. Keep each entry concise.

---

## Phase 0 — Repo OS & Context System — 2026-03-06

### Files created:
- `CLAUDE.md` — master context file with 8 absolute rules
- `_meta/HLD-COMPACT.md` — full architecture reference v2.0 (11 sections)
- `_meta/BUILD-LOG.md` — this file
- `.claude/agents/nexire-architect.md` — system architect agent
- `.claude/agents/nexire-backend.md` — backend engineer agent
- `.claude/agents/nexire-data.md` — database engineer agent
- `.claude/agents/nexire-docs.md` — documentation agent
- `.claude/agents/nexire-frontend.md` — frontend engineer agent
- `.claude/agents/nexire-qa.md` — QA engineer agent
- `prompts/M00-MULTI-AGENT/` — multi-agent build guides
- `prompts/M01-AUTH/` through `prompts/M11-SETTINGS/` — all module prompt folders
- `.env.example` — all 14 environment variables documented
- `docs/SETUP.md` — local dev setup guide
- `docs/AUTH.md` — authentication flow reference
- `docs/DATABASE.md` — full 17-table schema + RLS policy guide
- `docs/DEPLOYMENT.md` — Vercel deployment notes
- `docs/api/m01-auth.md` through `docs/api/m11-settings.md` — API contract placeholders
- `README.md` — project overview
- `supabase/migrations/` — migration folder scaffolded

### Status: ✅ Phase 0 Complete

### Exit criteria met:
- [x] Repo scaffolded
- [x] Prompt vault organised by module (M00–M11)
- [x] CLAUDE.md exists with all absolute rules
- [x] _meta/HLD-COMPACT.md v2.0 complete
- [x] .claude/agents/*.md all 6 agents defined
- [x] .env.example with all env vars
- [x] build/lint/typecheck commands listed in SETUP.md

### Agent ownership confirmed:
- nexire-architect → CLAUDE.md, HLD-COMPACT.md, BUILD-LOG.md, docs/OVERVIEW.md
- nexire-backend   → app/api/**, lib/**, supabase/functions/**
- nexire-data      → supabase/migrations/**, docs/DATABASE.md, lib/supabase/queries/**
- nexire-docs      → docs/**, README.md, BUILD-LOG.md (append only)
- nexire-frontend  → app/(app)/**, app/(auth)/**, components/**
- nexire-qa        → __tests__/**, e2e/**, test config files

---

## Phase 1 — Database Foundation — 2026-03-06

### Files created:

**SQL Migrations** (`supabase/migrations/`):
- `0001_create_orgs_and_profiles.sql` — orgs + profiles + `handle_new_user()` trigger
- `0002_create_projects.sql` — projects table
- `0003_create_candidates.sql` — candidates (Intelligence DB) + searches + search_candidates join
- `0004_create_reveals.sql` — reveals with UNIQUE (org_id, person_id, type) free re-enrichment key
- `0005_create_credit_transactions.sql` — append-only credit ledger (no UPDATE/DELETE RLS)
- `0006_create_shortlist.sql` — shortlist_entries with UNIQUE (project_id, candidate_id)
- `0007_create_mailboxes.sql` — mailboxes with user vs admin RLS split
- `0008_create_sequences.sql` — sequences + sequence_enrollments with next_send_at cron index
- `0009_create_client_views.sql` — client_views with public token SELECT + client_view_candidates
- `0010_create_contacts_dnc.sql` — contacts + dnc_list (domain blocking, owner-only DELETE)
- `0011_create_saved_searches.sql` — saved_searches with use_count tracking
- `0012_create_org_invitations.sql` — org_invitations with public token SELECT

**TypeScript Layer**:
- `types/database.ts` — all 17 table types + enums + ProspeoFilters + ScoringCriteria + ApiResponse wrappers
- `lib/supabase/server.ts` — createServerClient() + createAdminClient() factories
- `lib/supabase/queries/orgs.ts` — getProfile, getProfileWithOrg, requireOrgId, getOrgTeam
- `lib/supabase/queries/candidates.ts` — upsertCandidate (DO UPDATE on conflict), upsertCandidateBatch, getCandidateByPersonId
- `lib/supabase/queries/reveals.ts` — getExistingReveal (free re-enrichment gate), insertReveal, getRevealsByCandidateId
- `lib/supabase/queries/credits.ts` — deductCredits, grantCredits (atomic balance + ledger), getRecentTransactions

**Documentation updated**:
- `docs/DATABASE.md` — Intelligence DB section added, migration file table, notice period algorithm, updated table count to 18

### Status: ✅ Phase 1 Complete

### Exit criteria met:
- [x] 12 migrations clean SQL with correct FK ordering
- [x] 18 tables (17 original + search_candidates join)
- [x] RLS on every table
- [x] Performance indexes on all hot query paths
- [x] `candidates` UNIQUE (org_id, person_id) conflict key locked
- [x] `reveals` UNIQUE (org_id, person_id, type) — free re-enrichment key
- [x] `credit_transactions` insert-only in RLS (no UPDATE/DELETE policies)
- [x] `estimated_notice_days` is GENERATED ALWAYS AS from tenure_months
- [x] `sequence_enrollments.next_send_at` for efficient cron scheduling
- [x] TypeScript types complete and correct
- [x] DATABASE.md aligned with actual schema

### Notable design decisions:
- `handle_new_user()` trigger fires on auth.users INSERT — auto-creates org + profile
- `candidates.estimated_notice_days` is a Postgres GENERATED column — never set from app code
- `client_views` has a public SELECT policy (no auth.uid() check) — token is the secret
- `org_invitations` has a public SELECT policy — accept-invite page is unauthenticated
- `credit_transactions` has intentionally NO UPDATE or DELETE RLS policies

---

## [Next entry goes here after Phase 2 begins]

## M03-SEARCH — Search robustness + nearby expansion — 2026-03-11
### Files created:
- `scripts/test-prospeo-pm-india.js`
- `scripts/test-prospeo-support-pune.js`
### Status: ✅ Complete
