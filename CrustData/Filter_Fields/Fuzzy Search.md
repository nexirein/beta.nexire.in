# Fuzzy Search in CrustData PersonDB

CrustData's PersonDB (`/screener/persondb/search`) supports a special regex-like fuzzy match operator `"(.)"` for text fields.

---

## The `(.)` Operator

The `(.)` type means **case-insensitive substring/regex match** — similar to `ILIKE '%value%'` in SQL.

```json
{
  "column": "current_employers.title",
  "type": "(.)",
  "value": "Fleet Manager"
}
```
This matches any profile where the title CONTAINS "Fleet Manager" (case-insensitive).

---

## When to Use Fuzzy vs Exact

| Scenario | Use `"(.)"` | Use `"in"` |
|---|---|---|
| Job titles | YES — titles vary: "Sr Fleet Manager", "Head of Fleet Management" | NO |
| Regions | NO | YES — exact region names required |
| Industries | YES — stored as compound strings | NO |
| Company names | YES — "Tata" matches "Tata Consultancy Services" | NO |
| Skills | YES | NO |
| Enum fields (seniority, headcount) | NO | YES — exact value required |

---

## Industry Fuzzy Matching — Critical

CrustData stores industries as **compound strings** in `current_employers.company_industries[]`:

```
"Transportation, Logistics, Supply Chain and Storage"
"Technology, Information and Internet"
"IT Services and IT Consulting"
```

**Wrong**: `{ "type": "in", "value": "Logistics" }` → 0 results (no exact match)
**Right**: `{ "type": "(.)", "value": "Logistics" }` → matches the compound string

### Industry OR Pattern (Best Practice)
```json
{
  "op": "or",
  "conditions": [
    { "column": "current_employers.company_industries", "type": "(.)", "value": "Logistics" },
    { "column": "current_employers.company_industries", "type": "(.)", "value": "Supply Chain" },
    { "column": "current_employers.company_industries", "type": "(.)", "value": "Warehousing" }
  ]
}
```

This mirrors Google boolean search: `"logistics" OR "supply chain" OR "warehousing"`

---

## Location Fuzzy Matching — Critical for Indian Cities

Indian LinkedIn profiles store location in inconsistent formats:
- "Ghaziabad, Uttar Pradesh, India"
- "Ghaziabad"
- "Delhi NCR"
- "National Capital Region"

**Strategy**: Use text fuzzy matching FIRST, then `geo_distance` as supplement.

```json
{
  "op": "or",
  "conditions": [
    { "column": "region", "type": "(.)", "value": "Ghaziabad" },
    { "column": "region_address_components", "type": "(.)", "value": "Ghaziabad" },
    { "column": "region", "type": "geo_distance", "value": { "location": "Ghaziabad", "distance": 30, "unit": "mi" } }
  ]
}
```

---

## Title Fuzzy Matching with `fuzzy_match`

For the People Search API (separate from PersonDB), there's a `fuzzy_match` attribute on `CURRENT_TITLE`:

```json
{
  "filter_type": "CURRENT_TITLE",
  "type": "in",
  "value": ["Fleet Manager"],
  "fuzzy_match": true
}
```

This returns profiles with similar titles automatically (no need to enumerate synonyms manually).

**In PersonDB** (which Nexire uses), use `(.)` operator instead.

---

## Google Boolean Search Equivalent

Google: `site:linkedin.com/in "fleet manager" "ghaziabad"`

CrustData equivalent:
```json
{
  "op": "and",
  "conditions": [
    {
      "op": "or",
      "conditions": [
        { "column": "current_employers.title", "type": "(.)", "value": "Fleet Manager" },
        { "column": "current_employers.title", "type": "(.)", "value": "Fleet Operations Manager" }
      ]
    },
    {
      "op": "or",
      "conditions": [
        { "column": "region", "type": "(.)", "value": "Ghaziabad" },
        { "column": "region_address_components", "type": "(.)", "value": "Ghaziabad" }
      ]
    }
  ]
}
```
