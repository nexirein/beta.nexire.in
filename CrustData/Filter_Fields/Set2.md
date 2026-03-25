# Set 2 — Vector Embedding Fields

These filter fields have a **finite, fixed enum list** defined by CrustData/LinkedIn.
Instead of calling the Autocomplete API (which burns rate limits), Nexire uses **Gemini Embedding 2** vectors
stored in Supabase to find the closest canonical value for any free-text input.

---

## How It Works

```
LLM extracts: { industry: ["Logistics", "Supply Chain"] }
                    ↓
Nexire embeds "Logistics" using gemini-embedding-2-preview (768-dim via MRL)
                    ↓
Supabase pgvector cosine similarity search on filter_embeddings table
  WHERE filter_type = 'industry'
  ORDER BY embedding <=> query_embedding LIMIT 3
                    ↓
Returns: "Transportation, Logistics, Supply Chain and Storage"
                    ↓
PersonDB filter: { column: "current_employers.company_industries", type: "(.)", value: "Transportation..." }
```

---

## Fields in Set 2

### INDUSTRY
**Column**: `current_employers.company_industries` (array field, fuzzy `.` match)
**Embedding model**: `gemini-embedding-2-preview`
**Top-N matches**: 3 per input term (OR logic in filter)

Full canonical value list: see `lib/crustdata/filter-enum-values.ts` → `CRUSTDATA_INDUSTRY_VALUES`

**Examples of resolution**:
| User/LLM input | Resolved CrustData value |
|---|---|
| "Logistics" | "Transportation, Logistics, Supply Chain and Storage" |
| "Supply Chain" | "Transportation, Logistics, Supply Chain and Storage" |
| "Software" | "Software Development" |
| "IT" | "IT Services and IT Consulting" |
| "Pharma" | "Pharmaceutical Manufacturing" |
| "FMCG" | "Consumer Goods" |

---

### SENIORITY_LEVEL
**Column**: `current_employers.seniority_level`
**Valid values** (exact strings):
```
"Owner / Partner", "CXO", "Vice President", "Director",
"Experienced Manager", "Entry Level Manager", "Strategic",
"Senior", "Entry Level", "In Training"
```
**Embedding advantage**: "mid-level" → "Senior"; "C-suite" → "CXO"; "head" → "Director"

---

### FUNCTION
**Column**: `current_employers.function_category`
**Valid values** (exact strings):
```
"Accounting", "Administrative", "Arts and Design", "Business Development",
"Community and Social Services", "Consulting", "Education", "Engineering",
"Entrepreneurship", "Finance", "Healthcare Services", "Human Resources",
"Information Technology", "Legal", "Marketing", "Media and Communication",
"Military and Protective Services", "Operations", "Product Management",
"Program and Project Management", "Purchasing", "Quality Assurance",
"Real Estate", "Research", "Sales", "Customer Success and Support"
```

---

### YEARS_OF_EXPERIENCE
**Column**: `years_of_experience`
**Valid values**:
```
"Less than 1 year", "1 to 2 years", "3 to 5 years", "6 to 10 years", "More than 10 years"
```
**Embedding advantage**: "5 years" → "3 to 5 years"; "10+ years" → "More than 10 years"

---

### YEARS_AT_CURRENT_COMPANY / YEARS_IN_CURRENT_POSITION
**Columns**: `current_employers.years_at_company` / `current_employers.years_at_company_raw`
**Same 5 values** as YEARS_OF_EXPERIENCE above.

---

### COMPANY_HEADCOUNT
**Column**: `current_employers.company_headcount_range`
**Valid values**:
```
"Self-employed", "1-10", "11-50", "51-200", "201-500",
"501-1,000", "1,001-5,000", "5,001-10,000", "10,001+"
```

---

### COMPANY_TYPE
**Column**: `current_employers.company_type`
**Valid values**:
```
"Public Company", "Privately Held", "Non Profit", "Educational Institution",
"Partnership", "Self Employed", "Self Owned", "Government Agency"
```

---

### PROFILE_LANGUAGE
**Column**: `profile_language`
**Valid values**:
```
"Arabic", "English", "Spanish", "Portuguese", "Chinese", "French", "Italian",
"Russian", "German", "Dutch", "Turkish", "Tagalog", "Polish", "Korean",
"Japanese", "Malay", "Norwegian", "Danish", "Romanian", "Swedish",
"Bahasa Indonesia", "Czech"
```

---

## Supabase Schema

```sql
CREATE TABLE filter_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_type TEXT NOT NULL,
  value TEXT NOT NULL,
  display_label TEXT,
  embedding vector(768),
  aliases TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(filter_type, value)
);

CREATE INDEX ON filter_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

## Vector Search Function

```sql
CREATE OR REPLACE FUNCTION match_filter_value(
  query_embedding vector(768),
  filter_type_param TEXT,
  match_count INT DEFAULT 3
) RETURNS TABLE(value TEXT, similarity FLOAT) AS $$
  SELECT value, 1 - (embedding <=> query_embedding) AS similarity
  FROM filter_embeddings
  WHERE filter_type = filter_type_param
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```
