# Set 1 — Autocomplete API Fields

These filter fields have **open-ended, dynamic values** that cannot be hardcoded or embedded.
For each user query involving these fields, Nexire **must call the CrustData Filters Autocomplete API** to resolve valid canonical values.

Calling autocomplete before sending to PersonDB avoids hallucinated or misspelled values that return 0 results.

---

## Fields in Set 1

| Filter Field | PersonDB Column | Autocomplete `filter_type` | Why Autocomplete? |
|---|---|---|---|
| `CURRENT_TITLE` | `current_employers.title` | `"title"` | Millions of unique job titles on LinkedIn. LLM generates plausible-but-wrong titles. |
| `PAST_TITLE` | `past_employers.title` | `"title"` | Same as above. |
| `REGION` | `region` | `"region"` | Indian cities have inconsistent naming: "Ghaziabad", "Ghaziabad, Uttar Pradesh, India", etc. |
| `CURRENT_COMPANY` | `current_employers.name` | PersonDB field autocomplete on `current_employers.name` | Company names have typos, subsidiaries, official vs common names. |
| `COMPANY_HEADQUARTERS` | `current_employers.company_hq_location` | `"region"` | Same as REGION. |
| `SCHOOL` | `education_background.institute_name` | PersonDB field autocomplete on `education_background.institute_name` | University names have multiple spellings. |

---

## How Autocomplete Works in Nexire

```
LLM chat extracts: { job_titles: ["Fleet Manager"] }
                         ↓
context-to-filters calls:
  crustdataRealtimeAutocomplete("title", "Fleet Manager", 10)
  → ["Fleet Manager", "Fleet Operations Manager", "Vehicle Fleet Manager", ...]
                         ↓
filter-builder.ts uses these EXACT strings in:
  { column: "current_employers.title", type: "(.)", value: "Fleet Manager" }
```

## API Reference

```
GET /screener/linkedin_filter/autocomplete
  ?filter_type=title&query=Fleet+Manager&count=10
Authorization: Token <CRUSTDATA_API_KEY>
```

Response:
```json
{ "results": ["Fleet Manager", "Fleet Operations Manager", "Vehicle Fleet Manager"] }
```

---

## Batching Rules
- Max 3 concurrent autocomplete calls (avoid rate limiting)
- 100ms delay between batches
- Cache results in Redis for 3 days (titles) / 7 days (regions)
- Seeds: use PRIMARY title from LLM + up to 3 similar_job_titles

---

## NOT in Set 1
Do NOT call autocomplete for enum fields — they have a fixed value list. See `Set2.md`.
