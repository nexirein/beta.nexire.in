# CrustData Filter Architecture & Best Practices

## The Problem: The "Over-Constrained Search" Trap
When Nexire's AI attempts to convert hiring intent into a CrustData JSON payload, it often over-constrains the query, leading to zero results.

**Common failures:**
1. **Conflicting Operators:** Applying both `in` (exact set) and `(.)` (fuzzy contains) to the same title field.
2. **Taxonomy Hallucination:** Passing non-standard industries.
3. **Redundant Constraints:** Enforcing both seniority level AND experience years.

---

## Core Architectural Principles for CrustData

### 1. The "One Strategy Per Field" Rule
Nexire uses a **fuzzy contains OR** strategy for titles. We resolve 3-8 LinkedIn-native titles via autocomplete and combine them into an `OR` block of `(.)` filters.

### 2. Intent-Controlled Title Expansion
The number of titles used is determined by the user's **Search Intent**:
- **🎯 Tight (Sniper)**: 3 titles max.
- **🔄 Balanced**: 5 titles max.
- **🌐 Wide**: 8 titles max.

### 3. India-Optimized Geo Logic (The "Radius Simulator")
CrustData's `geo_distance` works best with canonical region strings.
- **Geocoding**: We resolve "Vadodara" to "Vadodara Taluka, Gujarat, India".
- **Dual Match**:
  - `geo_distance`: Radius search (e.g., 30mi) for coordinate-based hits.
  - `fuzzy text`: Fuzzy `(.)` match on the clean city name ("Vadodara") and the full admin name ("Vadodara Taluka") to catch profiles with varying text formats.

### 4. Recruiter Intuition (The Experience Floor)
We use the user's requested experience verbatim (e.g., "3+ years" -> `experience_min: 3`). We do not apply an experience maximum unless explicitly requested ("no more than 5 years"), as real recruiters prefer keeping the funnel open for slightly more senior candidates.

---

## Implementation Guidelines

### 1. The Filter Assembler (`lib/ai/filter-assembler.ts`)
- **Sanitize**: Strip any industries or seniority levels not present in the standardized taxonomy.
- **Flatten**: Keep the JSON tree as flat as possible (usually a single `AND` containing several `OR` sub-blocks).

### 2. The Filter Builder (`lib/crustdata/filter-builder.ts`)
- **Fuzzy Titles**: Always use `(.)` with `OR` for titles to catch "Backend Developer" vs "Backend Engineer".
- **Location Guard**: When searching in India, pin `location_country IN ["India"]` to prevent noise from international cities with similar names.

### 3. Client-Side Ranking (The Scoring Layer)
Because CrustData's internal scoring is a black box, Nexire applies a **deterministic client-side ranking engine** (`lib/ai/scorer.ts`) on the results returned. 
- Score is calculated from 1-99 based on Title, Skills, Domain, Location, and Experience proximity.
- Results are tagged: **Excellent**, **Strong**, **Good**, or **Potential**.
