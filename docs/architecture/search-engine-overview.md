# Nexire AI Search Architecture

Nexire AI uses a sophisticated multi-stage pipeline to transform natural language recruitment requirements into high-precision candidate search filters for the **CrustData PersonDB**.

## 1. Requirement Extraction & Transformation Pipeline

The core engine follows a deterministic, intent-driven strategy to ensure high recall without sacrificing precision.

### Phase 1: AI Chat & Context Accumulation
- **Nexire Bot**: A consultative AI persona that extracts job titles, locations, skills, and seniority from chat.
- **Context Accumulation**: Maintains a persistent state of the "ideal candidate profile" across the conversation.
- **Progressive Widget System**: Mandatory **Search Intent Selector** (Tight, Balanced, Wide) determines the title expansion strategy.

### Phase 2: Filter Resolution (3-Tier Strategy)
To ensure values match the CrustData/LinkedIn taxonomy exactly, extracted terms are routed through three paths:

1.  **Path A (Autocomplete API)**: Job Titles and Regions call the CrustData Realtime Autocomplete API to fetch canonical strings (e.g., "Vadodara" → "Vadodara Taluka, Gujarat, India").
2.  **Path B (Vector Search)**: Industries and Technologies are resolved via semantic search in Supabase `pgvector`.
3.  **Path C (Direct Mapping)**: Seniority, Headcount, and Company Type are mapped using predefined whitelists.

### Phase 3: The Intent-Controlled Search Engine
Instead of an automated waterfall, Nexire puts the recruiter in control:
- **Tight (Sniper)**: 3 titles max. Exact match primary title.
- **Balanced**: 5 titles max. Includes synonyms.
- **Wide**: 8 titles max. Casts a broad net across adjacent roles.
- **Radius Simulator**: Always applies a 30-mile `geo_distance` radius search + clean city fuzzy text match for maximum location recall.

---

## 2. Client-Side Ranking & Scoring

Nexire does not rely on a black-box API score. After CrustData returns profiles, they are ranked client-side using a **deterministic scoring engine** (`lib/ai/scorer.ts`):
- **Title (30 pts)**: Exact > Partial > Adjacent match.
- **Skills (25 pts)**: Profile-level skills vs. requirements.
- **Domain (20 pts)**: Industry match / penalty for cross-domain.
- **Location (15 pts)**: Proximity to target city.
- **Experience (10 pts)**: Proximity to requested years floor.

Candidates are labeled: **Excellent**, **Strong**, **Good**, or **Potential**.

---

## 3. UI/UX Design Principles

-   **Professional Profile View**: Minimalist, typography-led interface avoiding brand specificities (Profile vs. LinkedIn).
-   **Match % Badges**: Visual indicators of candidate relevance based on the scoring engine.
-   **SearchTerminal**: HR-grade iterative chat for professional refinement.
-   **FilterSummaryCard**: Displays canonical filter state with short labels and detailed tooltips.
