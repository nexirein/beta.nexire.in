# Nexire Search System (End-to-End)

This document describes the current Nexire search system as implemented in this repository: how the UI collects intent, how AI turns that intent into safe CrustData filters, how the backend executes searches, and how we handle ranking and scalability.

---

## Goals

- Convert messy, conversational hiring intent into **valid** CrustData filters.
- **Maximize candidate recall** by applying "Recruiter Intuition": dropping arbitrary experience caps and broadening search radii.
- Prevent zero-result searches by ensuring strict fields (especially locations) are **autocomplete-validated**.
- Keep the system **fast** and **scalable** by limiting external calls, caching, and using deterministic mapping rules where possible.
- Provide a UX where the user can iterate (chat) and still **inspect and edit** the final filters.

---

## Key Concepts

### 1) CrustData Native Search
Nexire has transitioned fully to the **CrustData PersonDB API**. This allows for more granular filtering, better support for Indian geos, and deterministic boolean logic.

### 2) "Profile-Validated" Strings
CrustData works best with strings from their **LinkedIn Filter Autocomplete API**. 

- **Locations**: Nexire acts as a **Radius Simulator**. We resolve user input (e.g., "Vadodara") into canonical strings (e.g., "Vadodara Taluka, Gujarat, India") and apply a `geo_distance` filter + fuzzy text match.
- **Job titles**: Expanded based on intent mode (Tight, Balanced, Wide) to include LinkedIn-native synonyms while pinning the user's original request at the top.

### 3) Three-Path Resolution Model
We split resolution into 3 paths:
- **Path A — CrustData Autocomplete API**: For job titles and locations.
- **Path B — Vector DB (Supabase pgvector)**: For industries and technologies.
- **Path C — Direct Mapping**: For seniority, headcount, and company type.

### 4) Search Intent Modes (The Expansion Grid)
Nexire presents a mandatory **Search Intent Selector** (choice widget) as the final step in the chat. This determines the title expansion strategy:
- **🎯 Exact title only**: Only profiles whose stated title is exactly this role. (Max 3 titles)
- **🔄 Similar titles too**: This title + 3–4 closest synonyms professionals use. (Max 5 titles)
- **🌐 Cast a wide net**: Full cluster of adjacent roles — best when talent pool is small. (Max 8 titles)

---

## High-Level Architecture

### Conversational Search (Chat)
```text
User → Search UI (chat)
     → POST /api/ai/chat
         → returns JSON: { ai_message, updated_context, suggested_questions, ready_for_search }
     → UI updates accumulatedContext
     → when ready:
         → POST /api/ai/context-to-filters
             → returns { filters, filterTree, primaryJobTitles, adjacentJobTitles, exactCityLocations }
         → UI stores _resolvedFilters + _resolution
         → POST /api/search (real execution)
```

---

## Frontend: UX + State Model

### Store
State is managed via Zustand in `lib/store/search-store.ts`.
- `accumulatedContext`: structured context collected over chat (titles, locations, tech, etc.)
- `_resolvedFilters`: CrustData-ready filter JSON.
- `_resolution`: transparency payload (suggestions used, intent config).

### Chat UI
- **SearchTerminal.tsx**: Sends messages to `POST /api/ai/chat`.
- **WidgetRenderer.tsx**: Renders progressive widgets (Intent Mode first, then missing fields).

### Confirmation UI
- **FilterSummaryCard.tsx**: 
  - Renders resolved titles, locations (short labels with full tooltips), and tech.
  - Displays "Match %" badges for candidates based on client-side ranking.

---

## Backend: Endpoints

### 1) `POST /api/ai/chat`
- Drives the conversational UX.
- Asks one question at a time.
- Decides when the user is "ready" to search.

### 2) `POST /api/ai/context-to-filters`
- Converts accumulated context into CrustData-ready filters.
- **Intent-controlled expansion**: Map `tight` -> 3 titles, `balanced` -> 5 titles, `wide` -> 8 titles.
- **Radius Resolution**: Resolves locations to canonical geocodable strings.

### 3) `POST /api/search`
- Executes the final search against CrustData PersonDB.
- **Client-Side Ranking**: Candidates are scored in the UI/Store after return using `lib/ai/scorer.ts`.
- **Deduplication**: Ensures unique profiles across pages.

---

## Filter Assembly & Geo Logic

Implemented in `lib/ai/filter-assembler.ts` and `lib/crustdata/filter-builder.ts`.

### Location Geo Logic (India Optimized)
1. **Canonical Geocoding**: Resolves "Vadodara" to "Vadodara Taluka, Gujarat, India".
2. **Geo Distance**: Always applies `geo_distance` radius search (default 30mi).
3. **Clean City Fuzzy Match**: 
   - Strips admin suffixes ("Taluka", "District").
   - Applies fuzzy `(.)` match on both "Vadodara Taluka" and "Vadodara" to maximize recall.

### Experience (Verbatim)
The system uses the user's experience floor exactly as stated (e.g., "3+ years" -> `experience_min: 3`).

---

## Client-Side Ranking (The Scorer)
Nexire uses a deterministic scoring engine in `lib/ai/scorer.ts` (100 pts total):
- **Title Match**: 30 pts (Exact > Partial > Adjacent).
- **Skills Match**: 25 pts (Profile-level skills).
- **Domain/Industry**: 20 pts (Penalty for cross-domain).
- **Location**: 15 pts (Proximity match).
- **Experience**: 10 pts (Within range).
- **Penalties**: Cross-border (-20 pts).

Candidates are labeled as **Excellent (80+)**, **Strong (65+)**, **Good (50+)**, or **Potential**.
