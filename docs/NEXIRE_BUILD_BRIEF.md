# Nexire — Product Brief for Development
> Version 1.0 | March 2026
> For: OpenCode / Cursor AI assistant
> Purpose: Full context to build Nexire from current state to v1 launch

---

## 1. What is Nexire?

Nexire is an AI-powered recruitment platform built for Indian recruiters and global
sourcing teams. It is positioned as "Cursor for HR" — not a search engine, but a
hiring co-pilot that understands job descriptions, finds the right candidates, and
gets smarter with every search.

**The core problem it solves:**
Recruiters today paste JDs into LinkedIn, manually set 6–8 filters, get generic
results, and repeat from scratch every time. Nexire replaces that entire flow with
a single conversational input — paste a JD or type naturally — and the AI builds
the search, scores results by relevance, and remembers context across the session.

**Who uses it:**
- Independent recruiters in India (primary)
- Small recruitment agencies (3–5 person teams)
- Global sourcers looking for an affordable Juicebox alternative

**What makes it different from Juicebox (the main competitor):**
- Juicebox: type query → get results → done. Resets every time.
- Nexire: paste JD → AI extracts everything → conversational refinement →
  scored results with explanation → contact unlock (phone + email together)
- Juicebox gives phone numbers only on $199/month plan
- Nexire gives phone + email from the entry plan
- Nexire understands Indian job market context (domain-aware scoring)

---

## 2. Current State (Already Built — Do Not Rebuild)

The following is fully functional. Reference file: SEARCH_SYSTEM_END_TO_END.md

### Backend (Next.js App Router)
- `POST /api/ai/chat` — conversational search, accumulates context turn by turn
- `POST /api/ai/context-to-filters` — converts chat context to search filters
- `POST /api/ai/extract-and-resolve` — one-shot JD paste → filters
- `POST /api/search` — executes search via Waterfall Engine, scores, persists
- `GET /api/suggestions` — Redis-cached Prospeo suggestions proxy
- Waterfall Engine — 3-pass search (exact → similar titles → nearby cities)
- Industry Expander — maps shorthand industries to valid API enum strings
- Scorer (Antigravity) — weighted scoring: title 30pt + skills 25pt + domain 20pt
  + location 15pt + experience 10pt + domain penalty -30pt for wrong industry
- Domain Filter — post-search exclusion of wrong-domain candidates
- Supabase — auth, org, search persistence, candidate storage

### Frontend (Next.js + Tailwind + Zustand)
- SearchTerminal.tsx — chat UI, chip suggestions, search intent selector
- FilterSummaryCard.tsx — shows resolved filters before search runs
- FilterModal.tsx — manual filter editing
- Search store (Zustand) — COLLECTING → CONFIRMING → SEARCHING state machine
- Projects + Searches sidebar
- Shortlist page
- Contacts page (basic)

### Current data provider: Prospeo
- Used for: person search, job title suggestions, location suggestions
- Problem: returns only current job title, no skills/past jobs/education
- This is why scoring was flat (no skills data to score against)

---

## 3. The Migration: Prospeo Search → CrustData

### Why migrate
CrustData returns 100 full profiles for 3 credits ($0.30). Each profile includes:
- `skills[]` — direct array, filterable at source
- `past_employers[]` — full job history with titles, companies, dates
- `education_background[]` — degree, field of study, institution
- `recently_changed_jobs` boolean — active candidate signal
- `years_of_experience_raw` — exact number
- `current_employers[].company_industries[]` — direct industry match
- `emails[]` — already in search result (no separate call needed)

Prospeo returns: current title, location, headline only. Nothing else.

### What changes in the codebase

#### New files to create:
```
lib/crustdata/
  client.ts       — HTTP wrapper for CrustData API
  types.ts        — TypeScript types for CrustData person object
  filter-builder.ts — converts extracted context to CrustData filter array format
  industry-map.ts — maps Nexire domain clusters to CrustData industry strings
```

#### Files to modify:
```
lib/waterfall-engine.ts    — rewrite for CrustData pagination model
app/api/search/route.ts    — swap Prospeo client for CrustData client
lib/ai/scorer.ts           — use skills[] and company_industries[] directly
lib/ai/domain-filter.ts    — use company_industries[] instead of keyword matching
```

#### Prospeo remains for ONE thing only:
Contact unlock — phone number + email reveal on demand (per click, not per search)

New endpoint needed:
```
app/api/contacts/unlock.ts
  — receives: linkedin_profile_url or person identifier
  — calls: Prospeo mobile finder + email finder
  — returns: { phone, email, credits_used }
  — deducts 1 contact credit from user's account
```

### CrustData filter format (different from Prospeo)
You can visit the /CRUSTDATA Folder for all the API Documentation, we would enable the geo location API as well crusdata provide the geo location API as well default to 30 miles radius.adn user have option to change and for that you have also have to engineer in the filter section again. 
```json
POST https://api.crustdata.com/screener/persondb/search
{
  "filters": [
    { "column": "current_employers.title", "type": "in", "value": ["QC Inspector"] },
    { "column": "skills", "type": "in", "value": ["Vernier Calipers", "Micrometer"] },
    { "column": "region_address_components", "type": "=", "value": "Kolkata" },
    { "column": "years_of_experience_raw", "type": ">=", "value": 3 },
    { "column": "current_employers.company_industries", "type": "in",
      "value": ["Mechanical Engineering", "Industrial Machinery"] }
  ],
  "page_size": 100
}
```

### New waterfall logic
```
OLD: 3 Prospeo API calls (1 per pass)
NEW: 1 CrustData call → 100 profiles stored locally → paginate 15/page (free)

If total results < 15:
  Relaxation pass 1: drop skills filter, re-call
  Relaxation pass 2: expand location (add nearby cities), re-call
  Max 2 relaxation passes. Show whatever exists.

Pagination: all handled client-side from stored 100 profiles. Zero API cost.
```
ANother main thing is we have to test it out the results that are coming from the crustdata peopledb api, where we have to get 20 profiles at a time in page 1 not 15 so that 5 pages of 100 results, credits usage would 3,
 for the same jd we also have to make another call to the api to give only 20 results at a time not more than that so we are saving credits and if the person goes to the next page calls again the 20 , so you have to observe and conclude with different jds or inputs should we required to structure the coming results in our end or not , means for 100 results we can rearrrange the best candidates that are coming more effeciently rather than 20 results . so we have to check that crustdata algo to give very good result infront or not ! 
---

## 4. What to Build Now (Phase 1 — Launch Features Only)

These are the ONLY features needed for v1 launch. Nothing else.

---

### 4A. Score Explainability on Candidate Cards

Every candidate card shows a breakdown of why they scored what they scored.
The scorer already computes component scores. Just surface them.

**UI element:** Expandable section on each candidate card.
```
Score: 84 / 100
✅ Title match          +28
✅ Skills (2/3 matched) +17
✅ Industry domain      +20
✅ Location (Howrah)    +12
⚠️ Experience (2yr, below 3yr floor) +0 (not penalised, just no points)
━━━━━━━━━━━━━━━━━━━━━
Matched skills: Vernier Calipers, Micrometer
Missing: Height Gauge
```

Special NOTE: in 4A addition to score we would add the "AI Summary" of the candidate based on the job description. highlighting the matching things words to color change to light yellow .

**Backend change:** scorer.ts returns `score_breakdown` object alongside final score.
**Frontend change:** CandidateCard.tsx renders breakdown on expand/hover.

---

### 4B. Rich Candidate Cards (Past Jobs + Education)

CrustData gives past_employers[] and education_background[]. Show them on cards. with the skills also 

**Card layout (new):**
```
┌────────────────────────────────────────────┐
│ Ranajoy Pandit                  Score: 84  │
│ QC Inspector · Rane NSK                    │
│ Howrah · 4 years experience                │
│                                            │
│ Skills: [Vernier Calipers] [Micrometer]    │
│                                            │
│ Past: Tata Metaliks (2019–2022)            │
│       Junior QC Inspector                  │
│                                            │
│ Education: B.Tech Mechanical, MAKAUT 2019  │
│                                            │
│ [📞 Unlock Phone + Email] [💾 Save]        │
└────────────────────────────────────────────┘
```

**Rules:**
- Show max all past employer with when hover to that employers details will be shown in a short beside the hover with the details that crustdata gives you can follow up with the /CRUSTDATA Folders
- Show education degree + institution only and whatever the data that are good or we shoudl have to display please make sure display that 
- Skills shown as chips, max 4 visible, "+N more" for rest
- Score shown as number + thin progress arc (not a bar)
- showcase Total number of ex in the top and any iportant field also . 

---

### 4C. Contact Unlock Flow

When recruiter clicks "Unlock Phone + Email":
1. Show a confirmation modal with credit cost
2. Call `/api/contacts/unlock` → Prospeo fetches phone + email
3. Display results in modal
4. Copy buttons for each field
5. Deduct 1 contact credit from plan quota
6. Show remaining credits

**Modal:**
```
┌────────────────────────────────────┐
│  Unlock Contact                    │
│  Ranajoy Pandit · Rane NSK         │
│                                    │
│  📧 ranajoy.p@gmail.com    [Copy]  │
│  📱 +91 98765 43210        [Copy]  │
│                                    │
│  1 contact credit used             │
│  Remaining: 24 / 25                │
│                                    │
│  [✉ Email Outreach] [Close]        │
└────────────────────────────────────┘
```

---

### 4D. Market Snapshot Panel

After every search, show aggregate intelligence from the 100 profiles fetched.
This data costs nothing extra — it comes from the CrustData response already stored.

**Display as a collapsible panel above the results:**
```
┌─────────────────────────────────────────────────┐
│  Market Snapshot — QC Inspector, Kolkata         │
│                                                  │
│  847 profiles in database                        │
│  Avg experience: 4.2 years                       │
│  Top employers: Texmaco Rail · Kiswok · Manaksia │
│  Most common skills: ISO 9001 (67%) · Vernier    │
│  Calipers (43%)                                  │
│  Active candidates (job change <60d): 23%        │
└─────────────────────────────────────────────────┘
```

**Implementation:** `lib/ai/market-snapshot.ts` — aggregates from stored profiles.
No extra API call. Pure computation on already-fetched data.

---

### 4E. Bias Detection in JD (Non-blocking Warning)

Before search fires, LLM scans extracted JD context for bias signals.
If found, show a yellow warning. Recruiter can dismiss and proceed.

**Bias signals to detect:**
- Age range: "25–35 years", "below 30", "freshers only"
- Gender language: "female preferred", "male candidates"
- Caste/religion: any mention (illegal in India)

**UI:** Yellow banner above FilterSummaryCard.
```
⚠️  Age restriction detected ("25–35 years")
    This may limit your candidate pool. Remove to search broader.
    [Remove & Search] [Search Anyway]
```

**Implementation:** Add one LLM check step in `extract-and-resolve/route.ts`.
Input: extracted context. Output: `{ bias_detected: boolean, bias_type: string, suggestion: string }`

---

### 4F. Credits & Usage Display

Recruiter always sees their credit status. Never a surprise.

**Persistent header element:**
```
Searches: 22/40 used  |  Contacts: 18/25 used  |  [Upgrade]
```

**On search run:**
- Show "1 search credit used. 21 remaining."
- If 0 remaining: show upgrade prompt, block search

**On contact unlock:**
- Show "1 contact credit used. 17 remaining."
- If 0 remaining: show add-on pack purchase modal

**Add-on pack modal:**
```
┌──────────────────────────────────┐
│  You've used all contact credits │
│                                  │
│  [25 unlocks  — ₹999  / $12]    │
│  [100 unlocks — ₹2,999 / $35]   │
│  [500 unlocks — ₹12,999 / $129] │
│                                  │
│  Or upgrade your plan →          │
└──────────────────────────────────┘
```

---

## 5. UI Design System

### Brand Colors
```
Primary:      #4C6DFD  (Nexire blue)
Primary dark: #3A56E8
Gradient:     linear-gradient(135deg, #4C6DFD 0%, #7B9FFF 50%, #B8CFFF 100%)
Background:   #FFFFFF (light mode default)
Surface:      #F8F9FF (very light blue tint)
Border:       #E8ECFF
Text primary: #0F1629
Text muted:   #6B7280
Success:      #10B981
Warning:      #F59E0B
Error:        #EF4444
Score high:   #10B981 (green, 75+)
Score mid:    #F59E0B (amber, 50–74)
Score low:    #6B7280 (grey, below 50)
```

### Design References (from attached images)
- **Hero section (Cluely style):** Clean `#4C6DFD` to `#B8CFFF` gradient background, large elegant typography (serif or thin sans-serif), minimal nav, soft glowing central CTA button (`box-shadow: 0 0 20px rgba(76,109,253,0.5)`).
- **Dashboard layout (Stratum AI style):** Light mode, `backdrop-blur` on panels, pale/soft backgrounds (`#F8F9FF`), clean pill-shaped tabs/segmented controls, minimalist grid layouts.
- **Table/list views (Stratum AI history style):** Clean rows with very subtle borders (`0 1px 3px rgba(76,109,253,0.08)`), pill-shaped status tags matching text/background hues at low opacity (adapt to score tiers).
- **AI Assistant:** Floating card style on the right, light green/blue soft backgrounds, large and inviting titles, suggesting chips for queries.

### Typography
```
Headings:  Geist (Thin/Light variants for large text) or a clean Serif for the Hero
Body:      Inter, 14px, line-height 1.6
Monospace: For scores and numbers only
```

### Component Principles
- Rounded corners: 16px for large cards, 12px for standard cards, 8px for inputs, 20px (pill) for status tags and segmented controls
- Shadow: subtle, floating effect — `box-shadow: 0 4px 40px rgba(0,0,0,0.03)` and `0 1px 3px rgba(76,109,253,0.08)`
- Candidate cards: white background, `#E8ECFF` border, no heavy shadows
- Chips (skills): light blue fill `#EEF2FF`, `#4C6DFD` text, no border, pill-shaped
- Buttons: primary = `#4C6DFD` fill, white text with soft glow. Secondary = white, `#4C6DFD` border/text
- AI messages: `#F8F9FF` background, left-aligned, no chat bubble shape, rounded corners

---


**When no search is active (new role screen):**
- Main area shows the search input (current SearchTerminal content)
  but as a card in the middle of the workspace, not full-screen
- Right panel shows example queries as chips (current placeholder chips)
- Left nav shows "+ New Role" highlighted

**On mobile:**
- Single column, left nav collapses to icon strip
- Right AI panel becomes bottom sheet
- Out of scope for v1

---

## 7. Pricing Plans (for Billing UI)

### India Plans
| Plan    | Price      | Searches | Contacts (Phone+Email) | Seats |
|---------|------------|----------|------------------------|-------|
| Free    | ₹0         | 5 total  | 5 email only           | 1     |
| Solo    | ₹8,999/mo  | 40/mo    | 25 unlocks             | 1     |
| Agency  | ₹11,999/mo | 80/mo    | 60 unlocks             | 3     |

### Global Plans
| Plan    | Price    | Searches | Contacts | Seats |
|---------|----------|----------|----------|-------|
| Free    | $0       | 5 total  | 5 email  | 1     |
| Starter | $49/mo   | 20/mo    | 10       | 1     |
| Growth  | $89/mo   | 40/mo    | 25       | 1     |
| Pro     | $139/mo  | 80/mo    | 60       | 3     |

### Daily caps (enforced server-side, never shown to user publicly)
- Solo / Starter: 6 searches/day max
- Agency / Pro: 10 searches/day max
- Marketed as "unlimited" — fair-use policy in ToS only

### Add-on packs (contact credits only)
| Pack       | India    | Global |
|------------|----------|--------|
| 25 unlocks | ₹999     | $12    |
| 100 unlocks| ₹2,999   | $35    |
| 500 unlocks| ₹12,999  | $129   |

---

## 8. Data Architecture

### Supabase Tables (existing + new)

```
users              — auth, plan, credits_searches, credits_contacts
organizations      — team, seats
projects           — role/JD workspace (already exists as "projects")
searches           — each search run, filters used, result count
candidates         — each profile shown, score, score_breakdown (JSON)
candidate_interactions — skip / save / shortlist per candidate per search
contact_unlocks    — phone/email revealed, credit deducted, timestamp
```

### New fields needed on existing tables
```
candidates:
  + score_breakdown    JSONB   — { title, skills, domain, location, exp, penalty }
  + skills             TEXT[]  — from CrustData skills[]
  + past_employers     JSONB[] — from CrustData past_employers[]
  + education          JSONB[] — from CrustData education_background[]
  + recently_changed   BOOLEAN — from CrustData recently_changed_jobs

searches:
  + domain_cluster     TEXT    — mechanical / civil / software / etc.
  + market_snapshot    JSONB   — aggregated stats from result set
  + data_source        TEXT    — "crustdata" (for migration tracking)
```

---

## 9. Environment Variables Needed

```
# Existing
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PROSPEO_API_KEY          — keep for contact unlock only
GEMINI_API_KEY           — LLM for chat + extraction
REDIS_URL                — suggestion caching

# New
CRUSTDATA_API_KEY        — replace Prospeo for search
```

---

## 10. Build Order (Strict Sequence)

Do these in order. Do not skip ahead.

### Step 1 — CrustData Integration (Days 1–3)
1. Create `lib/crustdata/types.ts`
2. Create `lib/crustdata/client.ts`
3. Create `lib/crustdata/filter-builder.ts`
4. Create `lib/crustdata/industry-map.ts`
5. Rewrite `lib/waterfall-engine.ts`
6. Update `app/api/search/route.ts`
7. Test: Mechanical Inspector JD → verify skills[], past_employers[] in response

### Step 2 — Contact Unlock (Day 4)
1. Create `app/api/contacts/unlock.ts`
2. Wire Prospeo mobile + email finder
3. Deduct contact credit from user account in Supabase
4. Return { phone, email, credits_remaining }

### Step 3 — Scorer Update (Day 5)
1. Update `lib/ai/scorer.ts` to use `skills[]` and `company_industries[]` directly
2. Add `score_breakdown` object to scorer return
3. Update domain-filter.ts to use `company_industries[]` directly
4. Verify score spread: top candidate 80+, wrong-domain candidate under 20

### Step 4 — Rich Candidate Cards + Score Explainability (Days 6–7)
1. Update `CandidateCard.tsx` — add past employer, education fields
2. Add score breakdown expand section
3. Add contact unlock button → triggers unlock modal
4. Add skills chips with match highlighting

### Step 5 — UI Redesign — 3-Column Layout (Days 8–12)
1. Rebuild main layout to 3-column (nav + candidates + AI panel)
2. Apply design system (colors, gradients, typography from Section 5)
3. Move search input into workspace (not full-screen)
4. Apply Cluely-style blue gradient to hero/landing page
5. Apply Stratum AI-style clean dashboard to workspace

### Step 6 — Market Snapshot + Bias Detection (Days 13–14)
1. Create `lib/ai/market-snapshot.ts`
2. Add snapshot panel above results
3. Add bias detection step in extract-and-resolve
4. Add warning banner UI

### Step 7 — Credits UI + Add-on Packs (Day 15)
1. Persistent credits display in header
2. Credit deduction on search run
3. Credit deduction on contact unlock
4. Add-on pack purchase modal (Stripe or Razorpay)
5. Upgrade prompt when credits = 0

---

## What is NOT in Scope for v1

Do not build these now. They are future features:
- WhatsApp outreach
- Rejection learning loop
- "Find someone like X" (pgvector similarity)
- Proactive pipeline agent
- AI interview scoring
- ATS sync (Greenhouse/Lever/Workday)
- Mobile app
- Multi-role pipeline dashboard (kanban)
- Candidate re-engagement engine

---

## 11. Sub-Agents Architecture & Execution Commands

**Authorization:** OpenCode / Cursor AI agents are hereby explicitly authorized to build, modify, and execute tasks across the Nexire project according to this document's scope.

**Model Restriction:** ONLY use **Gemini 1.5 Pro** (or Gemini 3.1 Pro Preview, if available) for all reasoning, complex logic, and deep codebase changes. Use Gemini 1.5 Flash *only* for fast, single-file formatting tasks if needed. Gemini 1.5 Pro's massive context window is required for understanding the Waterfall Engine and CrustData mappings simultaneously.

To execute the Build Order (Section 10) faster, spin up the following Sub-Agents in parallel where safe. Provide each agent with the specific commands below to start their tasks immediately.

### Agent 1: Backend API & Data Pipeline Architect (Steps 1 & 2)
**Context:** Responsible for integrating CrustData, rewriting the waterfall engine, and creating the Prospeo contact unlock endpoint.
**Execution Command (Copy & Paste to Agent):**
> "You are the Backend Data Pipeline Agent. Model: Gemini 1.5 Pro. Read `@docs/NEXIRE_BUILD_BRIEF.md` Sections 3 and 10 (Steps 1 & 2) and `@CLAUDE.md`. Start by creating `lib/crustdata/types.ts` and `lib/crustdata/client.ts`. Then build the `filter-builder.ts` and modify `app/api/search/route.ts` to swap Prospeo for CrustData. Keep pagination handled locally. After testing, build `app/api/contacts/unlock.ts`."

### Agent 2: AI Logic & Scorer Optimization (Steps 3 & 6)
**Context:** Updates the scoring system (`lib/ai/scorer.ts`) to use CrustData arrays and adds the Market Snapshot intelligence logic.
**Execution Command (Copy & Paste to Agent):**
> "You are the AI Logic Agent. Model: Gemini 1.5 Pro. Read `@docs/NEXIRE_BUILD_BRIEF.md` Sections 4A, 4D, 4E, and 10 (Steps 3 & 6). Start by rewriting `lib/ai/scorer.ts` to utilize `skills[]` and `company_industries[]` directly, ensuring it returns a `score_breakdown` object. Then, implement `lib/ai/market-snapshot.ts` to aggregate the first 100 CrustData profiles, and add the bias detection warning logic to `extract-and-resolve`."

### Agent 3: Frontend UI/UX Design Specialist (Steps 4 & 5)
**Context:** Implements the Stratum AI and Cluely-inspired modern interface, the 3-column layout, and rich candidate cards.
**Execution Command (Copy & Paste to Agent):**
> "You are the Frontend UI/UX Agent. Model: Gemini 1.5 Pro. Read `@docs/NEXIRE_BUILD_BRIEF.md` Sections 4B, 5, 6, and 10 (Steps 4 & 5). Analyze the 'Design Inspiration/' directory style requirements. Start by restructuring the main layout into the 3-column workspace (`nav`, `main`, `ai-panel`). Next, build the Rich Candidate Card with past employers, education, and the new score breakdown expander. Finally, apply the Cluely/Stratum aesthetic: subtle shadows, rounded cards, pill-shaped segmented controls, and smooth gradients as defined in Section 5."

### Agent 4: Billing & State Management (Step 7)
**Context:** Handles credits UI, usage deduction, and Razorpay modal integration. Can run parallel to UI or AI logic.
**Execution Command (Copy & Paste to Agent):**
> "You are the Billing & State Agent. Model: Gemini 1.5 Pro. Read `@docs/NEXIRE_BUILD_BRIEF.md` Sections 4C, 4F, 7, and 10 (Step 7). Start by updating the persistent credits display in the header. Then, ensure `engine.ts` correctly handles deductions for `searches` and `contact_unlocks`. Finally, build the upgrade and add-on pack modal UI."

---
*Document prepared: March 2026*
*For use with: OpenCode / Cursor AI assistant*
*Owner: Bipul Sikder, Nexire*
