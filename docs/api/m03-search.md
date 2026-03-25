# M03 — Search API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M03 build

---

## Routes

### POST /api/search
Run a candidate search via Prospeo. Cached in Redis for 24h.

**Request**
```json
{
  "project_id": "uuid",
  "filters": {
    "person_job_title": "string?",
    "person_seniority": "string[]?",
    "person_departments": "string[]?",
    "person_location": "string?",
    "person_year_of_experience": { "min": 0, "max": 20 },
    "company_industry": "string?",
    "company_headcount_range": "string?",
    "company_names": "string[]?",
    "company_websites": "string[]?"
  },
  "criteria": {
    "min_score": 50,
    "custom_notes": "string?"
  },
  "page": 1
}
```

**Response**
```json
{
  "data": {
    "candidates": Candidate[],
    "total": 0,
    "page": 1,
    "credits_used": 1,
    "cached": false
  }
}
```

**Redis cache key**: `search:{org_id}:{hash(filters)}:{page}`
**Cache TTL**: 24 hours

---

### GET /api/search/history
List recent searches for the org.

---

## Credit Usage
- 1 credit per page (25 results) if results found
- Re-running same search uses cache — no credit charge
