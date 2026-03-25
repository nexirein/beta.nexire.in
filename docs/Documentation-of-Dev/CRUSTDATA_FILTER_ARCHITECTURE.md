# CrustData Filter Architecture & Best Practices

## The Problem: The "Over-Constrained Search" Trap
When Nexire's AI attempts to convert a detailed job description (like "Regional Manager – Operations (Car Carrier Logistics) with 10+ years exp") into a CrustData JSON payload, it often hallucinates or over-constrains the query.

**Example of a failing payload:**
1. **Title Double-Filtering:** Applying an `OR` block of 17 exact titles (`(.)`) **AND** a complex regular expression block (`[.]`) on the same `current_employers.title` field. This creates mathematically impossible intersections (e.g., a candidate has an exact title of "Logistics Manager", but fails the regex requirement to have "Regional" in the title).
2. **Taxonomy Hallucination:** Passing non-standard industries like `"Automobile Logistics"` to `current_employers.company_industries`. CrustData relies on the standardized LinkedIn industry taxonomy. Hallucinated industries cause queries to return zero results.
3. **Redundant Constraints:** Enforcing `years_of_experience_raw >= 10` **AND** `seniority_level IN ["Senior", "Manager", "Head"]`. A highly experienced candidate might have a non-standard seniority title, causing them to be falsely excluded.

---

## Core Architectural Principles for CrustData

To get highly relevant candidates without hitting "0 matches", the architecture must enforce **Safe, Expansive, and Layered** filtering.

### 1. The "One Strategy Per Field" Rule
Never apply conflicting operators to the same column in a single pass.
- **For Job Titles:** Choose **either** a list of Exact Matches `(.)` combined with `OR`, **OR** a broad Regex pattern `[.]`. Never `AND` them together.
- **Recommendation:** Use a smart regex array OR a strictly validated list of titles. 

### 2. Strict Taxonomy Enforcement (The "No Hallucination" Rule)
AI models cannot guess CrustData's internal enums. 
- **Industries:** The AI must map user intent (e.g., "Car Carrier") to a predefined, hardcoded list of **Valid LinkedIn Industries** (e.g., `"Transportation, Logistics, Supply Chain and Storage"`, `"Truck Transportation"`).
- **Regions:** `geo_distance` works best with major metropolitan centers. Ensure the AI resolves "Bangalore Rural" to the primary geocodable hub: `"Bengaluru, Karnataka, India"`.

### 3. The "Recruiter Intuition" Relaxation (Less is More)
Do not use every extracted field in the initial query. 
- If `years_of_experience` is provided, drop `seniority_level`. Let the experience dictate the seniority.
- Use `skills` (if supported by CrustData) as a soft matcher rather than a hard `AND` filter, or rely on title/industry to imply skills.

---

## The "CrustData Waterfall" Strategy

Instead of sending one massive, over-constrained payload, the system must execute searches in a prioritized **Waterfall**. If Pass 1 returns < 10 results, automatically proceed to Pass 2.

### Pass 1: The Precision Strike (High Intent)
- **Title:** Array of specific, high-probability titles using `OR` logic.
- **Location:** `geo_distance` (e.g., 50 miles).
- **Industry:** Strictly mapped standard industries.
- **Experience:** Floor set to User Request minus 2 years (e.g., if 10+, set to 8+).

### Pass 2: The Title Flex (Broaden Role)
- **Title:** Broad regex match (e.g., `(?i).*(operations|logistics).*(manager|head).*`).
- **Location:** `geo_distance` (same).
- **Industry:** Strictly mapped standard industries.
- **Experience:** Same as Pass 1.
*(Removed: The strict exact title list).*

### Pass 3: The Industry/Geo Flex (Broaden Scope)
- **Title:** Broad regex match.
- **Location:** Relax to State/Country level (e.g., "Karnataka, India").
- **Industry:** Removed completely (rely on title).
- **Experience:** Floor dropped significantly.

---

## Implementation Guidelines for the Filter Assembler

1. **Clean the AI Output:** Before building the JSON, run a sanitization function that strips any industry not present in `valid_linkedin_industries.json`.
2. **Flatten the Boolean Logic:** Keep the JSON tree as flat as possible.
   ```json
   {
     "filters": {
       "op": "and",
       "conditions": [
         {
           "column": "current_employers.title",
           "type": "in",
           "value": ["Regional Operations Manager", "Logistics Manager"]
         },
         {
           "column": "region",
           "type": "geo_distance",
           "value": { "location": "Bengaluru, Karnataka, India", "distance": 50, "unit": "mi" }
         }
       ]
     }
   }
   ```
3. **Stop Regex Abuse:** If using regex for titles, use a single `[.]` condition with a combined pattern, rather than multiple nested `AND` regexes which break easily.
