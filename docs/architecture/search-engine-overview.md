# Nexire AI Search Architecture

Nexire AI uses a sophisticated multi-stage pipeline to transform natural language recruitment requirements into high-precision candidate search filters for the CrustData PersonDB.

## 1. Requirement Extraction & Transformation Pipeline

The core engine follows a "Waterfall" strategy to ensure high recall without sacrificing precision.

### Phase 1: AI Chat & Context Accumulation
- **Nexire Bot**: A consultative AI persona that extracts job titles, locations, skills, and seniority from chat.
- **Context Accumulation**: Maintains a persistent state of the "ideal candidate profile" across the conversation.
- **Widget System**: Proactively suggests title expansions and location clusters.

### Phase 2: Filter Resolution (3-Tier Strategy)
To ensure values match the CrustData/LinkedIn taxonomy exactly, extracted terms are routed through three paths:

1.  **Set 1 (Autocomplete API)**: Job Titles and Regions call the CrustData Realtime Autocomplete API to fetch canonical LinkedIn strings.
2.  **Set 2 (Vector Search)**: Enums like **Industry**, **Seniority**, and **Function** are resolved via semantic search.
    -   **Model**: Gemini Embedding 2 (768-dim via Matryoshka Representation Learning).
    -   **Storage**: Supabase `pgvector` index in `filter_embeddings` table.
3.  **Set 3 (Direct Passthrough)**: Keywords and Boolean flags (e.g., `recently_changed_jobs`) are applied directly.

### Phase 3: The Waterfall Search Engine
If a strict search returns zero results, the engine automatically relaxes constraints in order:
- **Pass 1 (Sniper)**: Exact titles + Exact regions + Industries.
- **Pass 2 (Expansion)**: Adds similar job titles from Autocomplete.
- **Pass 3 (Regional)**: Expands location to a 30-50 mile radius.
- **Pass 4 (Broad)**: Relaxes industry and seniority constraints.

## 2. Data Storage & Persistence

-   **Supabase `people` table**: Stores all fetched profiles. Schema is synced with CrustData PersonDB for zero-loss data storage.
-   **Vector Store**: Stores semantic embeddings for all ~430 LinkedIn industries to enable "Logistics" → "Transportation, Logistics, Supply Chain and Storage" resolution.

## 3. UI/UX Design Principles

-   **Candidate Profile Panel**: A single-page, scrollable UX with sticky navigation and scrollspy.
-   **Logo.dev Integration**: Automated fetching of company logos using domain-based resolution.
-   **Search Terminal**: Professional HR-grade terminal for iterative refinement.
