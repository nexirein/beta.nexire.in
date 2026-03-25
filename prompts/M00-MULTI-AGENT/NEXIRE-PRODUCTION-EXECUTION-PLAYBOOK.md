# NEXIRE — PRODUCTION EXECUTION PLAYBOOK
# Single-file operating manual for building Nexire end-to-end with Trae, Claude Code, and supporting agents
# Audience: Founder / operator running AI agents phase by phase
# Version: 1.0

---

## PURPOSE OF THIS FILE

This is the single operating document you should follow through the entire Nexire build journey.
It combines:
- the tool decision framework,
- the full agent system,
- where `nexire-architect.md` is used,
- what to run in each phase,
- which modules can run in parallel,
- what checkpoints must pass before moving forward,
- and how to reach a production-ready release without context drift.

If you feel confused during execution, come back to this file first.

---

## WHAT YOU ARE BUILDING

Nexire is a Juicebox-style recruiting product adapted for India.
Core ideas:
- candidate search powered by Prospeo,
- India-specific intelligence layer (notice period estimate, CTC later, WhatsApp outreach),
- credit-based reveal model,
- persistent candidate intelligence DB in Supabase,
- Razorpay billing,
- YC-style dark UI,
- recruiter-first workflows: projects, shortlist, sequences, client sharing, library, settings.

---

## OPERATING PRINCIPLE

Do **not** treat AI tools as one magical developer.
Treat them as a small engineering team.

You are the engineering manager.
The agents are specialists.
The documents (`CLAUDE.md`, `HLD-COMPACT.md`, `DATABASE.md`, `docs/api/*.md`, and prompt files) are your system of control.

That mindset is what makes the build clean.

---

# 1. TOOL STACK

## Tool roles

| Tool | Best use | Why use it | When not to use it |
|---|---|---|---|
| Trae | Main IDE + prompt execution | Best for visible file tree, @file context, editing, reviewing output | Not ideal for heavy parallel terminal orchestration |
| Claude Code | Main parallel build engine | Best for subagents, terminal workflows, long context, backend/frontend split | Avoid using one session for too many unrelated tasks |
| OpenCode | Overflow / QA / docs / second terminal worker | Good BYOK fallback when Claude Code limits or context gets crowded | Don’t make it your primary architecture source |
| Ruflo (ex Claude Flow) | Advanced multi-agent orchestration | Useful later for complex multi-step modules like Sequences | Overkill at the start; adds coordination overhead |
| Antigravity / other agent IDEs | Experimental research / browser-first workflows | Good to watch, potentially useful later | Don’t switch core workflow mid-build |

## Claude Code — setup + how to run (macOS)

This section is the “no mistakes” setup so your sessions stay stable and cheap.

### Install (recommended)

Run the native installer:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Verify it works:

```bash
claude --version
claude doctor
```

Start Claude Code from the project root:

```bash
cd /path/to/nexire-app2
claude
```

### What you should do inside every Claude Code session (always)

Use the same 5-step pattern every time:

1. Tell it to read: `CLAUDE.md` + `_meta/HLD-COMPACT.md` (always first).
2. Tell it to read exactly one prompt file for the task (example: one `prompts/M03/...` file).
3. Tell it “stay in your scope” (backend vs frontend vs data).
4. Tell it “list files you will touch before editing”.
5. After it finishes, you review diffs and then run gates (build/typecheck/tests).

### How to “navigate” Claude Code without getting lost

Keep your workflow simple:

- One session = one goal (one prompt file). If the goal changes, start a new session.
- One terminal window per agent (backend terminal, frontend terminal).
- If it starts inventing or drifting, stop and restart with the context chain again.

## Models + cost control (practical rules)

You want “good output at low cost”, so optimize for: fewer retries, smaller context, fewer reworks.

- Default model choice: use a fast “Sonnet-class” model for most coding work; use an “Opus-class” model only for architecture reviews, complex debugging, or critical shared-logic design.
- Keep prompts small: point to files instead of pasting long text. “Read these files” beats copy/paste.
- Prevent thrash: never run two agents on the same shared source-of-truth file at the same time.
- Reset often: new session per prompt file is cheaper than one giant session that forgets context.

## When to use OpenCode

Use OpenCode as a controlled overflow tool:

- second worker when Claude Code is busy or limits hit,
- QA/tests after a module is done,
- docs/log updates after a phase checkpoint.

Don’t use OpenCode to make architecture decisions. Keep architecture in `CLAUDE.md` / `_meta/HLD-COMPACT.md` and let the architect agent set direction.

## When to use Ruflo (and when not to)

Ruflo is an orchestration layer that can coordinate many specialized agents in a swarm and route tasks across them (so you can parallelize bigger modules safely). Use it later, not now:

- Use it after MVP, starting Phase 6 (Sequences/Client/Library) where tasks naturally split into many independent sub-tasks.
- Skip it in Phases 0–5 unless you already have clean agent scopes and strong phase gates, otherwise orchestration increases drift instead of speed.

## Recommended practical stack for Nexire

| Need | Recommended tool |
|---|---|
| Main day-to-day development | Trae |
| Parallel specialist execution | Claude Code |
| Overflow agent / QA / docs | OpenCode |
| Complex orchestration after MVP | Ruflo |

---

# 2. THE AGENT SYSTEM

You should run Nexire with **6 core agents**.
Do not start with more.
Too many agents create confusion instead of speed.

## Master agent map

| Agent | Main responsibility | Files it owns | When it runs |
|---|---|---|---|
| `nexire-architect` | architecture, standards, cross-module review, shared files | `CLAUDE.md`, `_meta/HLD-COMPACT.md`, `docs/DATABASE.md`, shared conventions, prompt standards | before a phase, after a phase, whenever design decisions change |
| `nexire-data` | DB schema, migrations, RLS, indexes, seeds, query helpers | `supabase/migrations/**`, `docs/DATABASE.md`, some `lib/supabase/queries/**` | first in Phase 0/1, then whenever schema changes |
| `nexire-backend` | APIs, business logic, external integrations, credits, redis, AI logic | `app/api/**`, `lib/**`, `types/**`, server hooks | during most build phases |
| `nexire-frontend` | pages, UI, components, state, UX consistency | `app/(app)/**`, `app/(auth)/**`, `app/share/**`, `components/**` | in parallel with backend when safe |
| `nexire-qa` | automated tests, regression checks, integration verification | `__tests__/**`, `e2e/**`, test configs | after each module or phase checkpoint |
| `nexire-docs` | docs sync, build logs, handoff notes, setup docs | `docs/**`, `_meta/**`, README, BUILD-LOG | after every completed phase or major module |

---

# 3. WHAT `nexire-architect.md` ACTUALLY DOES

This is the most misunderstood agent, so here is the simplest explanation:

## `nexire-architect` is **not** your daily coding agent

It should **not** be used to build random pages or APIs one by one.
That is wasteful.

Instead, `nexire-architect` is your:
- system planner,
- standards enforcer,
- file-boundary reviewer,
- conflict detector,
- phase starter,
- and phase closer.

## When to use `nexire-architect`

Use it in these 6 cases only:

1. **Before a new phase starts**  
   Ask it to review the relevant prompt files, shared dependencies, and recommended execution order.

2. **When shared files are involved**  
   Example: `CLAUDE.md`, `_meta/HLD-COMPACT.md`, `docs/DATABASE.md`, `lib/credits/engine.ts`, `lib/prospeo/client.ts`.

3. **When two modules may conflict**  
   Example: Search vs Reveal, Reveal vs Billing.

4. **When the build direction changes**  
   Example: adding the Intelligence DB rule, changing billing model, revising candidates schema.

5. **Before production hardening**  
   Ask it to audit security, env vars, failure paths, missing tests, monitoring, and deployment readiness.

6. **After a phase completes**  
   Ask it to perform a review: what was built, what remains, what risks exist, and whether the next phase is unblocked.

## When NOT to use `nexire-architect`

Do **not** use it for:
- building a card component,
- writing a single API route,
- styling a modal,
- implementing one small feature,
- fixing one isolated bug.

Those belong to `nexire-frontend`, `nexire-backend`, or `nexire-qa`.

## Simple mental model

- `nexire-architect` = CTO / tech lead
- `nexire-data` = database engineer
- `nexire-backend` = backend engineer
- `nexire-frontend` = product/frontend engineer
- `nexire-qa` = test engineer
- `nexire-docs` = technical program manager / docs engineer

That is the cleanest way to operate.

---

# 4. WHERE EACH AGENT IS USED PHASE-WISE

## Phase-by-phase agent usage table

| Phase | Architect | Data | Backend | Frontend | QA | Docs |
|---|---|---|---|---|---|---|
| Phase 0 — repo setup | Heavy | Medium | Low | Low | None | Low |
| Phase 1 — database foundation | Medium | Heavy | Low | None | Low | Low |
| Phase 2 — auth + app shell | Medium | Low | Medium | Heavy | Medium | Low |
| Phase 3 — search core | Medium | Medium | Heavy | Heavy | Medium | Low |
| Phase 4 — reveal + intelligence DB | Heavy | Medium | Heavy | Medium | Heavy | Medium |
| Phase 5 — shortlist + billing | Medium | Low | Heavy | Heavy | Medium | Low |
| Phase 6 — sequences / client / contacts / library | Medium | Low | Heavy | Heavy | Medium | Medium |
| Phase 7 — production hardening | Heavy | Medium | Heavy | Medium | Heavy | Heavy |

## Phase-by-phase tool + model guidance (low cost, low mistakes)

| Phase | Primary execution | Parallel rule | Model guidance | Use OpenCode? | Use Ruflo? |
|---|---|---|---|---|---|
| Phase 0 | Trae + Claude Code (architect-led) | mostly sequential | Sonnet-class | optional (docs only) | no |
| Phase 1 | Claude Code (data agent) | sequential | Sonnet-class; Opus-class only for schema review | optional (QA smoke) | no |
| Phase 2 | Claude Code (backend + frontend) | parallel safe | Sonnet-class | optional (QA) | no |
| Phase 3 | Claude Code (backend + frontend) | parallel after API contract locked | Sonnet-class; Opus-class for tricky search logic | optional (QA/tests) | no |
| Phase 4 | Claude Code (backend first) | mostly sequential | Opus-class for economics + shared logic review | yes (QA recommended) | no |
| Phase 5 | Claude Code (split workstreams) | parallel if file scopes don’t overlap | Sonnet-class; Opus-class for billing/webhook review | yes (QA recommended) | no |
| Phase 6 | Claude Code (many submodules) | partial parallel | Sonnet-class; Opus-class for mailbox/dnc/public-share design | yes | maybe |
| Phase 7 | Claude Code + Trae (audit + fixes) | sequential by risk | Opus-class for security/reliability review | yes | no |

---

# 5. PHASE 0 — REPOSITORY & OPERATING SYSTEM SETUP

## Goal
Create the repo, context system, environment structure, agent system, and development guardrails.
This is where the operating system of the project is set up.

## Why this phase matters
If Phase 0 is sloppy, every later agent will drift.
Most AI-generated codebases become messy because they skip this phase.

## Files and systems to establish in Phase 0

- project repo root
- `CLAUDE.md`
- `_meta/HLD-COMPACT.md`
- `_meta/BUILD-LOG.md`
- `docs/` folder
- `docs/api/` folder
- `prompts/` folder with module-wise prompts
- `.claude/agents/` folder
- `.env.example`
- local dev scripts
- basic lint/typecheck/build commands

## Who runs in Phase 0

### `nexire-architect`
Use this agent first.
Ask it to:
- review your overall file structure,
- verify module split,
- verify prompt naming conventions,
- define shared rules,
- verify agent scopes,
- and confirm build order.

### `nexire-data`
Then let it define the initial DB planning assumptions.
Not full schema yet — just migration structure, naming style, and org-scoping discipline.

### `nexire-docs`
Then let it generate/setup:
- `SETUP.md`,
- `DATABASE.md`,
- `AUTH.md`,
- placeholder `docs/api/*.md` files,
- and `BUILD-LOG.md` format.

## Deliverables for Phase 0

| Deliverable | Must exist before Phase 1 |
|---|---|
| Repo scaffolded | Yes |
| Prompt vault organised by module | Yes |
| `CLAUDE.md` | Yes |
| `_meta/HLD-COMPACT.md` | Yes |
| `.claude/agents/*.md` | Yes |
| `.env.example` | Yes |
| build / lint / typecheck commands | Yes |

## Exit criteria

- repo opens and runs locally,
- context docs exist,
- agent files exist,
- prompt folders are organised,
- you understand which agent owns which files.

---

# 6. PHASE 1 — DATABASE FOUNDATION

## Goal
Create the real backend foundation so later agents do not invent data structures.

This phase includes:
- core tables,
- relationships,
- RLS,
- indexes,
- query helper patterns,
- Intelligence DB design.

## Why this phase is critical
Everything in Nexire depends on correct org scoping, correct credit flows, and correct candidate persistence.
If the DB is wrong, Search, Reveal, Billing, Library, and Sequences all become brittle.

## Agents used

### Primary: `nexire-data`
This agent owns the implementation.

### Support: `nexire-architect`
Use it before and after the schema work.
It should validate:
- 17-table design,
- `person_id` uniqueness strategy,
- credit ledger model,
- reveal audit structure,
- shortlist relationship design,
- sequence enrollments,
- DNC model,
- and org-level isolation.

### Optional: `nexire-docs`
After schema is done, it updates `docs/DATABASE.md` and migration notes.

## What gets built in Phase 1

- `orgs`
- `profiles`
- `projects`
- `searches`
- `candidates`
- `reveals`
- `credit_transactions`
- `shortlist_entries`
- `sequences`
- `sequence_enrollments`
- `mailboxes`
- `client_views`
- `client_view_candidates`
- `contacts`
- `dnc_list`
- `saved_searches`
- `org_invitations`

## Special attention: candidates table

This is not just a temp result table.
It is the **Nexire Intelligence DB**.

That means:
- search results upsert lightweight profile rows,
- reveals enrich those rows with contact data,
- shortlisted candidates remain reusable,
- rediscovery later becomes free search over owned data,
- repeat enrichments can avoid new Prospeo calls.

## Exit criteria

- migrations run clean,
- RLS works,
- indexes exist,
- `person_id` unique conflict key works,
- candidate persistence model is locked,
- docs reflect actual schema.

---

# 7. PHASE 2 — AUTH + APP SHELL

## Goal
Get a usable authenticated shell so the product feels real quickly.

This phase covers:
- login/signup,
- Google OAuth / Magic Link,
- onboarding,
- protected app layout,
- sidebar/topbar foundation,
- basic profile context loading.

## Agents used

### `nexire-backend`
Handles auth callbacks, server auth checks, middleware, profile creation logic.

### `nexire-frontend`
Builds auth pages, onboarding pages, app shell UI, sidebar, page scaffolding.

### `nexire-architect`
Use at the beginning to verify file ownership and route structure.
Use at the end to confirm the shell is future-proof for Projects/Search/Settings.

### `nexire-qa`
Runs smoke tests:
- signup,
- login,
- protected route access,
- onboarding flow completion.

## Why this phase matters
You need a stable shell before building feature modules.
Otherwise each feature agent will invent its own layouts and auth assumptions.

## Exit criteria

- user can sign up,
- user can onboard,
- protected app routes work,
- sidebar layout exists,
- user/org context is accessible across app.

---

# 8. PHASE 3 — CORE SEARCH

## Goal
Build the main value proposition of Nexire:
searching talent via Prospeo, ranking it, showing it beautifully, and persisting useful data.

## This is the heart of the MVP
If Search is weak, the product feels weak.
Spend serious attention here.

## Agents used

### `nexire-backend`
Owns:
- Prospeo wrapper,
- rate limiter,
- search API,
- search-to-filter parsing,
- AI scoring logic,
- search caching,
- candidate upsert to Intelligence DB.

### `nexire-frontend`
Owns:
- search page,
- query input,
- criteria chips,
- filters panel,
- result cards/table,
- insights panel,
- loading/empty/error states.

### `nexire-architect`
Use before implementation to settle:
- what is search scope in MVP,
- which filters are hard filters vs soft ranking criteria,
- how cards should look,
- what is stored on search,
- what file boundaries are shared.

Use it again after implementation to verify:
- no duplicate Prospeo logic,
- no UI/backend drift,
- candidate persistence is actually happening.

### `nexire-qa`
Tests:
- filter mapping,
- response schema,
- rate limiting,
- cached search behavior,
- error handling from Prospeo failures.

## Important build rule
Frontend and backend can run in parallel here **only after** the search contract is agreed.
That means the architect/back-end should lock the API shape first.
Then frontend can safely build on top.

## Exit criteria

- search returns results,
- AI score renders,
- cards look production quality,
- candidate rows are persisted to DB,
- response structure is stable,
- errors and loading states are handled.

---

# 9. PHASE 4 — REVEAL + INTELLIGENCE DB

## Goal
Turn search from a browsing experience into a monetizable recruiting workflow.

This phase covers:
- email reveal,
- phone reveal,
- WhatsApp link generation,
- credit deduction,
- reveal history,
- free re-enrichment from own DB,
- candidate enrichment persistence.

## Why this is the highest-risk phase
This is where:
- money is involved,
- credits are deducted,
- Prospeo cost leakage can happen,
- and bad design can permanently damage your economics.

## Agents used

### `nexire-architect`
This is one of the most important moments for this agent.
Use it to define and review:
- exact reveal economics,
- cached reveal rule,
- candidates upsert strategy,
- where credit logic lives,
- how reveals are audited,
- and how DNC interacts later.

### `nexire-backend`
Primary executor for this phase.
Owns:
- `lib/credits/engine.ts`,
- reveal APIs,
- cached enrichment checks,
- `reveals` table logging,
- `credit_transactions` ledger,
- candidate contact field writes,
- WhatsApp link generation.

### `nexire-frontend`
Builds:
- reveal buttons,
- overage/upgrade modal,
- profile slideover,
- success states,
- visible credit feedback,
- and reveal history UI if included.

### `nexire-data`
Only if schema/index adjustments are needed.
For example:
- unique indexes,
- columns for reveal timestamps,
- query optimisation for `person_id` lookups.

### `nexire-qa`
Very important here.
Must test:
- email reveal costs 1,
- phone reveal costs 8,
- same person re-reveal costs 0,
- credit ledger logs correctly,
- insufficient credit responses,
- duplicate reveal resilience,
- idempotency.

## Important sequencing rule
This phase should run **mostly sequentially**.
Do not run multiple agents editing credit logic and reveal logic at once.
That is exactly how billing bugs happen.

## Exit criteria

- reveal works end to end,
- credit deductions are correct,
- candidate contact fields persist,
- re-reveal is free when cached,
- ledger is trustworthy,
- economics are protected.

---

# 10. PHASE 5 — PROJECTS, SHORTLIST, BILLING

## Goal
Convert core search + reveal into a usable recruiter workflow and monetizable product.

This phase combines three business-critical workflows:
- Projects for organisation of hiring work,
- Shortlist/pipeline for candidate movement,
- Billing for subscriptions and top-ups.

## Agents used

### Projects + Shortlist
- `nexire-backend`
- `nexire-frontend`
- `nexire-qa`

### Billing
- `nexire-backend`
- `nexire-frontend`
- `nexire-qa`
- `nexire-architect` at billing design review checkpoints

## Parallel safety
This phase can be split smartly.

| Safe parallel pair | Reason |
|---|---|
| Shortlist + Billing UI | different file scopes |
| Projects UI + Shortlist backend | limited overlap if API contracts locked |
| Billing page + billing webhook tests | can be parallel if webhook contract already fixed |

## Where `nexire-architect` helps here
Use it for:
- plan matrix review,
- credit grant / rollover rules,
- top-up economics,
- upgrade downgrade behavior,
- webhook event mapping,
- and pipeline status model sanity.

## MVP ship point
Once these are stable:
- Search works,
- Reveal works,
- Projects/Shortlist work,
- Billing works,

then you have a real MVP that can be tested with users.

## Exit criteria

- recruiter can create projects,
- search inside project context works,
- shortlist candidates and move them through status,
- billing creates subscriptions and top-ups,
- webhooks update credits correctly.

---

# 11. PHASE 6 — POST-MVP PRODUCT LAYERS

## Goal
Add retention and workflow depth after the core engine is proven.

This phase includes:
- Sequences,
- Client Dashboard / share links,
- Contacts + DNC,
- Library / talent rediscovery,
- deeper Settings.

## Recommended order

1. M06 Sequences
2. M07 Client Dashboard
3. M08 Contacts + DNC
4. M09 Library
5. M11 Settings polish (if not already finished)

## Why this order
- Sequences increase actionability after reveals.
- Client sharing increases perceived recruiter value.
- Contacts + DNC protect deliverability/compliance.
- Library becomes powerful only after enough candidates are persisted.

## Where `nexire-architect` is used here
Use it to decide:
- when a feature is ready for implementation versus still speculative,
- how Sequences interact with DNC and Mailboxes,
- what public data is safe in client views,
- and how the rediscovery engine should query owned candidates.

## Parallel opportunities

| Can run together? | Condition |
|---|---|
| Client Dashboard + Contacts | yes, if public share logic and contacts logic do not overlap |
| Library + Settings | yes, if candidate search APIs are stable |
| Sequences + anything touching mailboxes | usually no, keep sequential until mailbox contract is stable |

---

# 12. PHASE 7 — PRODUCTION HARDENING

## Goal
Make the app safe, reliable, observable, testable, and deployable.

This is where many teams stop too early.
Do not ship a fragile AI-generated app without this phase.

## What this phase includes

- E2E tests for all critical flows
- unit tests for credit engine and rate limiter
- billing webhook verification tests
- environment variable audit
- secret handling audit
- RLS verification
- failure-path UI checks
- retry/idempotency review
- analytics events
- Sentry integration
- PostHog verification
- deployment checklist
- staging → production rollout plan
- seed/test data cleanup
- performance checks
- mobile responsiveness sweep

## Agents used

### `nexire-architect`
This is the other heavy-use phase for the architect.
Ask it to perform a production readiness review across:
- security,
- architecture,
- observability,
- operational risk,
- missing docs,
- and launch blockers.

### `nexire-qa`
Primary owner of this phase.
Must cover:
- auth,
- search,
- reveal,
- shortlist,
- billing,
- settings,
- cross-org isolation,
- and regressions.

### `nexire-docs`
Updates:
- `DEPLOYMENT.md`,
- `SETUP.md`,
- `RUNBOOK.md`,
- rollback plan,
- production env checklist,
- and incident notes.

### `nexire-backend` and `nexire-frontend`
Only for bug fixes found during hardening.

## Exit criteria

- builds pass,
- tests pass,
- env vars complete,
- staging tested,
- deploy checklist complete,
- monitoring exists,
- known critical bugs resolved.

---

# 13. SAFE PARALLELISM RULES

## What can safely run in parallel

| Pair | Safe? | Why |
|---|---|---|
| frontend page + backend API for same feature | Yes, if API contract is locked first | file scopes differ |
| projects + sequences UI | Often yes | low overlap |
| client dashboard + contacts | Yes | separate flows |
| library + settings UI | Yes | separate components |

## What should usually NOT run in parallel

| Pair | Avoid because |
|---|---|
| Search + Reveal core logic | both touch candidate persistence and shared intelligence assumptions |
| Reveal + Billing credit logic | both affect credit economy / ledger trust |
| Two agents editing `CLAUDE.md` | source of truth conflict |
| Two agents editing `_meta/HLD-COMPACT.md` | architecture drift |
| Two agents editing `lib/credits/engine.ts` | billing bug risk |
| Two agents editing `lib/prospeo/client.ts` | upstream API handling inconsistency |

## Practical rule
If two tasks touch the same shared source-of-truth file, run them sequentially.

---

# 14. DAILY EXECUTION LOOP YOU SHOULD FOLLOW

Use this exact operating rhythm every day.

## Morning planning loop

1. Open this playbook.
2. Decide current phase.
3. Identify which module tasks belong to this phase.
4. Ask `nexire-architect` to review today’s run plan if the phase is new or risky.
5. Start only the agents needed for that phase.

## Execution loop

1. Run backend and frontend in parallel only when safe.
2. Keep one terminal/session per agent.
3. Force each session to read:
   - `CLAUDE.md`
   - `_meta/HLD-COMPACT.md`
   - the target prompt file
   - any referenced docs/api file
4. After task completion, review diff before accepting.
5. Ask docs agent to update log/handoff if the task was major.

## End-of-day checkpoint

1. Run `npm run build`
2. Run `npx tsc --noEmit`
3. Run key tests if affected
4. Update `BUILD-LOG.md`
5. Commit to git with clear module-level message
6. Note blockers for next day

---

# 15. HOW TO TALK TO EACH AGENT

## Best instruction format

Use this structure every time:

```md
Read CLAUDE.md and _meta/HLD-COMPACT.md first.
Then read @prompts/M03-SEARCH/10-search-api-route.md.
Stay strictly within your file scope.
Before writing code, list the files you plan to touch.
Then implement the task completely.
After finishing, append a concise entry to _meta/BUILD-LOG.md.
```

## For `nexire-architect`

Use prompts like:

```md
Read CLAUDE.md, _meta/HLD-COMPACT.md, docs/DATABASE.md,
and all prompt files for M04-REVEAL.
Do not write product code.
Your task is to review architecture, file boundaries, shared logic,
risk areas, execution order, and missing context.
Then give me:
1. recommended build order,
2. shared files to protect,
3. parallel-safe tasks,
4. missing assumptions,
5. exact preconditions before backend/frontend agents begin.
```

## For `nexire-backend`

```md
Read CLAUDE.md and _meta/HLD-COMPACT.md first.
Then read @prompts/M04-REVEAL/02-email-reveal-flow.md.
Stay within backend scope only.
Before coding, list files to modify.
Ensure auth, Zod validation, Redis limit, credit logic, and candidates upsert are correct.
```

## For `nexire-frontend`

```md
Read CLAUDE.md and _meta/HLD-COMPACT.md first.
Then read @prompts/M03-SEARCH/05-candidate-result-card.md.
Stay within frontend scope only.
Use exact design tokens from HLD-COMPACT.
Include loading, empty, error, and success states.
```

## For `nexire-qa`

```md
Read CLAUDE.md, _meta/HLD-COMPACT.md, and the relevant module prompts first.
Do not build features.
Write tests for the implemented behavior and identify regressions,
edge cases, and missing assertions.
```

---

# 16. IMPORTANT SHARED FILES — HANDLE WITH EXTRA CARE

| File | Why it matters | Who should touch it |
|---|---|---|
| `CLAUDE.md` | master operating rules | architect only, rarely docs |
| `_meta/HLD-COMPACT.md` | architecture source of truth | architect only |
| `docs/DATABASE.md` | schema truth | data + architect |
| `lib/credits/engine.ts` | money/credits logic | backend only, after architect review for big changes |
| `lib/prospeo/client.ts` | upstream search/enrich integration | backend only |
| `supabase/migrations/**` | irreversible schema history | data only |
| `_meta/BUILD-LOG.md` | agent handoff memory | docs + any agent appending concise notes |

---

# 17. CHECKPOINT GATES BEFORE MOVING TO NEXT PHASE

## Technical gate

- build passes
- typecheck passes
- no known blocker on current phase
- docs updated enough for next agent

## Product gate

- the phase produces user-visible value,
- the workflow is end-to-end, not just partial,
- no critical path is broken.

## Architecture gate

- no duplicate logic in shared systems,
- file boundaries still make sense,
- no silent drift from HLD / docs.

## Testing gate

- at least smoke tests exist for the new critical flow,
- regression risk is understood,
- high-risk logic is covered.

---

# 18. MINIMUM PRODUCTION READINESS CHECKLIST

Use this before launch.

## Security
- auth guards verified
- RLS verified
- service keys not exposed client-side
- webhook signatures verified
- secrets present in prod env only

## Reliability
- retries/idempotency for billing/webhooks
- rate limiting works
- upstream Prospeo failure handled
- meaningful error states exist

## Product quality
- mobile works reasonably
- loading states exist
- empty states exist
- pricing/credits language is consistent
- no broken navigation paths

## Observability
- Sentry wired
- PostHog events checked
- logs inspectable
- billing/reveal failures discoverable quickly

## Operations
- `.env.example` complete
- deploy steps documented
- staging tested
- rollback steps documented

---

# 19. WHAT YOUR BUILD JOURNEY SHOULD LOOK LIKE

## Simplest roadmap

| Stage | What you are proving |
|---|---|
| Phase 0 | system setup discipline |
| Phase 1 | data model correctness |
| Phase 2 | authenticated product shell |
| Phase 3 | search value |
| Phase 4 | monetization + intelligence moat |
| Phase 5 | recruiter workflow + billing viability |
| Phase 6 | retention and product depth |
| Phase 7 | production reliability |

This means your product becomes real in layers, not chaos.

---

# 20. FINAL RECOMMENDED OPERATING STRATEGY FOR YOU

If you want the cleanest path with least confusion, do this:

## Recommended stack
- Trae = your main IDE and review surface
- Claude Code = primary build agent runner
- OpenCode = overflow QA/docs helper

## Recommended human workflow
- You act as PM + reviewer
- Architect agent starts and closes each major phase
- Backend and Frontend agents execute the build
- Data agent is called only for schema changes
- QA agent is called after every meaningful milestone
- Docs agent keeps the project coherent

## Recommended discipline
- Never skip phase gates
- Never let one agent own everything
- Never run shared-logic tasks in parallel
- Always preserve source-of-truth files
- Always update build log

That is how you get a production-ready app instead of a messy AI-generated prototype.

---

# 21. QUICK REFERENCE TABLES

## Agent quick reference

| Agent | Use it for | Avoid using it for |
|---|---|---|
| Architect | planning, audits, boundaries, risk review, phase sequencing | routine coding |
| Data | schema, RLS, migrations, indexes | UI and route styling |
| Backend | APIs, integrations, credits, logic | visual UI work |
| Frontend | pages, components, UX states, polish | DB schema decisions |
| QA | tests, regression checks, edge cases | new feature architecture |
| Docs | logs, docs sync, handoffs | product feature coding |

## Execution rule quick reference

| Situation | What to do |
|---|---|
| starting a new phase | use architect first |
| changing schema | use data agent |
| building API route | use backend agent |
| building UI | use frontend agent |
| verifying critical flow | use QA agent |
| syncing docs and progress | use docs agent |
| shared file involved | run sequentially |
| separate file scopes | parallel is okay |

---

## END NOTE

Whenever confused, ask only two questions:

1. What phase am I in?
2. Which specialist agent should own this file?

If you answer those two correctly, the rest of the build becomes much easier.
