# Nexire Search Architecture

This document describes the complete lifecycle of a candidate search on the platform, providing a technical reference for debugging, modifications, and scaling pagination.

## 1. Triggering a Search

### 1.1 Fresh Search (`POST /api/search`)
When a user initiates a search (via chat extraction or manual filter edits), the frontend (`SearchClient.tsx`) sends a `POST` request to `/api/search` with the current filters.

- **Payload Extraction:** The backend absorbs the `crustdata_filters`, `required_skills`, `search_industries`, and `domain_cluster`.
- **CrustData Fetch:** It uses the `searchWaterfall` engine (`lib/waterfall-engine.ts`) to query CrustData. The waterfall progressively relaxes location constraints (Exact -> Relaxed -> Nearby -> Minimal) to guarantee results, ultimately returning up to 100 candidates along with a `next_cursor` point.

### 1.2 Global AI Scoring
To ensure that the absolute best candidates (within the retrieved 100 chunk) appear on Page 1, the backend performs **Global AI Scoring** before any pagination occurs.
1. It validates the candidates against the `people` database cache to reuse any recent scores for identical skills.
2. It sends the unchecked candidates in batches to OpenAI via `calculateScoresInBatches` to judge how well their resume/data aligns with the `required_skills` and requirements.
3. Once all 100 profiles possess an `ai_score` (0-100), the array is sorted globally by `ai_score` descending.

### 1.3 Database Storage & Relational Alignment
- **Global `people` cache:** The newly scored 100 profiles are `upserted` into the `people` schema.
- **Relational Search Items:** Because searches are persistent and potentially large, the backend uses a dedicated junction table: `search_result_items`.
  - *Internal Mapping:* Each candidate is inserted into `search_result_items` with a unique `search_id`, `person_id`, and a Sequential `rank` (0, 1, 2...).
  - *Scalability:* This allows the database to handle ordering and slicing via indexes rather than loading large arrays into memory.

The `POST /api/search` endpoint concludes by returning the first 15 candidates, the overall `total` matches, and the CrustData `next_cursor`.

---

## 2. Navigating Pages (`GET /api/searches/[id]/results?page=N`)

Pagination is orchestrated by `SearchClient.tsx` and executed on the backend using high-performance SQL JOINs.

### 2.1 Fetching from the Database Cache via JOINs (`page <= totalPages`)
If the user navigates within the bounds of already scored profiles:
1. `SearchClient.tsx` executes a `GET` call to `/api/searches/[id]/results?page=N`.
2. The Backend performs a **JOIN query** between `search_result_items` and `people`.
3. It uses SQL `LIMIT 15 OFFSET (page-1)*15` to fetch exactly the required slice.
4. This approach is highly scalable, as it leverages PostgreSQL indexes on `(search_id, rank)`.
5. Profile data is reconstructed from the joined `people` record, ensuring the UI remains fast even with thousands of results.

### 2.2 Reaching The Limit (`page > totalPages`)
If the user demands a page beyond our `person_ids` depth, this indicates we must dig further into CrustData pipeline.
1. `SearchClient.tsx` observes that `newPage` surpasses our stored Database `total_pages` (provided by `resultsMeta.totalPages`).
2. Assuming a CrustData `nextCursor` exists securely in the Zustand cache, `SearchClient.tsx` forces a new recursive `POST /api/search` with the identical filters but attaching `cursor: nextCursor` explicitly.
3. This fires the sequence documented natively in **Section 1**:
   - The backend acquires the *Next* 100 candidates from CrustData.
   - It performs Global AI Scoring against the next 100 identically.
   - These 100 IDs are purely appended downstream to the `search_results`.
   - The UI advances visually and smoothly.

---

## 3. UI Pagination Structure

The `SearchResults.tsx` file handles all native presentation logic for searching. Following standard SaaS practices:
- It maintains its own local flexed scrollbox mapping candidate rows vertically.
- At the extreme bottom of candidate mapping list (within the scrolling container layout to ensure it does not permanently dominate bottom-screen real estate), it reveals the Pagination Navigator.
- The Pagination module is a functional numerical slider (e.g. `Prev 1 2 3 ... 7 Next`) capable of intelligently hiding expansive numbers dynamically using the `getVisiblePages` utility handler.
