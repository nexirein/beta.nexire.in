# NEXIRE — HLD COMPACT REFERENCE v2.0
# PURPOSE: Every agent task prompt starts with @_meta/HLD-COMPACT.md
# Read this before reading any task file. It gives you the full system picture.
# Last updated: 2026-03

---

## 1. STACK AT A GLANCE

| Layer        | Technology                  | Notes                                  |
|--------------|-----------------------------|----------------------------------------|
| Framework    | Next.js 14 (App Router)     | RSC + API routes                       |
| Database     | Supabase (Postgres + RLS)   | 17 tables, all org-scoped              |
| Auth         | Supabase Auth               | Google OAuth + Magic Link via Resend   |
| Cache/Rate   | Upstash Redis               | Search cache TTL 24h, rate limits      |
| Edge WAF     | Cloudflare                  | 5 rules (search/reveal/billing/auth)   |
| Payments     | Razorpay                    | Subscriptions + credit top-ups (India) |
| Email send   | Resend                      | Sequences + magic link + invites       |
| Data source  | Prospeo API                 | Search Person + Enrich Person only     |
| Hosting      | Vercel                      | Pro plan ($20/mo), cron jobs           |
| Analytics    | PostHog + Sentry            | 1M events/mo free + error tracking     |
| Font/Design  | Geist + Tailwind            | Dark-first, #0A0A0A bg, #38BDF8 accent |

---

## 2. PROSPEO — WHAT IT CAN AND CANNOT DO

### Available filters (30+)
  person_job_title, person_seniority, person_departments, person_location,
  person_year_of_experience {min,max}, company_industry, company_headcount_range,
  company_funding, company_technology, company_names[], company_websites[]

### Credit costs (Prospeo side)
  Search  → 1 credit per page (25 results) if results found
  Email   → 1 credit per enrich (re-enrich = FREE forever)
  Phone   → 10 credits (email comes FREE bundled)

### Nexire charges users
  Email reveal → 1 Nexire credit
  Phone reveal → 8 Nexire credits (Nexire pays 10 to Prospeo; 20% margin)

### NOT available in Prospeo (Nexire Intelligence Layer fills these)
  ❌ Notice period  → estimated from tenure_months algorithm:
                      <6m = immediate · 6-18m = ~30d · 18-36m = ~60d · >36m = ~90d
  ❌ CTC in LPA     → manual field on shortlist card (recruiter fills it)
  ❌ WhatsApp       → Nexire generates wa.me/?text= link after phone reveal

---

## 3. DESIGN TOKENS (use these, never deviate)

  bg:           #0A0A0A    surface:      #111111    surface-raised: #1A1A1A
  border:       #222222    text-primary: #FAFAFA    text-secondary: #A0A0A0
  text-muted:   #555555    accent:       #38BDF8    accent-dark:    #0EA5E9
  success:      #22C55E    warning:      #EAB308    error:          #EF4444
  ai-good:      #22C55E (score 80-100)
  ai-potential: #EAB308 (score 50-79)
  ai-nomatch:   #EF4444 (score < 50)

  Font: Geist (headings 600-700, body 400, mono: Geist Mono)
  Border radius: cards = rounded-2xl · buttons = rounded-xl · inputs = rounded-xl
  All cards: bg-[#111111] border border-[#1A1A1A] rounded-2xl

---

## 4. MODULE MAP (11 modules, 40 prompt files)

  M01  Auth & Onboarding       → /app/(auth)/  · /api/auth/
  M02  Projects                → /app/(app)/projects/  · /api/projects/
  M03  Search (Prospeo + AI)   → /app/(app)/projects/[id]/  · /api/search/
  M04  Candidate + Reveal      → components/candidate/  · /api/reveal/
  M05  Shortlist               → /app/(app)/projects/[id]/shortlist/  · /api/shortlist/
  M06  Sequences               → /app/(app)/sequences/  · /api/sequences/
  M07  Client View             → /app/share/[token]/  · /api/client-view/
  M08  Contacts + DNC          → /app/(app)/contacts/  · /api/settings/dnc/
  M09  Search Library          → /app/(app)/library/  · /api/search/saved/
  M10  Billing                 → /app/(app)/billing/  · /api/billing/
  M11  Settings + Team         → /app/(app)/settings/  · /api/settings/

---

## 5. KEY ARCHITECTURAL RULES (agents MUST follow)

  1. CREDITS: All credit logic lives ONLY in lib/credits/engine.ts
              Never deduct credits anywhere else.

  2. PROSPEO: Never call Prospeo directly — ALWAYS use lib/prospeo/client.ts
              Wrap every call in try/catch, handle RATE_LIMIT + NO_MATCH codes.

  3. RATE LIMITS: Two layers:
              - Cloudflare (edge, per-IP): search 30/min · reveal 20/min · billing 5/min
              - Redis (per-user, per-org): search 80/hr · reveal 50/hr

  4. AUTH: Every API route checks Supabase JWT first line.
           Return 401 if no user. Never trust client-sent user_id.

  5. VALIDATION: Every API route uses Zod schema — no exceptions.

  6. ORG SCOPING: Every DB query includes .eq("org_id", profile.org_id)
                  Never return cross-org data.

  7. RLS: Supabase RLS is a second layer of defence, NOT the primary.
          Always filter by org_id in application code too.

  8. REDIS CACHE: Search results cached by hash(filters) for 24h.
                  Cache key = "search:{org_id}:{hash}:{page}"
                  Invalidated: never (stale is OK for search)

  9. ERRORS: Every API returns { error: string } with proper HTTP status.
             Client shows toast. Never expose raw Supabase/Prospeo errors.

  10. SECRETS: SUPABASE_SERVICE_ROLE_KEY and PROSPEO_API_KEY are SERVER only.
              Never in NEXT_PUBLIC_ vars.

---

## 6. DATABASE — 17 TABLES (quick reference)

  orgs              id, name, plan, billing_cycle, credits_balance, credits_used,
                    credits_monthly, cycle_resets_at, razorpay_subscription_id

  profiles          id (= auth.uid), org_id, member_role (owner/admin/member),
                    full_name, avatar_url, job_title, timezone

  projects          id, org_id, title, description, status, jd_text, created_by

  searches          id, org_id, project_id, query, filters_json, criteria_json,
                    result_count, page

  candidates        id, org_id, person_id (Prospeo), full_name, headline,
                    current_title, current_company, location, skills_json,
                    linkedin_url, ai_score, estimated_notice_days, hidden

  reveals           id, org_id, candidate_id, person_id, type (email/phone),
                    email, phone, status (verified/unverified), revealed_by

  credit_transactions  id, org_id, user_id, type, amount, balance_after,
                       notes, candidate_id, created_at
                       types: monthly_grant · rollover · reveal_email ·
                              reveal_phone · manual_topup · refund

  shortlist_entries id, org_id, project_id, candidate_id, status
                    (new/screening/interview/offer/rejected), notes, ctc_lpa

  sequences         id, org_id, project_id, name, status, steps_json

  sequence_enrollments  id, sequence_id, candidate_id, current_step,
                        status, mailbox_id

  mailboxes         id, org_id, user_id, email, provider (gmail/outlook),
                    access_token, refresh_token, is_active

  client_views      id, org_id, project_id, token, title, password_hash,
                    expires_at, view_count

  client_view_candidates  id, view_id, candidate_id

  contacts          id, org_id, candidate_id, email, phone, source,
                    dnc (bool), dnc_reason

  dnc_list          id, org_id, value (email/domain), type, reason, added_by

  saved_searches    id, org_id, name, filters_json, criteria_json, use_count

  org_invitations   id, org_id, email, role, token, accepted_at, invited_by

---

## 7. CREDIT PLAN MATRIX

  Plan      Monthly credits  Team seats  Rollover  Phone reveals
  ──────────────────────────────────────────────────────────────
  Free      50               1           ✅ yes    ✅ yes (costs 8)
  Solo      200              1           ✅ yes    ✅ yes
  Growth    600              5           ✅ yes    ✅ yes
  Custom    TBD              unlimited   ✅ yes    ✅ yes

  Overage top-ups (all plans):
    50 credits  = ₹999
    100 credits = ₹1,799
    200 credits = ₹2,999

---

## 8. API CONVENTIONS

  Auth:         Every route reads supabase.auth.getUser() — never trust body user_id
  Validation:   Zod parse before any DB operation
  Org scoping:  Get profile → use profile.org_id for all queries
  Rate limit:   Check Redis limiter before business logic
  Response:     Always { data } on success · { error: string } on failure
  HTTP codes:   200 GET · 201 POST created · 400 bad input · 401 unauth ·
                403 forbidden (plan limit) · 404 not found · 429 rate limit ·
                500 server error

---

## 9. PARALLEL BUILD SAFETY

  SAFE to run simultaneously:
    M01 Auth       +  M10 Billing Razorpay setup
    M02 Projects   +  M06 Sequences builder
    M07 Client View + M08 Contacts
    M09 Library    +  M11 Settings

  NEVER parallel (shared files):
    ❌ M03 Search + M04 Reveal      (both touch lib/credits/engine.ts)
    ❌ M04 Reveal + M10 Billing     (both touch credit_transactions queries)
    ❌ Any two agents touching CLAUDE.md at same time

---

## 10. ENV VARS QUICK REFERENCE

  NEXT_PUBLIC_SUPABASE_URL          NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY         PROSPEO_API_KEY
  UPSTASH_REDIS_REST_URL            UPSTASH_REDIS_REST_TOKEN
  RAZORPAY_KEY_ID                   RAZORPAY_KEY_SECRET
  RAZORPAY_WEBHOOK_SECRET           RESEND_API_KEY
  RESEND_FROM_EMAIL                 NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_POSTHOG_KEY           SENTRY_DSN
  CRON_SECRET

---

## 11. STANDARD TASK PROMPT HEADER TEMPLATE
# (copy-paste this block at the top of every new task .md)

<!--
@_meta/HLD-COMPACT.md        ← system-wide architecture (read first)
@CLAUDE.md                   ← project rules and conventions
@docs/DATABASE.md            ← all 17 tables + RLS
@docs/api/[module].md        ← API contract for this module
-->

---
END OF HLD-COMPACT.md
