# CrustData Native Chat Transition

This document outlines the architectural and design changes made during the transition of the Nexire AI Chat experience to be natively powered by CrustData (March 2026).

## 1. AI Persona: Senior Executive Headhunter
The AI's persona was shifted from a "search assistant" to a **consultative Senior Headhunter**.
- **Objective**: Provide a professional, high-signal recruitment experience.
- **Tone**: Sophisticated, consultative, and focused on requirements rather than just "keywords".
- **Impact**: Improved user trust and alignment with HR professional expectations.

## 2. CrustData Native Filter Extraction
The extraction logic was decoupled from Prospeo and aligned with CrustData's specific field structure.
- **Autocomplete Integration**: AI now suggests filters that match CrustData global datasets (titles, regions, industries, skills).
- **Search Strategy**: A persistence-oriented `requirement_summary` field displays the AI's understanding of the search mandate, replacing generic "Searching..." states.
- **Redundant Step Removal**: The "How precise should this search be?" (Wide vs. Sniper) selection was removed. CrustData's filtering is naturally precise, and the waterfall engine handles relaxation intelligently without user intervention.

> [!IMPORTANT]
> **Payload Structure**: All `POST` requests to CrustData (search/autocomplete) MUST wrap the filter tree in a top-level `filters` key. 
> ```json
> {
>   "filters": { "op": "and", "conditions": [...] },
>   "limit": 10
> }
> ```
> This is handled by `crustdataSearchPeople()` and `CrustDataClient.search()`.

## 3. Professional UI/UX (Non-AI-Generated Look)
Based on user feedback, the UI was "de-AI-ified" to look like a professional business tool rather than a generic LLM wrapper.
- **Icon Removal**: Decorative "magic," "sparkle," and "bot" icons were removed from `FilterSummaryCard`, `FilterModal`, and `SearchTerminal`.
- **Emoji Removal**: Casual emojis in quick prompts and AI roles were replaced with professional text/abstract elements (e.g., "AI" text avatar and "N" brand logo).
- **Match Health**: Quantitative match health (e.g., "Strong pool," "Limited") provides clear feedback on search status.

## 4. Enhanced Data Persistence & Schema Mapping
The Supabase schema was updated to correctly persist the richer data structure provided by CrustData.
- **Profile Mapping**: CrustData fields like `flagship_url`, `headline`, `raw_crustdata_json`, and detailed `education` are now correctly mapped to the `people` table.
- **Waterfall Integration**: The search results processor now handles candidate persistence for each tier of the waterfall (Exact -> Expanded -> Relaxed), ensuring no candidate data is lost.

## 5. Technical Stack Changes
- **API Routes**: Updated `/api/searches/[searchId]/results/route.ts` and `/api/search/route.ts` to handle the new CrustData profile shapes.
- **Types**: `CrustDataFilterState` and `PersonProfile` types in `lib/crustdata/types.ts` serve as the source of truth.
- **Store**: `useSearchStore` maintains the `accumulatedContext` with a focus on CrustData filter states.

## 6. How to Test (API Testing)
To test the raw CrustData integration:
1. Use the chat to define a role.
2. Observe the "Search Strategy" being built.
3. Check the `candidates` and `people` tables in Supabase for CrustData-structured JSON.
4. Verify that filters in the `FilterModal` correctly reflect the state extracted from the chat.
