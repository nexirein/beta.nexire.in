# CrustData Implementation Documentation

## Overview
Nexire's candidate search is powered by the **CrustData PersonDB API**. This implementation uses a multi-path resolution strategy to transform natural language hiring requirements into precise, validated search filters.

---

## Core Architecture

### 1. Filter Resolution Pipeline (`/api/ai/context-to-filters`)
The pipeline processes conversational context through three parallel paths:
- **Path A: Autocomplete Resolution**: Resolves job titles and regions via real-time LinkedIn-native data.
- **Path B: Industry Mapping**: Resolves raw industries into CrustData's specific taxonomy using vector search.
- **Path C: Direct Mapping**: Maps seniority, headcount, and company type via predefined whitelists.

### 2. Search Intent Modes
Instead of automated dilution, Nexire uses a mandatory **Search Intent Selector** to determine title expansion:
- **🎯 Exact Title (Tight)**: Max 3 titles.
- **🔄 Similar Titles (Balanced)**: Max 5 titles.
- **🌐 Cast a Wide Net (Wide)**: Max 8 titles.

### 3. Location Geo Logic (Radius Simulator)
CrustData lacks a native radius filter for text fields, so Nexire acts as a **Radius Simulator**:
- **Geocoding**: Resolves user input into canonical region strings.
- **Dual Match**: Combines `geo_distance` (30mi default) with a clean city fuzzy text match (`(.)`).
- **Administrative Stripping**: Strips "Taluka", "District", etc. from city names to maximize recall on profiles with varied text formats.

### 4. Recruiter Intuition & Experience
- **Verbatim Experience**: The system uses the user's requested experience floor exactly as stated (e.g., "3+ years" -> `experience_min: 3`). No hidden buffers.
- **No Caps**: Does not apply an experience maximum unless explicitly requested ("no more than").

---

## UI/UX Design Principles

### 1. Client-Side Ranking (Match % Badges)
Every candidate is scored in the UI after being returned from the API using `lib/ai/scorer.ts`.
- Scores (1-99) are displayed as **Match %** badges (**Excellent**, **Strong**, **Good**, **Potential**).
- Ranking is based on: Title (30%), Skills (25%), Domain (20%), Location (15%), Experience (10%).

### 2. Professionalism & Privacy
- **Brand Neutrality**: Removed all user-facing references to "LinkedIn" to mitigate legal risk. Use "Professional Profile", "Stated Title", and "Professional Network" instead.
- **Progressive Disclosure**: Widgets appear sequentially (Intent Mode first, then missing fields) to avoid overwhelming the user.
- **Clean UI**: Minimalist, professional interface (avoiding heavy black themes) following YC-backed startup aesthetics.

---

## Key Files
- `app/api/ai/context-to-filters/route.ts`: Main resolution logic.
- `lib/ai/filter-assembler.ts`: Converts resolved values into a flat filter state.
- `lib/crustdata/filter-builder.ts`: Constructs the final CrustData filter tree JSON.
- `lib/ai/scorer.ts`: Deterministic candidate ranking logic.
