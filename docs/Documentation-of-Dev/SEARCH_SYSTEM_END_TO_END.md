# Nexire Search System (End-to-End)

This document describes the current Nexire search system as implemented in this repository: how the UI collects intent, how AI turns that intent into safe Prospeo filters, how the backend executes searches, and how we handle strict Prospeo validation, rate limits, and scalability.

If you are looking for the “JD → FilterModal” pipeline doc, see [AI_SEARCH_PIPELINE.md](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/docs/Documentation-of-Dev/AI_SEARCH_PIPELINE.md).

---

## Goals

- Convert messy, conversational hiring intent into **valid** Prospeo filters.
- **Maximize candidate recall** by applying "Recruiter Intuition": dropping arbitrary experience caps and broadening search radii.
- Prevent “INVALID_FILTERS” by ensuring strict fields (especially locations) are **Prospeo-validated**.
- Keep the system **fast** and **scalable** by limiting external calls, caching, and using deterministic mapping rules where possible.
- Provide a UX where the user can iterate (chat) and still **inspect and edit** the final filters.

---

## Non-Goals

- “Perfect semantic matching” of every job role across the world.
- Predicting Prospeo’s hidden internal ontology. We rely on Prospeo Suggestions for strict fields.

---

## Key Concepts

### 1) Two AI entry points

Nexire has two ways to reach a Prospeo-ready filter JSON:

1. **Conversational search (chat)**
   - User chats → accumulated context grows → once sufficient, we resolve into Prospeo filters.
2. **Text/JD extraction (one-shot)**
   - User pastes a text block/JD → extraction + resolution pipeline generates filters.

Both converge into the same “validated Prospeo filter JSON” idea, and both ultimately execute via `POST /api/search`.

### 2) “Prospeo-validated” strings

Prospeo rejects some fields unless they come from their **Search Suggestions API**.

- Strict field: `person_location_search.include[]`
- Strict field: (often) job titles when using `match_only_exact_job_titles` and/or certain matching modes

Therefore, Nexire treats:

- **Locations**: Nexire acts as a **Radius Simulator**. If the user says "Kolkata", we automatically resolve 4-8 neighboring hubs to simulate a 50km radius.
- **Job titles**: Expanded via a **Dual-Strategy** model (Boolean for niche, Suggestion-fan-out for generic) to ensure we don't return noisy LinkedIn titles.

### 3) Three-path resolution model

We intentionally split resolution into 3 paths:

- **Path A — Prospeo Suggestions API**
  - For fields where Prospeo is strict or dynamic: job titles, locations.
- **Path B — Vector DB (Supabase pgvector)**
  - For large enum-like catalogs: technologies, industries, departments.
- **Path C — Direct LLM mapping (small whitelists)**
  - For small, safe enums: seniority, headcount ranges, funding stage, company type.

### 4) Search Intent Modes (The 2x2 Precision Grid)

Nexire does not guess if a user wants "exact" or "broad" results. Instead, it presents a mandatory **Search Intent Selector** as the final step in the chat. This determines the search strategy and credit cost:

- **🎯 Sniper**: Exact titles (Boolean) + Exact city. (1 credit)
- **🔄 Title Flex**: Related titles (Include) + Exact city. (1 credit)
- **📍 Location Flex**: Exact titles (Boolean) + Nearby cities. (1 credit)
- **🌐 Wide Net**: Related titles + Expanded locations via a **Waterfall Engine**. (1-3 credits)

---

## High-Level Architecture

### Conversational search (chat)

```text
User → Search UI (chat)
     → POST /api/ai/chat
         → returns JSON: { ai_message, updated_context, suggested_questions, ready_for_search }
     → UI updates accumulatedContext (including search_mode)
     → when ready:
         → POST /api/ai/context-to-filters  (background)
             → returns { filters, searchMode, primaryJobTitles, adjacentJobTitles, exactCityLocations, expandedLocations }
         → UI stores _resolvedFilters + _resolution
         → POST /api/search (background estimate via Waterfall Engine)
         → user clicks “Run Search”
         → POST /api/search (real execution)
```

### One-shot extraction (text/JD)

```text
User → “Paste JD / Query”
     → POST /api/ai/extract-and-resolve
         → returns { filters, resolvedMappings, warnings }
     → UI renders FilterModal / FilterPanel
     → POST /api/search
```

---

## Frontend: UX + State Model

### Store

State is managed via Zustand in [search-store.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/store/search-store.ts).

Key fields:

- `messages[]`: chat history
- `accumulatedContext`: structured context collected over chat (titles, locations, tech, etc.)
- `_resolvedFilters`: Prospeo-ready filter JSON (stored inside `accumulatedContext`)
- `_resolution`: transparency payload (suggestions used, resolved tech/industry matches)
- `status`: state machine (`COLLECTING` → `CONFIRMING` → `SEARCHING`)

### Chat UI

- [SearchTerminal.tsx](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/components/search/chat/SearchTerminal.tsx)
  - sends messages to `POST /api/ai/chat`
  - once `ready_for_search=true`, it triggers `POST /api/ai/context-to-filters` in the background
  - then triggers `POST /api/search` in the background to estimate candidate count

### Confirmation UI

- [FilterSummaryCard.tsx](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/components/search/chat/FilterSummaryCard.tsx)
  - renders what will be sent to Prospeo (titles, locations, tech, etc.)
  - renders “Calculating…” while waiting on background estimate
  - offers “Edit Filters” + “Run Search”

### Filter editing

- [FilterModal.tsx](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/components/search/FilterModal.tsx)
  - provides manual control of Prospeo filter fields

---

## Backend: Endpoints

### 1) `POST /api/ai/chat`

File: [app/api/ai/chat/route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/ai/chat/route.ts)

Purpose:

- Drives the conversational UX.
- Asks one question at a time.
- Produces `updated_context` and chip suggestions.

Important behavior:

- Includes retry/backoff for Gemini overload (503/429).
- “Ready state” is conservative for technical roles: for technical roles, it should not mark ready without a tech stack.

Response contract (conceptual):

```json
{
  "ready_for_search": true,
  "ai_message": "...",
  "updated_context": {
    "job_titles": [],
    "locations": [],
    "technologies": [],
    "experience_years": "0-5 years",
    "seniority": [],
    "industry": [],
    "company_type": [],
    "other_keywords": []
  },
  "suggested_questions": [
    { "field": "technologies", "label": "Tech Stack?", "options": ["Django","FastAPI","Flask","AWS"] }
  ]
}
```

### 2) `POST /api/ai/context-to-filters`

File: [app/api/ai/context-to-filters/route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/ai/context-to-filters/route.ts)

Purpose:

- Converts accumulated chat context into **exact Prospeo-ready filters**.

Pipeline:

1. **Extraction (Gemini)**
   - Creates a structured JSON payload containing:
     - `raw_job_titles[]` + `similar_job_titles[]`
     - `raw_location` + `similar_locations[]`
     - `raw_tech[]`, `raw_industry[]`, etc.
   - Path C enums are mapped directly in this step.
2. **Resolution**
   - Job titles → Prospeo Suggestions (`job_title_search`) for seed titles.
   - Locations → Prospeo Suggestions (`location_search`) for each provided user location.
   - Broad location optimization:
     - If the location is broad (“India”, “Pan India”), we only fetch the validated “India”.
3. **Ranking (quality control)**
   - Suggestions are re-ranked to avoid irrelevant expansions.
   - We rank by token overlap and ignore generic words (e.g. “engineer”, “manager”).
4. **Assembly**
   - Final Prospeo filters are produced by [filter-assembler.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/filter-assembler.ts).

Key output:

- `filters`: the actual Prospeo filter JSON
- `resolution`: transparency data for UI chips
- `warnings`: unresolved mappings

### 3) `POST /api/ai/extract-and-resolve`

File: [app/api/ai/extract-and-resolve/route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/ai/extract-and-resolve/route.ts)

Purpose:

- One-shot extraction pipeline for JD/text.

Pipeline:

1. LLM extraction (or mapping from `accumulatedContext`)
2. Suggestions resolution for titles + locations (with broad location optimization)
3. Vector resolution for large enum sets
4. Assemble Prospeo filters

### 4) `GET /api/suggestions`

File: [app/api/suggestions/route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/suggestions/route.ts)

Purpose:

- Secure proxy for Prospeo suggestions (keeps `X-KEY` off the client).
- Redis-cached for 1h.
- Used by AI routes to fetch suggestion lists.

### 5) `POST /api/search`

File: [app/api/search/route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/search/route.ts)

Purpose:

- The master search orchestrator.
- **Executes the Waterfall Engine** for intelligent result merging.
- Caches results, applies scoring, persists results.

Key components:

- **Waterfall Engine** ([lib/waterfall-engine.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/waterfall-engine.ts)):
  - **Sniper/Flex modes**: Runs a single Prospeo call (1 credit).
  - **Wide Net mode**: Runs a 3-pass sequential waterfall:
    - Pass 1: Exact titles + Exact city.
    - Pass 2: Similar titles + Exact city (only if Pass 1 < 20 results).
    - Pass 3: Exact titles + Nearby cities (only if Pass 1+2 < 20 results).
  - **Deduplication**: Ensures the same candidate doesn't appear twice across passes.
  - **Tiers**: Returns results tagged with `_tier` (`EXACT_MATCH`, `SIMILAR_ROLE`, `NEARBY`).

Key stages in the route:

1. Auth + org lookup
2. Build Prospeo filters + Identify Waterfall parameters (`primary_job_titles`, `adjacent_job_titles`, etc.)
3. Execute `executeWaterfall()`
4. Handle Waterfall results (merged candidates, total count, credits used)
5. AI scoring (Nexire ranking)
6. Persistence (candidates + search record)

### 6) `Industry Expander`

File: [lib/industry-expander.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/industry-expander.ts)

Nexire maps common shorthand industries to **valid Prospeo enum strings**. This is critical because Prospeo returns zero results (or errors) if an industry string like "Computer Software" is used (which is not a valid Prospeo enum).

- **Mapping Logic**: "Software" → "Software Development", "IT Services", "Information Technology", etc.
- **Coverage**: Includes Logistics, Fintech, Healthcare, Finance, and more.
- **Usage**: Automatically called inside `POST /api/ai/extract-and-resolve`.

---

## Filter Assembly Rules (Safety)

Implemented in [filter-assembler.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/filter-assembler.ts).

### Location safety

Prospeo is strict: if you send `"Delhi NCR"` but Prospeo suggestions don’t return that exact string, Prospeo returns `INVALID_FILTERS`.

Current rule:

- `person_location_search.include` is filled **only** from `resolvedLocations` (Prospeo suggestions output).
- We do not inject raw locations into `person_location_search`.
- Broad locations use a validated “India” suggestion.

### Job title expansion

Current rule:

- Combine suggestion titles with extracted titles.
- Keep the list bounded.
- Use re-ranking to keep expansions relevant.

---

## Error Handling + Observability

### Prospeo API errors

Prospeo calls are centralized in [client.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/prospeo/client.ts).

Why:

- we can implement consistent timeouts
- we can normalize error codes
- we can avoid “429 → 503” masking

Important mappings:

- HTTP 429 → `{ error: true, error_code: "RATE_LIMITED" }`
- HTTP 400 with `NO_RESULTS` → returned and handled by `/api/search` as `{ total: 0 }`
- HTTP 400 with `INVALID_FILTERS` → should not happen if location safety rules are respected

### Gemini errors

- `/api/ai/chat` retries 503/429 with exponential backoff.

---

## Scalability Design Notes

### External calls are the bottleneck

We keep Prospeo calls small and bounded:

- Titles: max 3 seed queries
- Locations: max 3 seed queries (per user-provided locations)
- Broad “India”: 1 query to validate “India”

### Cache aggressively

- Suggestions: cached 1h (`/api/suggestions`)
- Search results: cached by Prospeo filters + page (`/api/search`)

### Prefer deterministic mapping where safe

- Small enums: Path C via whitelist
- Large catalogs: vector match
- Strict/dynamic: suggestions API

---

## Common UX Issues + Recommended Behavior

### “Search Profile Ready” shows too early

If the role is technical, do not mark ready until there is a tech stack (otherwise the search is broad and results are noisy).

### Broad country searches

If the user says “India” / “Pan India”:

- keep location as “India”
- do not show random city chips

### Multiple locations

If the user supplies multiple locations, resolve suggestions for each location and include only Prospeo-validated strings.

### Nearby-location expansion (Automatic 50km Radius)

Prospeo does not provide a radius-based location filter for `person_location_search`. Nexire solves this by being a **Simulation Engine**:

1. The LLM identifies the target city.
2. The LLM generates 4-8 satellite towns, neighboring municipalities, and districts (e.g., San Francisco → San Jose, Oakland, San Francisco Bay Area).
3. The resolution pipeline fans out these seeds to the Prospeo Suggestions API, which has global data.
4. We increased the pipeline capacity from 5 to 15 to ensure all validated satellite town IDs reach the final query.

This behavior is **universal** and applies to both Chat and JD extraction, for locations anywhere in the world.

### Avoid inferred restrictions

Do not apply restrictive filters like `person_seniority` and `person_department` unless the user explicitly provides them.

- `person_seniority` should be included only when the user selects it or states it.
- `person_department` should not be inferred from job titles; only apply when the user explicitly specifies departments.

### Experience parsing (Recruiter Intuition)

When the user states “2-4 years”, treating it as a strict 4-year cap often breaks the search. Nexire applies **Recruiter Intuition**:

- `person_year_of_experience.min = 2`
- `person_year_of_experience.max = null` (unless strictly forbidden by "no more than").

This aligns with how real recruiters search, keeping the funnel open for slightly more experienced but still relevant candidates.

### Explicit Search Intent vs. Automated Dilution

Previously, the system blindly merged related titles and locations, which diluted the first page with low-relevance results (e.g. searching for a "Backend Developer in Vadodara" would fill the page with generic "Software Developers" from all over Gujarat).

**The Solution:**
- **Mode-Driven Filtering**: Sniper mode forces `boolean_search` with exact title quotes and disables broad suggestions.
- **Result Tiers**: Every candidate is tagged with a tier (`EXACT_MATCH`, `SIMILAR_ROLE`, `NEARBY`) displayed in the UI to give the recruiter confidence in the result's origin.
- **Credit Transparency**: Recruiters know upfront that a "Wide Net" might cost up to 3 credits, while "Sniper" is always 1.

---

## Files Index

- UI
  - [SearchTerminal.tsx](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/components/search/chat/SearchTerminal.tsx)
  - [FilterSummaryCard.tsx](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/components/search/chat/FilterSummaryCard.tsx)
  - [FilterModal.tsx](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/components/search/FilterModal.tsx)
- AI
  - [chat route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/ai/chat/route.ts)
  - [context-to-filters route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/ai/context-to-filters/route.ts)
  - [extract-and-resolve route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/ai/extract-and-resolve/route.ts)
  - [extractor.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/extractor.ts)
  - [filter-assembler.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/filter-assembler.ts)
- Prospeo
  - [client.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/prospeo/client.ts)
  - [types.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/prospeo/types.ts)
- Search execution
  - [search route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/search/route.ts)
