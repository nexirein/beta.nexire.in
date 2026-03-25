# NEXIRE — PRODUCTION BUILD GUIDE
# Multi-Agent Strategy: Claude Code + OpenCode + Trae
# How to go from 40 prompt files → production-ready app
# For: Bipul Sikder | nexire.in

---

## PART 1 — TOOL LANDSCAPE (what you have & what each does)

╔══════════════════════════════════════════════════════════════════╗
║  TOOL          BEST FOR                  COST       USE IN NEXIRE ║
╠══════════════════════════════════════════════════════════════════╣
║  Trae          Full IDE agent, free,     Free       Primary IDE   ║
║                reads @files natively     (Trae AI)  for all code  ║
╠══════════════════════════════════════════════════════════════════╣
║  Claude Code   Terminal agent, spawns    $20/mo     Orchestrator  ║
║                subagents, .claude/agents Max plan   + parallel    ║
║                folder, 200K ctx window              subagents     ║
╠══════════════════════════════════════════════════════════════════╣
║  OpenCode      Open-source terminal TUI, Free/BYOK  Fallback when ║
║                BYOK (Anthropic key),                Claude limits ║
║                SDK for programmatic use             hit           ║
╠══════════════════════════════════════════════════════════════════╣
║  Antigravity   Google/Gemini 3, agent-   Waitlist   Future —      ║
║                first, 1M ctx, browser               good for QA   ║
║                automation, manager view             + browser UI  ║
╠══════════════════════════════════════════════════════════════════╣
║  Ruflo         Orchestrates many Claude Free OSS    Advanced      ║
║  (ruvnet)      agents in coordinated swarms         parallel      ║
║                (ex “Claude Flow”)                   builds later  ║
╚══════════════════════════════════════════════════════════════════╝

RECOMMENDATION FOR NEXIRE RIGHT NOW:
  Primary:   Trae (you already have it, reads @files, free)
  Parallel:  Claude Code Max ($20/mo) for running multiple agents
  Overflow:  OpenCode with your Anthropic API key (BYOK, no limits)
  Later:     Ruflo once you hit M06+ (sequences, complex flows)

---

## PART 2 — THE 6-AGENT TEAM FOR NEXIRE

Think of this like a startup engineering team.
Each agent has ONE job, ONE folder scope, and cannot touch other agents' files.

╔══════════════════════════════════════════════════════════════════════╗
║ AGENT          SCOPE                    TOOL        RUNS            ║
╠══════════════════════════════════════════════════════════════════════╣
║ 🏗️  ARCHITECT   CLAUDE.md, HLD-COMPACT,  Trae/CC     Sequential     ║
║                DATABASE.md, migrations,             (you review)   ║
║                lib/supabase/queries/                               ║
╠══════════════════════════════════════════════════════════════════════╣
║ ⚙️  BACKEND     app/api/**, lib/**,       Claude Code  Parallel with ║
║                types/**, hooks/**        Max          Frontend      ║
╠══════════════════════════════════════════════════════════════════════╣
║ 🎨  FRONTEND    app/(app)/**, app/(auth)  Trae         Parallel with ║
║                components/**             (primary)    Backend       ║
╠══════════════════════════════════════════════════════════════════════╣
║ 🧪  QA/TESTER  __tests__/**, *.test.ts,  OpenCode     After each    ║
║                Playwright e2e, Vitest     (BYOK)       module done   ║
╠══════════════════════════════════════════════════════════════════════╣
║ 📊  DATA AGENT  Supabase migrations,      Claude Code  Only when     ║
║                RLS policies, seeds,       Max          schema changes ║
║                credit_engine.ts                                     ║
╠══════════════════════════════════════════════════════════════════════╣
║ 📝  DOC AGENT   docs/**, _meta/**,        OpenCode     After each    ║
║                README, BUILD-LOG.md       (BYOK)        module done  ║
╚══════════════════════════════════════════════════════════════════════╝

GOLDEN RULE: BACKEND + FRONTEND run in parallel.
             DATA AGENT runs FIRST (schema must exist before code).
             QA AGENT runs LAST (after code is written).
             ARCHITECT runs only for structural decisions.

---

## PART 3 — SETTING UP CLAUDE CODE CUSTOM SUBAGENTS

Claude Code has a .claude/agents/ folder where you define named subagents.
Each agent = one .md file = one specialisation.
Call them with: "Use the nexire-backend agent to build M03 search API"

### Step 1 — Create .claude/agents/ in your project root

nexire-app/
└── .claude/
    └── agents/
        ├── nexire-architect.md
        ├── nexire-backend.md
        ├── nexire-frontend.md
        ├── nexire-qa.md
        ├── nexire-data.md
        └── nexire-docs.md

### Step 2 — Content of each agent file

─────────────────────────────────────────────────
FILE: .claude/agents/nexire-backend.md
─────────────────────────────────────────────────
---
name: nexire-backend
description: Builds Next.js API routes for Nexire. Handles all app/api/** files,
  lib/** utilities, and server-side logic. Always reads CLAUDE.md and
  _meta/HLD-COMPACT.md before touching any file.
tools:
  - Read
  - Write
  - Edit
  - Bash
---

You are the backend engineer for Nexire — a Juicebox-for-India recruitment platform.

## Your scope
- app/api/** (all API routes)
- lib/supabase/queries/**
- lib/prospeo/**
- lib/credits/engine.ts
- lib/redis/**
- lib/razorpay/**
- lib/resend/**
- lib/ai/**
- types/**
- hooks/**

## Always start by reading
- CLAUDE.md
- _meta/HLD-COMPACT.md

## Non-negotiable rules
1. Every API route: auth check first line, Zod validation second
2. Credit logic: ONLY in lib/credits/engine.ts
3. Prospeo calls: ONLY via lib/prospeo/client.ts
4. Every DB query scoped by org_id
5. Every candidate result upserted to candidates table (Intelligence DB)
6. Return { error: string } on failure, never raw errors
7. Rate limit check (Redis) before any business logic

## DO NOT touch
- app/(app)/** (frontend — that's nexire-frontend agent)
- components/** (frontend)
- supabase/migrations (that's nexire-data agent)

─────────────────────────────────────────────────
FILE: .claude/agents/nexire-frontend.md
─────────────────────────────────────────────────
---
name: nexire-frontend
description: Builds React UI components for Nexire using Next.js App Router,
  Tailwind CSS, and Framer Motion. Always uses design tokens from HLD-COMPACT.
tools:
  - Read
  - Write
  - Edit
---

You are the frontend engineer for Nexire.

## Your scope
- app/(app)/**
- app/(auth)/**
- components/**
- app/share/**

## Always start by reading
- CLAUDE.md
- _meta/HLD-COMPACT.md (especially §3 Design Tokens)

## Design rules (memorise these)
- bg: #0A0A0A | surface: #111111 | border: #1A1A1A
- accent: #38BDF8 | text: #FAFAFA | muted: #555555
- Font: Geist | Cards: rounded-2xl border border-[#1A1A1A] bg-[#111111]
- Every component needs: loading skeleton + empty state + error state
- Framer Motion for all state transitions
- Mobile responsive (sidebar collapses to bottom nav on mobile)

## DO NOT touch
- app/api/** (that's nexire-backend agent)
- lib/** (that's nexire-backend agent)
- supabase/** (that's nexire-data agent)

─────────────────────────────────────────────────
FILE: .claude/agents/nexire-data.md
─────────────────────────────────────────────────
---
name: nexire-data
description: Manages Supabase schema, migrations, RLS policies, and seeds
  for Nexire. The only agent that writes to supabase/migrations/.
tools:
  - Read
  - Write
  - Edit
  - Bash
---

You are the database architect for Nexire.

## Your scope
- supabase/migrations/**
- supabase/seed.sql
- supabase/config.toml
- lib/supabase/queries/** (create query helpers here)
- docs/DATABASE.md (keep this updated)

## Non-negotiable rules
1. Every table has org_id FK → orgs
2. Every table has RLS: users access only their org's data
3. candidates table uses person_id as UNIQUE conflict key
4. All migrations are numbered: 001_init, 002_rls, 003_indexes, etc.
5. Never drop columns — add nullable columns only
6. Test every migration with: supabase db reset && supabase db push

─────────────────────────────────────────────────
FILE: .claude/agents/nexire-qa.md
─────────────────────────────────────────────────
---
name: nexire-qa
description: Writes and runs tests for Nexire. Vitest for unit/integration,
  Playwright for E2E. Runs after each module is completed.
tools:
  - Read
  - Write
  - Edit
  - Bash
---

You are the QA engineer for Nexire.

## Your scope
- __tests__/**
- e2e/**
- vitest.config.ts
- playwright.config.ts

## Test priorities (in order)
1. lib/credits/engine.ts — test every credit deduction case
2. app/api/reveal/** — test free enrichment cache logic
3. app/api/search/ — test Prospeo filter mapping
4. app/api/billing/webhook — test Razorpay HMAC verification
5. RLS policies — test cross-org data isolation

---

## PART 4 — PARALLEL EXECUTION PLAN (exact sequence for Nexire)

### PHASE 0 — Foundation (do this ONCE, manually, before any agent runs)
  Time: ~2 hours

  Step 1: npx create-next-app@latest nexire-app --typescript --tailwind --app
  Step 2: Install dependencies
          npx shadcn@latest init
          npm i @supabase/supabase-js @supabase/ssr
          npm i @upstash/redis @upstash/ratelimit
          npm i razorpay resend
          npm i openai           ← for AI scoring
          npm i zod framer-motion
          npm i @sentry/nextjs posthog-js
          npm i geist             ← Vercel font

  Step 3: Setup Supabase project → get ANON_KEY + SERVICE_ROLE_KEY
  Step 4: Setup Upstash Redis → get REST_URL + REST_TOKEN
  Step 5: Create .env.local with all vars from HLD-COMPACT §10
  Step 6: Put CLAUDE.md + _meta/HLD-COMPACT.md in project root
  Step 7: Create .claude/agents/ folder with all 5 agent files above

### PHASE 1 — Database First (sequential, ~3 hours)
  WHO: nexire-data agent (Trae or Claude Code)
  WHAT: Run prompt files in order:
    M01/01-project-setup.md
    M01/02-database-schema.md   ← all 17 tables
    M01/03-rls-policies.md      ← RLS for every table

  VERIFY: supabase db push runs clean, 0 errors
  GATE: Do NOT proceed to Phase 2 until schema is clean

### PHASE 2 — Auth + App Shell (sequential, ~4 hours)
  WHO: nexire-frontend + nexire-backend running in parallel
  Frontend: M01/04-auth-pages.md + M01/05-onboarding-flow.md
  Backend:  M02/01-app-shell.md (sidebar, layout, auth guard)

  VERIFY: Can sign up with Google, complete onboarding, land in dashboard
  GATE: Auth must work before search can be built

### PHASE 3 — Core Search (MOST IMPORTANT, ~2 days)
  WHO: nexire-backend + nexire-frontend in parallel

  Run these in parallel (two terminal windows):
  ┌─────────────────────────────────┐  ┌──────────────────────────────────┐
  │ BACKEND AGENT                   │  │ FRONTEND AGENT                   │
  │ M03/01-prospeo-client.md        │  │ M02/02-projects-page.md          │
  │ M03/02-redis-rate-limiter.md    │  │ M02/03-create-project-modal.md   │
  │ M03/10-search-api-route.md      │  │ M03/04-search-page.md            │
  │ M03/03-ai-scorer.md             │  │ M03/05-candidate-result-card.md  │
  └─────────────────────────────────┘  │ M03/07-bulk-actions-history.md   │
                                        │ M03/09-insights-panel.md         │
                                        └──────────────────────────────────┘

  VERIFY: Search returns Prospeo results, AI scores shown, cards render

### PHASE 4 — Reveal + Intelligence DB (~1 day)
  WHO: nexire-backend FIRST, then nexire-frontend
  NOTE: Run SEQUENTIAL — both touch candidates table + credit engine

  Backend first (M04):
    M04/01-credit-engine-rpc.md
    M04/02-email-reveal-flow.md   ← upserts to candidates table
    M04/03-phone-reveal-flow.md   ← upserts to candidates table
    M04/04-whatsapp-link.md

  Frontend after backend done:
    M03/06-reveal-api.md          ← reveal buttons on candidate cards
    M04/profile-slideover.md
    M04/overage-modal.md

  VERIFY: Email reveal costs 1 credit, phone costs 8,
          re-reveal of same person = 0 credits (cached)

### PHASE 5 — Shortlist + Billing (parallel, ~2 days)
  ┌─────────────────────────────────────┐  ┌──────────────────────────────┐
  │ BACKEND: M05 Shortlist              │  │ BACKEND: M10 Billing         │
  │ + FRONTEND: M05 pipeline board      │  │ + FRONTEND: M10 billing page │
  └─────────────────────────────────────┘  └──────────────────────────────┘

  SAFE to run in parallel — no shared files

  VERIFY: Can shortlist candidate, move through pipeline,
          Razorpay subscription creates, webhook fires, credits added

  ───── MVP SHIPS HERE ─────

### PHASE 6 — Post-MVP Features (after first users)
  M06 Sequences → M07 Client Dashboard → M08 Contacts → M09 Library
  Run these one at a time after MVP validation

---

## PART 5 — HOW TO RUN PARALLEL AGENTS IN PRACTICE

### Method A: Claude Code Max (recommended, $20/mo)
  Open 2 terminal windows side by side.

  Terminal 1 (Backend):
    cd nexire-app
    claude
    > Use the nexire-backend agent.
    > Read @prompts/M03/01-prospeo-client.md and build it completely.

  Terminal 2 (Frontend):
    cd nexire-app
    claude
    > Use the nexire-frontend agent.
    > Read @prompts/M03/04-search-page.md and build it completely.

  Both run simultaneously. They don't conflict (different file scopes).

### Method B: Trae + OpenCode simultaneously
  Trae:     Frontend work in the IDE (visual, file tree visible)
  OpenCode: Backend work in terminal (fast, BYOK Anthropic key)

  OpenCode setup:
    npm install -g opencode
    opencode  ← starts TUI
    /connect  ← paste your Anthropic API key
    > Read CLAUDE.md and _meta/HLD-COMPACT.md first.
    > Then read @prompts/M03/10-search-api-route.md and build it.

### Method C: Ruflo (for Phase 6+ complex modules)
  When you hit sequences (M06) which has many sub-tasks, use Ruflo:

  npx ruflo@latest init --wizard

  Ruflo is best used after MVP, when your agent scopes and phase gates are already stable.

---

## PART 6 — CONTEXT DRIFT PREVENTION (biggest risk in multi-agent)

Context drift = agent forgets the architecture and starts inventing patterns.
This ruins the codebase. Prevent it with these rules:

### Rule 1 — ALWAYS start with the context chain
  Every agent session must begin with:
  "Read CLAUDE.md and _meta/HLD-COMPACT.md before doing anything else."
  This takes 30 seconds but saves hours of wrong-pattern code.

### Rule 2 — Use the BUILD-LOG.md as a handoff document
  After every agent finishes a task, it appends to _meta/BUILD-LOG.md:
  "What I built | What files I created | What the next agent needs to know"

  The next agent reads BUILD-LOG.md before starting.
  This is how agents "talk to each other" without a live connection.

### Rule 3 — Scope gates in each agent definition
  The DO NOT sections in each .claude/agents/*.md file prevent agents
  from touching each other's files. This is the most important drift control.

### Rule 4 — Single source of truth for shared logic
  lib/credits/engine.ts    ← ONLY place for credit deduction
  lib/prospeo/client.ts    ← ONLY place for Prospeo calls
  supabase/migrations/     ← ONLY place for schema changes
  These files are marked as "single source of truth" in CLAUDE.md.
  Agents are told to import, never rewrite.

### Rule 5 — Checkpoint after every module
  After each module (M01, M02, etc.) is done:
  1. Run: npm run build   ← must pass 0 errors
  2. Run: npx tsc --noEmit ← must pass 0 TypeScript errors
  3. Push to Git with message: "✅ M03 complete"
  4. If build fails: fix before starting next module

---

## PART 7 — OPENCODE SETUP (for parallel overflow)

OpenCode is open-source (github.com/anomalyco/opencode).
Use it when Claude Code hits rate limits or you want a second agent running.

  # Install
  npm install -g opencode

  # First run (recommended)
  opencode
  /connect   ← paste your Anthropic API key when prompted

  # Always load core context first
  > Read CLAUDE.md and _meta/HLD-COMPACT.md first.

  # Run
  opencode

  # Best use cases for Nexire:
  - QA agent: write Vitest tests after module is done
  - Doc agent: update docs/ folder after each module
  - Overflow: when Claude Code Max limits hit, switch to OpenCode

---

## PART 8 — EXACT WEEK-BY-WEEK EXECUTION PLAN

  WEEK 1    Phase 0 (setup) + Phase 1 (DB schema + RLS)
            Gate: npm run build passes, Supabase migration clean
            Agent: nexire-data

  WEEK 2    Phase 2 (Auth + App Shell)
            Gate: Google OAuth works, onboarding completes, sidebar renders
            Agents: nexire-frontend + nexire-backend parallel

  WEEK 3    Phase 3 Part 1 (Prospeo client + Redis + Search API)
            Gate: POST /api/search returns 25 Prospeo results
            Agent: nexire-backend (sequential, foundation work)

  WEEK 4    Phase 3 Part 2 (Search UI)
            Gate: Cards render, AI scores show, filters work
            Agents: nexire-frontend + nexire-backend parallel

  WEEK 5    Phase 4 (Reveal + Intelligence DB)
            Gate: Email reveal = 1 credit, re-reveal = 0 credits
            Agents: nexire-backend FIRST, then nexire-frontend

  WEEK 6    Phase 5 (Shortlist + Billing)
            Gate: Pipeline board works, Razorpay sub creates + fires webhook
            Agents: M05 + M10 parallel (different files)

  ─── MVP LIVE ─────────────────────────────────────────────────────

  WEEK 7    M06 Sequences (email outreach)
  WEEK 8    M07 Client Dashboard (shareable links)
  WEEK 9    M08/M09 Contacts + Library
  WEEK 10   Polish: error states, empty states, keyboard shortcuts

---

## PART 9 — QUICK CHEAT SHEET (print this)

  ┌────────────────────────────────────────────────────────────────┐
  │  START OF EVERY AGENT SESSION                                  │
  │  "Read CLAUDE.md and _meta/HLD-COMPACT.md first."             │
  ├────────────────────────────────────────────────────────────────┤
  │  BEFORE PARALLEL WORK                                          │
  │  Check: do these two prompt files touch shared files?          │
  │  Shared = lib/credits/engine.ts, lib/prospeo/client.ts,       │
  │           candidates table queries                             │
  │  If shared → run sequential. If not → run parallel.           │
  ├────────────────────────────────────────────────────────────────┤
  │  AFTER EVERY MODULE                                            │
  │  1. npm run build (0 errors)                                   │
  │  2. npx tsc --noEmit (0 type errors)                          │
  │  3. Git commit: "✅ M0X complete"                              │
  │  4. Update _meta/BUILD-LOG.md                                  │
  ├────────────────────────────────────────────────────────────────┤
  │  WHEN AGENT GOES OFF-TRACK                                     │
  │  Stop. Start new session. Say:                                 │
  │  "Read CLAUDE.md and HLD-COMPACT. We're building Nexire.      │
  │   You went off-track. Here's what we need instead: [X]"       │
  └────────────────────────────────────────────────────────────────┘
