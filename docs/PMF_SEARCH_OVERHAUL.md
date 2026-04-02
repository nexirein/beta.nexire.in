# Nexire Search — PMF Overhaul Documentation
**Date:** March 28, 2026  
**Trigger:** Pre-launch beta feedback from Kartik Dewan  
**Goal:** Close the gap between Nexire and LinkedIn on search precision, transparency, and trustworthiness before public launch.

---

## 1. Kartik's Feedback — Point-by-Point Audit

### ✅ #1 — Education filter did not provide relevant options (e.g. "Master's in Architecture")
**Status: FULLY IMPLEMENTED**

**Root cause:** The degree field was a plain `TagInput` free-text box. Users had no structured options and couldn't know what values were valid.

**Fix:**
- `components/search/FilterModal.tsx` — `EducationSection` replaced with:
  - **8 structured Degree Level chip toggles**: `Bachelor's`, `Master's`, `MBA`, `PhD`, `Post-Grad Diploma`, `Diploma/Vocational`, `Associate's`, `Professional (MBBS/LLB/CA)`
  - **Grouped Field of Study dropdown** with these categories:
    - 🏛 Architecture & Design (Architecture, Urban Design, Interior Design, Landscape Architecture, Industrial Design)
    - ⚙️ Engineering (Civil, Mechanical, Electrical, Electronics, Chemical, Aerospace, Structural)
    - 💼 Business & Management (Business Administration, Finance, Marketing, HR, Operations, Economics)
    - 💻 Technology (Computer Science, Information Technology, Data Science, AI/ML, Cybersecurity, Software Engineering)
    - 🏥 Healthcare (Medicine, Pharmacy, Nursing, Public Health, Biomedical)
    - 🌍 Social Sciences (Psychology, Sociology, Political Science, Law, Education)
    - Free-text custom entry fallback at the bottom
  - Helper text under degree chips: `"Selecting Master's matches M.Arch, M.Tech, MSc, ME"`

---

### ✅ #2 — Search picks up profiles with limited info (only job title, no skills/relevance)
**Status: FULLY IMPLEMENTED**

**Root cause:** CrustData returns some sparse profiles that only have a job title entry with no skills, no employment duration, no description. These were passing through unfiltered.

**Fix 1 — Profile Quality Gate** (`app/api/search/route.ts`):
```typescript
function passesProfileQualityGate(candidate: CrustDataPerson): boolean {
  // Must have at least one current employer with a non-trivial title
  const employers = candidate.current_employers ?? [];
  const hasRealTitle = employers.some((e) => e.title && e.title.trim().length > 3);
  if (!hasRealTitle) return false;

  // If skills filter is active, candidate must match at least 1 skill
  const requiredSkillsFilter = (filterState.skills ?? []);
  if (requiredSkillsFilter.length > 0) {
    const profileSkills = (candidate.skills ?? []).map((s) => s.toLowerCase());
    const hasSkillMatch = requiredSkillsFilter.some((s) =>
      profileSkills.some((ps) => ps.includes(s.toLowerCase()) || s.toLowerCase().includes(ps))
    );
    if (!hasSkillMatch) return false;
  }
  return true;
}
```
Applied server-side on every result batch before scoring.

**Fix 2 — Match Signal Scorecard in UI** (`app/(app)/search/SearchResults.tsx`):
- Added `MatchSignalBars` component: renders 5 color-coded progress bars per candidate
- Bars show % of max score achieved per factor: **Title (40pts), Skills (30pts), Domain (20pts), Location (15pts), Experience (10pts)**
- Visible on hover (smooth CSS animation), always visible on selected row
- AI reason tags (e.g. `Exact Title Match · Senior Level · Preferred Company`) shown as indigo chips
- Zero extra API calls — reads from `score_breakdown` already in the scored candidate object

---

### ⚠️ #3 — Company filters not showing all companies when searching
**Status: PARTIALLY ADDRESSED — GAP REMAINS**

**Root cause:** Company name autocomplete in the filter modal calls CrustData's Autocomplete API (`/api/autocomplete/companies`). CrustData's autocomplete has coverage gaps for smaller companies, recently rebranded firms, and companies primarily known by their parent name.

**What was fixed:**
- The Strict/Boost toggle (see #4) reduces the damage of missing companies: if a company doesn't appear in the filter dropdown, the recruiter can use "Boost" mode to rank-up candidates from those companies when found naturally, rather than hard-filtering.

**Remaining gap — Recommended fix (not yet built):**
- Implement a **fuzzy compound search**: when the autocomplete returns `< 3 results`, automatically append keyword-based title+company text search as a fallback to CrustData's people DB
- Add a **"Search by LinkedIn URL" input** as a power-user escape hatch — paste the company LinkedIn URL and Nexire resolves it directly via CrustData's `company_linkedin_url` filter field

---

### ✅ #4 — Include Companies: unclear whether it filters strictly or just prioritizes
**Status: FULLY IMPLEMENTED**

**Root cause:** The UX gave no indication of the semantics. Users assumed "Include Companies = only return these companies" but the actual behavior was undefined.

**Fix:**
- `components/search/FilterModal.tsx` — new `Strict | Boost` segmented toggle:
  - **Strict mode** (default): company names go into the CrustData hard filter tree → only candidates from those companies returned
  - **Boost mode**: companies are excluded from the CrustData filter tree and instead scored as signals (+15pts) in `lib/ai/scorer.ts`
- A live explanation banner below the toggle changes color and text based on selection:
  - Strict: `"🎯 Only profiles from these companies will be returned. Use this for targeted competitor mapping."`
  - Boost: `"🚀 Search is unrestricted — candidates from these companies will rank higher. Use for priority signals."`

---

### ✅ #5 — Broaden Search feature does not display results
**Status: FULLY IMPLEMENTED**

**Root cause (confirmed via code audit):** Two compounding bugs:
1. `buildCacheKey()` in `lib/redis/search-cache.ts` hashed filter state + offset but did NOT include `pass_level`. So waterfall pass 2, 3, 4 all computed the same Redis key as pass 1 → cache hit → returned the same zero result
2. The client-side broaden was a fragile custom event chain with no guarantee of execution

**Fix 1 — Pass-aware cache key** (`lib/redis/search-cache.ts`):
```typescript
export function buildCacheKey(filters, offset, passLevel: number = 1): string {
  // _pass makes each broaden pass write to its own Redis slot
  const normalized = JSON.stringify({ ...filters, _offset: offset, _pass: passLevel });
  return `nexire:search:${crypto.createHash("md5").update(normalized).digest("hex")}`;
}
```

**Fix 2 — Server-side `auto_broaden` mode** (`app/api/search/route.ts`):
- When `auto_broaden: true` is sent, the server automatically tries passes 1 → 4
- Each pass uses progressively relaxed filters (CrustData waterfall engine)
- Results are deduplicated across passes via `seenIds` Set
- Stops as soon as ≥ 15 results are found
- Returns `what_was_relaxed: string[]` (e.g. `["Seniority filter", "Search radius expanded 5×"]`)

**Fix 3 — Client wires auto_broaden** (`app/(app)/search/SearchClient.tsx`):
- When initial search = 0 results, immediately calls `/api/search` with `auto_broaden: true`
- If broaden succeeds → shows results with amber **"Search automatically broadened"** banner
- If broaden also = 0 → sends structured `zero_result_reason` diagnostic to AI chat with actionable suggestions
- Zero-result diagnostic includes per-filter `estimated_gain_label` (e.g. `"Removing Seniority restriction typically adds 30–80% more results"`)

---

## 2. Additional PMF Recommendations (Beyond Kartik's Feedback)

These are improvements that would meaningfully accelerate product-market fit beyond the immediate beta fixes:

### 🔴 HIGH PRIORITY

#### A. Company Autocomplete Fallback (Fixes gap in #3)
- When autocomplete returns `< 3 hits`, fire a parallel search to CrustData's people DB using the company name as a `person_past_company_name` text filter
- Show the fallback results inline with a `(from people search)` label
- **Files to change:** `components/search/FilterModal.tsx`, `/api/autocomplete/companies/route.ts`

#### B. Skill Coverage Gradient (Differentiator vs LinkedIn)
- LinkedIn has no skills relevancy filter. Nexire can show a **"Skills Matched: 4/7"** counter on each card
- The scorer already computes `skills` pts — surface this as a mini badge: `⚡ 4/7 skills`
- **Files to change:** `SearchResults.tsx` (add skills-matched counter badge below education row)

#### C. "Why did Nexire find this profile?" Explainer Card
- First-time users don't understand why some profiles appear without the exact title
- A dismissible info tooltip on the `AI Ranked` badge in the list header explaining the Nexire scoring philosophy would reduce confusion and improve trust
- **Files to change:** `SearchResults.tsx` (info popover on "AI Ranked" badge)

### 🟡 MEDIUM PRIORITY

#### D. Profile Depth Score (Surface on Card)
- The quality gate currently silently drops sparse profiles. Showing a **profile completeness dot** (🟢 Rich · 🟡 Moderate · 🔴 Sparse) on each row would help recruiters prioritize outreach to candidates most likely to respond
- Signal inputs: has summary, has skills list, has education, has 3+ employers in history
- **Files to change:** `SearchResults.tsx`, optionally `scorer.ts`

#### E. Saved Search Alerts
- Recruiters run the same search weekly. Let them "Save & Alert" a search — Nexire notifies when new matching profiles are detected
- **Files to change:** New `app/api/searches/[id]/alerts/route.ts`, new Supabase table `search_alerts`, edge function or cron

#### F. Export to ATS (CSV / Greenhouse / Ashby webhook)
- LinkedIn's paid value is the ATS integrations. Offering CSV export (even basic) from the results view would be a strong PMF signal
- **Files to change:** `SearchResults.tsx` (Export button), `app/api/searches/[id]/export/route.ts`

### 🟢 NICE TO HAVE

#### G. "Compare to LinkedIn" Mode
- Show a toggle on the results header: "LinkedIn-style (title only)" vs "Nexire-style (scored)"
- Lets users viscerally see that Nexire's ranked list surfaces better matches
- This is a sales/trust feature more than a core feature

#### H. Search Quality Self-Rating
- Add a simple 👍/👎 per candidate. After the recruiter rates 5+ results, the AI scorer learns their domain preference and adjusts future scores
- **Files to change:** `SearchResults.tsx`, new Supabase `search_feedback` table, update `scorer.ts`

---

## 3. Files Changed Summary

| File | Phase | What Changed |
|------|-------|-------------|
| `components/search/FilterModal.tsx` | 1 | Structured degree chip toggles, grouped field-of-study dropdown, strict/boost toggle, headcount cumulative-upward chip UI |
| `lib/crustdata/types.ts` | 1 | Added `company_match_mode?: "strict" \| "boost"` to `CrustDataFilterState` |
| `lib/crustdata/filter-builder.ts` | 1 | `expandHeadcountUpward()` — cumulative-upward headcount logic; company names skipped from hard filter tree in boost mode |
| `lib/ai/scorer.ts` | 1 | Boost-mode company scoring: +15pts when candidate is at a matched boost company; `aiReasonParts.push("Preferred Company")` |
| `lib/hooks/useFilterState.ts` | 1 | `company_match_mode` excluded from active filter count badge |
| `lib/redis/search-cache.ts` | 2 | `buildCacheKey()` now accepts `passLevel` (default 1) — each waterfall pass gets its own Redis slot |
| `app/api/search/route.ts` | 2 | `auto_broaden` flag, server-side passes 1-4 loop with deduplication, `passesProfileQualityGate()`, zero-result diagnostic with per-filter suggestions, `what_was_relaxed` in all response paths |
| `app/(app)/search/SearchClient.tsx` | 2 | Zero-result path calls `auto_broaden: true` instead of broken event chain; `broadenNotice` state; amber banner in results view |
| `app/(app)/search/SearchResults.tsx` | 3 | `MatchSignalBars` component: 5 signal bars + AI reason tags, hover-reveal CSS animation, both insight and no-insight code paths |

---

## 4. Architecture After Overhaul

```
Search Request
      │
      ▼
┌─────────────────────────────┐
│   /api/search/route.ts      │
│                             │
│  ┌────────────────────┐     │
│  │  Cache Check       │ ◄── pass_level in key (NEW)
│  │  (Redis, 1hr TTL)  │     │
│  └────────────────────┘     │
│         ↓ miss              │
│  ┌────────────────────┐     │
│  │  auto_broaden loop │ ◄── NEW: server-side passes 1-4
│  │  executeWaterfall  │     │
│  │  per pass          │     │
│  └────────────────────┘     │
│         ↓                   │
│  ┌────────────────────┐     │
│  │  Quality Gate      │ ◄── NEW: filters sparse profiles
│  │  passesQualityGate │     │
│  └────────────────────┘     │
│         ↓                   │
│  ┌────────────────────┐     │
│  │  scoreAndRank()    │     │
│  │  title/skills/     │     │
│  │  domain/loc/exp/   │     │
│  │  +companyBoost     │ ◄── NEW: boost mode +15pts
│  └────────────────────┘     │
│         ↓                   │
│  Response: results,         │
│    what_was_relaxed,        │ ◄── NEW
│    zero_result_reason       │ ◄── NEW
└─────────────────────────────┘
      │
      ▼
SearchClient.tsx
  ├── 0 results → auto_broaden retry → amber banner
  ├── still 0 → structured diagnostic to AI chat
  └── results → SearchResults.tsx
                  └── MatchSignalBars on hover (NEW)
```

---

## 5. Phase 4: Search Credit Optimization & Diagnostic Architecture (March 28)

**Trigger:** Resolving the 12-credit silent-burn loop. The previous `auto_broaden` server-side loop was executing 4 brute-force API passes against CrustData. If the search was impossible, it burned 12 credits and took ~40 seconds just to return 0 results.

### ✅ Zero-Credit Pre-Flight Count
**Fix:** Introduced `crustdataCountSearchPeople` in `lib/crustdata/client.ts`. 
Before committing to a 100-profile fetch (3 credits), `/api/search/route.ts` fires a `limit: 1` pre-flight query to evaluate `total_count`. If the count is 0, execution halts instantly at 0 credits spent.

### ✅ AI Filter Contribution Logging
**Fix:** If the pre-flight count is 0, the server executes a series of stripped-down diagnostic count queries to isolate the exact blocking filter:
- `title_only` (e.g., 850 results)
- `title_location` (e.g., 120 results)
- `title_location_industry` (e.g., 0 results ⬅️ Blocker identified)
This telemetry is sent to the AI chat to inform the user exactly *why* their search failed, shifting from blind waterfall guessing to deterministic LLM-guided broadening.

### ✅ Skills Logic Hotfix
**Root cause:** CrustData evaluates the `skills` array using the `in` operator, which acts as a strict `AND` requirement (candidate must possess all skills). This instantly killed results for sparse Indian profiles.
**Fix:** Dropped `skills` from the primary CrustData hard-filter tree in `lib/crustdata/filter-builder.ts`. Skills are now solely evaluated during the post-fetch AI ranking step (`scoreAndRankCandidates`), preventing pipeline collapse while preserving ranking signals.

### ✅ UX: Cost Awareness & Talent Scarcity
**Fix 1:** Added a native confirmation modal to the "Auto-Broaden Search" button: `"This will execute a broader search and cost 3 credits. Proceed?"` ensuring users maintain control over their quotas.
**Fix 2:** Introduced an animated `Reality Check` banner for queries returning 1-4 results: `"This is likely a supply pipeline problem (Talent Scarcity), not a search problem."` This manages recruiter expectations for extremely niche searches.

---

*Document updated: March 28, 2026 | Author: Antigravity (AI)*  
*Covers sessions from March 28, 2026 | Feedback source: Kartik Dewan + Internal Audits*
