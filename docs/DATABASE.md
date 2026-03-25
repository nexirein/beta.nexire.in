# NEXIRE — Database Reference
# Owner: nexire-data
# Last updated: 2026-03-06
# Phase 1 Status: ✅ Complete — 12 migrations written, 18 tables (17 + search_candidates join)

---

## Overview

- **18 tables** — all org-scoped (17 original + `search_candidates` join table)
- **Supabase Postgres** with Row Level Security (RLS)
- **RLS is a second layer** — application code always filters by `org_id` first
- **Additive migrations only** — no destructive changes without team sign-off

---

## Candidates as the Nexire Intelligence DB

`candidates` is NOT a temporary search results buffer. It is a **persistent, per-org intelligence layer**.

| Operation | SQL Behaviour | Effect |
|---|---|---|
| Search runs | `INSERT ... ON CONFLICT (org_id, person_id) DO UPDATE SET ...` | Creates or enriches the candidate row |
| Reveal requested | Check `reveals` table first | If row exists → return cached data, zero Prospeo calls, zero credits |
| Shortlist added | `shortlist_entries(project_id, candidate_id)` | Links existing candidate to a project pipeline |
| Re-discovery | `SELECT * FROM candidates WHERE org_id = $1` | Query owned data — no Prospeo needed |

### Free Re-Enrichment Algorithm
```
1. API receives reveal request for (org_id, person_id, type)
2. getExistingReveal(orgId, personId, type)  ← lib/supabase/queries/reveals.ts
3. IF row found:
     → return cached email/phone  ← FREE, no credit deduction
4. IF null:
     → call lib/prospeo/client.ts
     → charge 1 credit (email) or 8 credits (phone) via lib/credits/engine.ts
     → insertReveal() to persist for future free re-enrichment
```

### Notice Period Algorithm (Nexire Intelligence Layer)
```
tenure_months < 6   → estimated_notice_days = 0   (immediate)
tenure_months 6–18  → estimated_notice_days = 30  (~1 month)
tenure_months 18–36 → estimated_notice_days = 60  (~2 months)
tenure_months > 36  → estimated_notice_days = 90  (~3 months)
```
This is a **GENERATED ALWAYS AS** column in Postgres — computed from `tenure_months`, never written directly.

---

## Migration Files (Phase 1)

| File | Tables Created |
|---|---|
| `0001_create_orgs_and_profiles.sql` | `orgs`, `profiles` + signup trigger |
| `0002_create_projects.sql` | `projects` |
| `0003_create_candidates.sql` | `searches`, `candidates`, `search_candidates` |
| `0004_create_reveals.sql` | `reveals` |
| `0005_create_credit_transactions.sql` | `credit_transactions` |
| `0006_create_shortlist.sql` | `shortlist_entries` |
| `0007_create_mailboxes.sql` | `mailboxes` |
| `0008_create_sequences.sql` | `sequences`, `sequence_enrollments` |
| `0009_create_client_views.sql` | `client_views`, `client_view_candidates` |
| `0010_create_contacts_dnc.sql` | `contacts`, `dnc_list` |
| `0011_create_saved_searches.sql` | `saved_searches` |
| `0012_create_org_invitations.sql` | `org_invitations` |

---

## Migration Conventions

| Rule | Detail |
|---|---|
| Numbering | `0001_description.sql`, `0002_description.sql` ... |
| Naming | snake_case, descriptive. e.g. `0003_add_candidate_hidden_flag.sql` |
| Format | Each migration: CREATE TABLE → indexes → RLS policies → triggers |
| Testing | Run locally with `supabase db push` before marking complete |
| Rollback | Write a corresponding rollback section in comments |

---

## Org Scoping Rules

1. **Every business table** has an `org_id uuid NOT NULL REFERENCES orgs(id)`
2. **Every RLS policy** filters `auth.uid()` through `profiles.org_id`
3. **Application code** always adds `.eq('org_id', profile.org_id)` before RLS
4. **Cross-org data leaks** are a P0 incident — RLS is not enough alone

---

## 17 Tables — Schema Reference

### `orgs`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
name                  text NOT NULL
plan                  text DEFAULT 'free'           -- free | solo | growth | custom
billing_cycle         text DEFAULT 'monthly'
credits_balance       int DEFAULT 50
credits_used          int DEFAULT 0
credits_monthly       int DEFAULT 50
cycle_resets_at       timestamptz
razorpay_subscription_id  text
created_at            timestamptz DEFAULT now()
```

### `profiles`
```sql
id                    uuid PRIMARY KEY REFERENCES auth.users(id)
org_id                uuid NOT NULL REFERENCES orgs(id)
member_role           text DEFAULT 'member'         -- owner | admin | member
full_name             text
avatar_url            text
job_title             text
timezone              text DEFAULT 'Asia/Kolkata'
created_at            timestamptz DEFAULT now()
```

### `projects`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
title                 text NOT NULL
description           text
status                text DEFAULT 'active'         -- active | closed | archived
jd_text               text
created_by            uuid REFERENCES profiles(id)
created_at            timestamptz DEFAULT now()
```

### `searches`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
project_id            uuid REFERENCES projects(id)
query                 text
filters_json          jsonb
criteria_json         jsonb
result_count          int
page                  int DEFAULT 1
created_at            timestamptz DEFAULT now()
```

### `candidates`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
person_id             text NOT NULL                 -- Prospeo person_id (unique conflict key)
full_name             text
headline              text
current_title         text
current_company       text
location              text
skills_json           jsonb
linkedin_url          text
ai_score              int                           -- 0–100
estimated_notice_days int                           -- derived from tenure algorithm
hidden                bool DEFAULT false
created_at            timestamptz DEFAULT now()
UNIQUE (org_id, person_id)                          -- prevent duplicate reveals per org
```

### `reveals`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
candidate_id          uuid REFERENCES candidates(id)
person_id             text                          -- Prospeo person_id
type                  text NOT NULL                 -- email | phone
email                 text
phone                 text
status                text DEFAULT 'unverified'     -- verified | unverified
revealed_by           uuid REFERENCES profiles(id)
created_at            timestamptz DEFAULT now()
```

### `credit_transactions`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
user_id               uuid REFERENCES profiles(id)
type                  text NOT NULL
  -- monthly_grant | rollover | reveal_email | reveal_phone | manual_topup | refund
amount                int NOT NULL                  -- positive = credit, negative = debit
balance_after         int NOT NULL
notes                 text
candidate_id          uuid REFERENCES candidates(id)
created_at            timestamptz DEFAULT now()
```

### `shortlist_entries`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
project_id            uuid REFERENCES projects(id)
candidate_id          uuid REFERENCES candidates(id)
status                text DEFAULT 'new'            -- new | screening | interview | offer | rejected
notes                 text
ctc_lpa               numeric(6,2)                  -- recruiter-filled CTC estimate
created_at            timestamptz DEFAULT now()
updated_at            timestamptz DEFAULT now()
```

### `sequences`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
project_id            uuid REFERENCES projects(id)
name                  text NOT NULL
status                text DEFAULT 'draft'          -- draft | active | paused | completed
steps_json            jsonb                         -- array of { delay_days, subject, body }
created_at            timestamptz DEFAULT now()
```

### `sequence_enrollments`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
sequence_id           uuid REFERENCES sequences(id)
candidate_id          uuid REFERENCES candidates(id)
current_step          int DEFAULT 0
status                text DEFAULT 'active'         -- active | paused | completed | bounced
mailbox_id            uuid REFERENCES mailboxes(id)
created_at            timestamptz DEFAULT now()
```

### `mailboxes`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
user_id               uuid REFERENCES profiles(id)
email                 text NOT NULL
provider              text NOT NULL                 -- gmail | outlook
access_token          text
refresh_token         text
is_active             bool DEFAULT true
created_at            timestamptz DEFAULT now()
```

### `client_views`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
project_id            uuid REFERENCES projects(id)
token                 text UNIQUE NOT NULL          -- public share token
title                 text
password_hash         text                          -- optional password protection
expires_at            timestamptz
view_count            int DEFAULT 0
created_at            timestamptz DEFAULT now()
```

### `client_view_candidates`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
view_id               uuid REFERENCES client_views(id)
candidate_id          uuid REFERENCES candidates(id)
UNIQUE (view_id, candidate_id)
```

### `contacts`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
candidate_id          uuid REFERENCES candidates(id)
email                 text
phone                 text
source                text                          -- reveal | manual | import
dnc                   bool DEFAULT false
dnc_reason            text
created_at            timestamptz DEFAULT now()
```

### `dnc_list`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
value                 text NOT NULL                 -- email address or domain
type                  text NOT NULL                 -- email | domain
reason                text
added_by              uuid REFERENCES profiles(id)
created_at            timestamptz DEFAULT now()
UNIQUE (org_id, value)
```

### `saved_searches`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
name                  text NOT NULL
filters_json          jsonb
criteria_json         jsonb
use_count             int DEFAULT 0
created_at            timestamptz DEFAULT now()
updated_at            timestamptz DEFAULT now()
```

### `org_invitations`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
org_id                uuid NOT NULL REFERENCES orgs(id)
email                 text NOT NULL
role                  text DEFAULT 'member'
token                 text UNIQUE NOT NULL
accepted_at           timestamptz
invited_by            uuid REFERENCES profiles(id)
created_at            timestamptz DEFAULT now()
```

---

## RLS Policy Template

```sql
-- Enable RLS on table
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can read their org's data
CREATE POLICY "org_members_select" ON table_name
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- INSERT: org members can insert into their org
CREATE POLICY "org_members_insert" ON table_name
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- UPDATE / DELETE: follow same pattern
```

---

## Indexes (planned)

```sql
-- High-priority indexes
CREATE INDEX idx_candidates_org_person ON candidates(org_id, person_id);
CREATE INDEX idx_reveals_candidate ON reveals(candidate_id, type);
CREATE INDEX idx_credit_transactions_org ON credit_transactions(org_id, created_at DESC);
CREATE INDEX idx_shortlist_project ON shortlist_entries(project_id, status);
CREATE INDEX idx_sequences_org ON sequences(org_id, status);
```

---

## Key Business Rules in DB Layer

1. `candidates.person_id` is unique per org — prevents double-counting reveals
2. `credit_transactions` is append-only — never UPDATE or DELETE rows
3. `dnc_list` unique constraint on `(org_id, value)` — prevents duplicate DNC entries
4. `org_invitations.token` must be a cryptographically random UUID or similar
