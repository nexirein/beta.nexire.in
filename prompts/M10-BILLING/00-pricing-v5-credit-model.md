<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/billing.md         ← this module's API contract
-->

# NEXIRE PRICING — FINAL v5.0 (Credit Model)
# Trae: Read CLAUDE.md first.
# This file defines Nexire's FINAL pricing model — the Credit Model.
# It replaces ALL previous pricing references across the entire codebase.
# Read this file completely before changing any pricing-related file.
# After completion, append to _meta/BUILD-LOG.md

---

## PART 1 — THE CREDIT MODEL (Core Concept)

Everything in Nexire costs **credits**. Two actions, two costs:

| Action | Credits | What you get |
|---|---|---|
| Email reveal | 1 credit | Unlock email address only |
| Phone + Email reveal | 8 credits | Phone number + email (email is FREE alongside) |

### Why 8 credits for phone (not 10)?
- Prospeo charges: ₹18.50 for phone, ₹1.85 for email (10× ratio)
- We charge 8× because email is **free** when bundled with phone
- At 8 credits: user feels it's fair; our margin is protected
- At 5 credits: too cheap → margin collapses on phone-heavy users
- At 10 credits: psychologically expensive → chills phone usage adoption

### Credit Rollover
Credits **never expire**. Unused credits roll to next month automatically.
This is a genuine differentiator vs Naukri (15-day expiry) and Cutshort (use-it-or-lose-it).

---

## PART 2 — THE FOUR TIERS

### FREE — ₹0
```
Target: skeptical recruiter evaluating Nexire
Search results:     10
Contact credits:    15  (15 emails OR ~1 phone+email)
Sequences:          1
Active roles:       1
Client View:        ❌ (upgrade trigger)
Mailboxes:          —
Talent Network:     ❌
```
**Cost to Nexire per active free user:** ~₹10–15/month (pure acquisition cost)

---

### SOLO — ₹3,999/month  ·  Annual ₹39,990 (₹3,332/mo)
```
Target: freelance recruiter, solo HR consultant, startup HR (10–50 ppl), 1–4 roles/month
Search results:     1,500/month
Contact credits:    200/month  (200 emails OR 25 phone+emails OR any mix)
Email reveal:       1 credit
Phone+Email reveal: 8 credits
Max phones/month:   25
Sequences:          5
Active roles:       5
Client View shares: 5/month
Mailboxes:          1
Talent Network:     Basic (tenure signals only)
Credit rollover:    ✅
```
**Positioning:** Naukri Resdex Lite charges ₹4,000 for 100 CVs, 1 role, 15 days, no outreach.
Nexire Solo is ₹3,999 for 1,500 AI-ranked results, 200 contact credits, phone reveals, sequences — monthly.

---

### GROWTH — ₹7,999/month  ·  Annual ₹79,990 (₹6,666/mo)  ⭐ MAIN PRODUCT
```
Target: agency recruiter (5–12 roles), freelance headhunter, small agency (1–4 seats)
Search results:     Unlimited (rate-limited at 10,000/day)
Contact credits:    600/month  (600 emails OR 75 phone+emails OR any mix)
Email reveal:       1 credit
Phone+Email reveal: 8 credits
Max phones/month:   75
Sequences:          Unlimited
Active roles:       Unlimited
Client View shares: Unlimited
Mailboxes:          2
Talent Network:     Full (readiness scores, appraisal signals, company health)
Add-on seats:       +₹3,500/seat
Credit rollover:    ✅
```
**Positioning:** Cutshort costs ₹12,970 (tech only, no phones). Nexire Growth = ₹4,971 cheaper + phones + WhatsApp + all roles.

---

### CUSTOM — From ₹24,999/month (3 seats)
```
Target: agencies 3+ recruiters, Series A+ in-house teams, RPO/staffing firms
Everything in Growth, plus:
  - Shared credit pool across all seats
  - Custom credit volume
  - ATS integrations (Keka, Darwinbox, Zoho Recruit, Greenhouse)
  - White-label Client View (agency's own branding)
  - Team dashboard + recruiter-level analytics
  - Dedicated account manager (4-hour WhatsApp SLA)
  - Quarterly business reviews
  - Custom AI scoring per client/role type
```

---

## PART 3 — MARGIN VERIFICATION

### Solo ₹3,999 · 200 credits
| Scenario | Phones | Emails | Prospeo cost | Infra | Margin |
|---|---|---|---|---|---|
| All email | 0 | 200 | ₹370 | ₹150 | **87.0%** |
| All phone | 25 | 0 | ₹462.50 | ₹150 | **84.7%** |
| Realistic (20% phone) | 5 | 160 | ₹388.50 | ₹150 | **86.5%** |
| Heavy phone (40%) | 10 | 120 | ₹407 | ₹150 | **86.1%** |

**Solo worst case = 84.7% ✅ (target was 75%+)**

### Growth ₹7,999 · 600 credits
| Scenario | Phones | Emails | Prospeo cost | Infra | Margin |
|---|---|---|---|---|---|
| All email | 0 | 600 | ₹1,110 | ₹150 | **84.3%** |
| All phone | 75 | 0 | ₹1,387.50 | ₹150 | **80.8%** |
| Realistic (25% phone) | 18 | 456 | ₹1,176.60 | ₹150 | **83.4%** |
| Heavy phone (40%) | 30 | 360 | ₹1,221 | ₹150 | **82.9%** |

**Growth worst case = 80.8% ✅ (target was 75%+)**

### Blended at 100 users
| Tier | Users | MRR | Gross Profit |
|---|---|---|---|
| Free | 15 | ₹0 | −₹225 (acq. cost) |
| Solo | 20 | ₹79,980 | ₹68,782 |
| Growth | 60 | ₹4,79,940 | ₹3,98,350 |
| Custom | 5 | ₹1,24,995 | ₹99,996 |
| **Total** | **100** | **₹6,84,915** | **₹5,66,903** |

After ₹15,000 infra: **₹5,51,903 net/month at 100 users** · Blended margin **83.3% ✅**

---

## PART 4 — ANNUAL BILLING

Toggle copy: **"Pay 10 months. Get 12. 2 months FREE."** (never write "25% off")

| Plan | Monthly | Annual | Effective/mo | You save |
|---|---|---|---|---|
| Solo | ₹3,999 | ₹39,990 | ₹3,332 | ₹7,998 |
| Growth | ₹7,999 | ₹79,990 | ₹6,666 | ₹15,998 |

Annual upsell trigger: After first placement → "You just placed [Name]. Annual Growth = ₹15,998 saved."

---

## PART 5 — COMPETITOR COMPARISON TABLE

| | Nexire Solo | Nexire Growth | Naukri Resdex | Cutshort | LinkedIn Rec. Lite | Shine Std | Weekday |
|---|---|---|---|---|---|---|---|
| Price/mo | ₹3,999 | ₹7,999 | ₹4,000 | ₹12,970 | ₹4,499 | ₹5,999 | ₹4,490 |
| Validity | Monthly | Monthly | 15 days | Monthly | Monthly | 30 days | Monthly |
| Role limit | 5 | Unlimited | 1 | 3 seats | Unlimited | Unlimited | Unlimited |
| Credits | 200/mo | 600/mo | 100 CVs | 250 unlocks | 30 InMails | 1,500 emails | Variable |
| Phone reveals | ✅ 25 max | ✅ 75 max | Bundled CV | ❌ | ❌ | ❌ | ❌ |
| WhatsApp outreach | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AI ranking | ✅ | ✅ | ❌ | ✅ | Partial | ❌ | ✅ |
| Email sequences | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Client sharing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Credit rollover | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| White collar | All roles | All roles | All roles | Tech only | All | Non-IT | Tech-first |
| Credit/₹ ratio | ₹20/credit | ₹13.3/credit | ₹40/CV | ₹51.9/unlock | — | ₹4/email | Variable |

---

## PART 6 — CODEBASE CHANGES REQUIRED

### 6A — lib/config/plans.ts  (REPLACE ENTIRELY)

```typescript
// lib/config/plans.ts
// Single source of truth for all plan limits. Import from here everywhere.

export type PlanId = "free" | "solo" | "growth" | "custom";

export interface PlanConfig {
  id:                PlanId;
  name:              string;
  price_monthly:     number;   // INR
  price_annual:      number;   // INR (total, not per month)
  credits_monthly:   number;   // -1 = unlimited
  search_results:    number;   // -1 = unlimited
  max_sequences:     number;   // -1 = unlimited
  max_roles:         number;   // -1 = unlimited
  client_view_shares:number;   // -1 = unlimited, 0 = none
  mailboxes:         number;
  talent_network:    "none" | "basic" | "full";
  credit_rollover:   boolean;
  // Credit costs
  email_reveal_cost:       number;  // credits per email reveal
  phone_email_reveal_cost: number;  // credits per phone+email reveal
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id:                      "free",
    name:                    "Free",
    price_monthly:           0,
    price_annual:            0,
    credits_monthly:         15,
    search_results:          10,
    max_sequences:           1,
    max_roles:               1,
    client_view_shares:      0,
    mailboxes:               0,
    talent_network:          "none",
    credit_rollover:         true,
    email_reveal_cost:       1,
    phone_email_reveal_cost: 8,
  },
  solo: {
    id:                      "solo",
    name:                    "Solo",
    price_monthly:           3999,
    price_annual:            39990,
    credits_monthly:         200,
    search_results:          1500,
    max_sequences:           5,
    max_roles:               5,
    client_view_shares:      5,
    mailboxes:               1,
    talent_network:          "basic",
    credit_rollover:         true,
    email_reveal_cost:       1,
    phone_email_reveal_cost: 8,
  },
  growth: {
    id:                      "growth",
    name:                    "Growth",
    price_monthly:           7999,
    price_annual:            79990,
    credits_monthly:         600,
    search_results:          -1,    // unlimited
    max_sequences:           -1,
    max_roles:               -1,
    client_view_shares:      -1,
    mailboxes:               2,
    talent_network:          "full",
    credit_rollover:         true,
    email_reveal_cost:       1,
    phone_email_reveal_cost: 8,
  },
  custom: {
    id:                      "custom",
    name:                    "Custom",
    price_monthly:           24999,  // base, actual is negotiated
    price_annual:            -1,     // negotiated
    credits_monthly:         -1,
    search_results:          -1,
    max_sequences:           -1,
    max_roles:               -1,
    client_view_shares:      -1,
    mailboxes:               4,
    talent_network:          "full",
    credit_rollover:         true,
    email_reveal_cost:       1,
    phone_email_reveal_cost: 8,
  },
};

// Helper: check if a plan limit has been reached
export function isUnlimited(val: number) { return val === -1; }

// Helper: get max phones per month from credit budget
export function maxPhonesFromCredits(credits: number): number {
  if (credits === -1) return -1;
  return Math.floor(credits / 8);
}

// Helper: credit cost for a reveal action
export function creditCostForReveal(type: "email" | "phone_email"): number {
  return type === "email" ? 1 : 8;
}

export const PLAN_ANNUAL_COPY = "Pay 10 months. Get 12. 2 months FREE.";
export const PLAN_ORDER: PlanId[] = ["free", "solo", "growth", "custom"];
```

---

### 6B — Supabase SQL: org_credits table (REPLACE old quota columns)

```sql
-- Drop old quota columns if they exist
ALTER TABLE orgs
  DROP COLUMN IF EXISTS email_quota,
  DROP COLUMN IF EXISTS phone_quota,
  DROP COLUMN IF EXISTS search_quota;

-- Add credit columns to orgs
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS plan            TEXT DEFAULT 'free'
    CHECK (plan IN ('free','solo','growth','custom')),
  ADD COLUMN IF NOT EXISTS billing_cycle   TEXT DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly','annual')),
  ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 15,   -- current available credits
  ADD COLUMN IF NOT EXISTS credits_used    INTEGER DEFAULT 0,    -- used this cycle
  ADD COLUMN IF NOT EXISTS credits_monthly INTEGER DEFAULT 15,   -- allocation per cycle
  ADD COLUMN IF NOT EXISTS cycle_resets_at TIMESTAMPTZ;

-- credit_transactions: every credit debit/credit event
CREATE TABLE IF NOT EXISTS credit_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id),
  type         TEXT NOT NULL
               CHECK (type IN ('monthly_grant','rollover','reveal_email','reveal_phone','manual_topup','refund')),
  amount       INTEGER NOT NULL,   -- positive = credits added, negative = credits spent
  balance_after INTEGER NOT NULL,
  candidate_id UUID REFERENCES candidates(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_txn_org ON credit_transactions(org_id, created_at DESC);

-- RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read own credit transactions"
  ON credit_transactions FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

---

### 6C — lib/credits/use-credits.ts  (REPLACE old reveal deduction logic)

```typescript
// lib/credits/use-credits.ts
import { createServiceClient } from "@/lib/supabase/service";
import { creditCostForReveal } from "@/lib/config/plans";

export type RevealType = "email" | "phone_email";

export interface UseCreditsResult {
  success:      boolean;
  credits_used: number;
  balance_after:number;
  error?:       string;
}

/**
 * Atomically deduct credits for a reveal action.
 * Uses a Supabase RPC to prevent race conditions.
 */
export async function useCreditsForReveal(params: {
  orgId:       string;
  userId:      string;
  revealType:  RevealType;
  candidateId: string;
}): Promise<UseCreditsResult> {
  const supabase = createServiceClient();
  const cost     = creditCostForReveal(params.revealType);

  // Atomic deduct via RPC (prevents double-spend)
  const { data, error } = await supabase.rpc("deduct_credits", {
    p_org_id:       params.orgId,
    p_amount:       cost,
    p_type:         params.revealType === "email" ? "reveal_email" : "reveal_phone",
    p_user_id:      params.userId,
    p_candidate_id: params.candidateId,
  });

  if (error || !data?.success) {
    return {
      success:       false,
      credits_used:  0,
      balance_after: data?.balance_after ?? 0,
      error:         data?.error ?? error?.message ?? "Insufficient credits",
    };
  }

  return {
    success:      true,
    credits_used: cost,
    balance_after: data.balance_after,
  };
}

/**
 * Get current credit balance for an org.
 */
export async function getCreditBalance(orgId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orgs")
    .select("credits_balance")
    .eq("id", orgId)
    .single();
  return data?.credits_balance ?? 0;
}
```

---

### 6D — Supabase RPC: deduct_credits (add to migrations)

```sql
-- Function: deduct_credits (atomic, prevents race conditions)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_org_id       UUID,
  p_amount       INTEGER,
  p_type         TEXT,
  p_user_id      UUID,
  p_candidate_id UUID DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance     INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the org row
  SELECT credits_balance INTO v_balance
  FROM orgs
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Org not found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient credits',
      'balance_after', v_balance
    );
  END IF;

  v_new_balance := v_balance - p_amount;

  -- Deduct from org
  UPDATE orgs
  SET credits_balance = v_new_balance,
      credits_used    = credits_used + p_amount,
      updated_at      = NOW()
  WHERE id = p_org_id;

  -- Log transaction
  INSERT INTO credit_transactions
    (org_id, user_id, type, amount, balance_after, candidate_id)
  VALUES
    (p_org_id, p_user_id, p_type, -p_amount, v_new_balance, p_candidate_id);

  RETURN json_build_object(
    'success', true,
    'credits_used', p_amount,
    'balance_after', v_new_balance
  );
END;
$$;
```

---

### 6E — app/api/reveal/route.ts  (UPDATE — use credit model)

Replace the entire deduction block in your existing reveal API:

```typescript
// Replace old email_quota/phone_quota checks with:
import { useCreditsForReveal }  from "@/lib/credits/use-credits";
import { creditCostForReveal }  from "@/lib/config/plans";

// Determine reveal type
const revealType: RevealType = includePhone ? "phone_email" : "email";
const cost                   = creditCostForReveal(revealType);

// Check balance first (fast path before calling Prospeo)
const { data: orgData } = await supabase
  .from("orgs")
  .select("credits_balance, plan")
  .eq("id", orgId)
  .single();

if ((orgData?.credits_balance ?? 0) < cost) {
  return NextResponse.json({
    error:   "Insufficient credits",
    balance: orgData?.credits_balance ?? 0,
    needed:  cost,
    upgrade_url: "/settings/billing",
  }, { status: 402 });
}

// Call Prospeo, then deduct credits atomically
const prospeoResult = await fetchFromProspeo(candidate, includePhone);

const creditResult = await useCreditsForReveal({
  orgId,
  userId:      user.id,
  revealType,
  candidateId: candidate.id,
});

if (!creditResult.success) {
  return NextResponse.json({ error: creditResult.error }, { status: 402 });
}

// Return with updated balance in response
return NextResponse.json({
  ...prospeoResult,
  credits_used:  creditResult.credits_used,
  credits_left:  creditResult.balance_after,
});
```

---

### 6F — app/(app)/settings/billing/page.tsx  (UPDATE pricing display)

Replace all hard-coded pricing numbers with values from `PLANS` config:

```typescript
import { PLANS, PLAN_ANNUAL_COPY, maxPhonesFromCredits } from "@/lib/config/plans";

// Render plan cards from PLANS object:
const planCards = [
  {
    plan:     PLANS.solo,
    popular:  false,
    cta:      "Start Solo",
    highlight: `Up to ${maxPhonesFromCredits(PLANS.solo.credits_monthly)} phone reveals/month`,
  },
  {
    plan:     PLANS.growth,
    popular:  true,
    cta:      "Start Growth",
    highlight: `Up to ${maxPhonesFromCredits(PLANS.growth.credits_monthly)} phone reveals/month`,
  },
];

// Annual toggle shows: PLAN_ANNUAL_COPY
// Prices: PLANS.solo.price_monthly, PLANS.growth.price_monthly
// Annual: PLANS.solo.price_annual, PLANS.growth.price_annual
```

---

### 6G — components/reveal/RevealButton.tsx  (UPDATE credit cost display)

```typescript
import { creditCostForReveal } from "@/lib/config/plans";

// Replace hard-coded credit costs:
const emailCost = creditCostForReveal("email");         // 1
const phoneCost = creditCostForReveal("phone_email");   // 8

// In the button tooltip/label:
// "Reveal email (1 credit)"
// "Reveal phone + email (8 credits)"
```

---

### 6H — Landing Page /app/(marketing)/pricing/page.tsx  (UPDATE)

Full pricing page must reflect v5.0 credit model. Key sections:

```typescript
// Section 1: Hero
"Search smarter. Reveal faster. Close more roles."
"AI-ranked candidates with real phone numbers. From ₹3,999/month."

// Section 2: Plan cards (FREE, SOLO, GROWTH, CUSTOM)
// Use PLANS config for all numbers — never hard-code.

// Section 3: Credit explainer block
"How credits work"
"Email reveal = 1 credit  ·  Phone + Email reveal = 8 credits"
"Credits never expire. Roll over every month."
"[Interactive calculator: drag slider, see how many phones vs emails]"

// Section 4: Competitor comparison table (Part 5 of this doc)

// Section 5: FAQ
Q: "Why 8 credits for phone?"
A: "Phone data costs ~8× more to source than email. We bundle email free with every phone reveal, so you always get both."

Q: "Do credits expire?"
A: "Never. Unused credits roll forward every month."

Q: "Can I mix phone and email reveals?"
A: "Yes. 200 credits = 200 emails, OR 25 phones+emails, OR any combination."

Q: "What happens if I run out of credits mid-month?"
A: "You can top up with a credit pack or upgrade your plan. We never cut off access to your dashboard."
```

---

### 6I — _meta/PRICING-CHANGELOG.md entry to append

```markdown
## v5.0 — March 2026 (Credit Model)
- Replaced email_quota + phone_quota split with unified credit system
- Email reveal: 1 credit
- Phone + Email reveal: 8 credits (email free when bundled with phone)
- FREE: 15 credits, SOLO: 200 credits, GROWTH: 600 credits
- Prices: Free ₹0 | Solo ₹3,999 | Growth ₹7,999 | Custom ₹24,999+
- Annual: "Pay 10 months. Get 12." (Solo ₹39,990 | Growth ₹79,990)
- Credits never expire — rollover enabled
- Added deduct_credits() Supabase RPC (atomic, race-condition-safe)
- Added credit_transactions table for full audit log
- Margins: Solo 84.7–87.0% | Growth 80.8–84.3% | Blended 83.3%
```

---

## PART 7 — CODEBASE SEARCH: Find & Replace Old Pricing References

Run these searches in your IDE and update every result:

```bash
# Old quota references to replace
grep -r "email_quota"      --include="*.ts" --include="*.tsx" -l
grep -r "phone_quota"      --include="*.ts" --include="*.tsx" -l
grep -r "search_quota"     --include="*.ts" --include="*.tsx" -l
grep -r "3499\|6999\|2999" --include="*.ts" --include="*.tsx" -l   # old prices
grep -r "150 credits\|50 credits\|100 credits"                  -l  # old credit amounts
grep -r "email_reveal_cost.*5\|phone_reveal_cost.*10"            -l  # old credit costs

# New values to use everywhere:
# email reveal   → 1 credit   (creditCostForReveal("email"))
# phone reveal   → 8 credits  (creditCostForReveal("phone_email"))
# Solo credits   → 200/month  (PLANS.solo.credits_monthly)
# Growth credits → 600/month  (PLANS.growth.credits_monthly)
# Solo price     → ₹3,999     (PLANS.solo.price_monthly)
# Growth price   → ₹7,999     (PLANS.growth.price_monthly)
```

---

## PART 8 — FILES CHANGED SUMMARY

| File | Change |
|---|---|
| `lib/config/plans.ts` | **REWRITE** — single source of truth for all plan config |
| `lib/credits/use-credits.ts` | **REWRITE** — credit deduction using atomic RPC |
| `supabase/migrations/xxx_credits.sql` | **NEW** — credit_transactions table + deduct_credits RPC |
| `app/api/reveal/route.ts` | **UPDATE** — replace quota check with credit check |
| `app/(app)/settings/billing/page.tsx` | **UPDATE** — import from PLANS config |
| `components/reveal/RevealButton.tsx` | **UPDATE** — show credit costs from config |
| `app/(marketing)/pricing/page.tsx` | **UPDATE** — full pricing page rebuild |
| `app/api/admin/overview/route.ts` | **UPDATE** — show credits_balance in org stats |
| `components/layout/Sidebar.tsx` | **UPDATE** — credits_balance in sidebar footer |
| `app/api/orgs/usage/route.ts` | **UPDATE** — return credits instead of quotas |

---

## COMPLETION CHECKLIST

### Database
- [ ] `orgs` table: plan, billing_cycle, credits_balance, credits_used, credits_monthly, cycle_resets_at
- [ ] Old quota columns dropped: email_quota, phone_quota, search_quota
- [ ] `credit_transactions` table created with RLS
- [ ] `deduct_credits()` RPC created and tested (atomic, race-condition safe)

### Core Logic
- [ ] `lib/config/plans.ts`: PLANS object with all 4 tiers, creditCostForReveal(), maxPhonesFromCredits()
- [ ] `lib/credits/use-credits.ts`: useCreditsForReveal(), getCreditBalance()
- [ ] All old quota references replaced with credit references

### API
- [ ] `POST /api/reveal`: uses creditCostForReveal(), returns credits_used + credits_left
- [ ] 402 response when insufficient credits with upgrade_url
- [ ] `GET /api/orgs/usage`: returns credits_balance, credits_used, credits_monthly

### UI
- [ ] RevealButton shows "1 credit" for email, "8 credits" for phone+email
- [ ] Sidebar footer shows live credits_balance (e.g., "142 / 200 credits")
- [ ] Billing page uses PLANS config, not hard-coded numbers
- [ ] Pricing page: FREE | SOLO ₹3,999 | GROWTH ₹7,999 | CUSTOM ₹24,999+
- [ ] Annual toggle shows "Pay 10 months. Get 12. 2 months FREE."
- [ ] Credit explainer: "Email = 1 credit · Phone+Email = 8 credits · Never expire"

### Monthly Cron (credit renewal)
- [ ] Cron job at billing cycle reset: adds credits_monthly to credits_balance (rollover — does NOT reset to zero)
- [ ] Logs credit_transactions row: type = "monthly_grant" or "rollover"
- [ ] Updates cycle_resets_at to next month

## BUILD LOG ENTRY
## PRICING-v5.0 Credit Model — March 2026
### Changed: plan config, reveal API, credits table, billing UI, pricing page
### Prices: Free ₹0 | Solo ₹3,999 | Growth ₹7,999 | Custom ₹24,999+
### Credit costs: Email = 1 credit | Phone+Email = 8 credits
### Margins: 80.8%–87.0% across all scenarios ✅
### Status: ✅ Complete
