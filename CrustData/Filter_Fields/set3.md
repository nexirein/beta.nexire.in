# Set 3 — Direct LLM Passthrough Fields

These filter fields accept **free-text values directly from the LLM** with no autocomplete or embedding lookup.
The LLM-generated value is used as-is (or with minor normalization).

---

## Fields in Set 3

| Filter Field | PersonDB Column | Filter Type | Notes |
|---|---|---|---|
| `KEYWORD` | Full-text search | `"(.)"` | LLM-generated keywords. Max 1 per filter. |
| `FIRST_NAME` | `name` (prefix) | `"in"` | Direct string. |
| `LAST_NAME` | `name` (suffix) | `"in"` | Direct string. |
| `RECENTLY_CHANGED_JOBS` | `recently_changed_jobs` | Boolean (no value) | Apply if user says "recently switched", "open to new opportunities", "new joiner" |
| `POSTED_ON_LINKEDIN` | (activity flag) | Boolean (no value) | Apply if user says "active on LinkedIn", "recently posted" |
| `IN_THE_NEWS` | (news flag) | Boolean (no value) | Apply if user says "in the news", "media coverage" |
| `PAST_COMPANY` | `past_employers.name` | `"in"` (fuzzy) | Company name passed directly. Use domain if available for accuracy. |

---

## Rules for Set 3

1. **Keywords**: Extract from `other_keywords` in LLM context. Normalize to lowercase, strip punctuation.
2. **Boolean flags**: Only apply if user explicitly signals intent. Do NOT auto-apply.
3. **PAST_COMPANY**: Prefer company domain over name (e.g., `"tata.com"` > `"Tata Consultancy Services"`).
4. **No hallucination guard needed** — values come straight from user input, and fuzzy/partial matching handles minor errors.

---

## Example

User says: "Need a fleet manager who recently changed jobs and is active on LinkedIn"

Set 3 filters applied:
```json
[
  { "filter_type": "RECENTLY_CHANGED_JOBS" },
  { "filter_type": "POSTED_ON_LINKEDIN" }
]
```
