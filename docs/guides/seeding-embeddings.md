# Developer Guide: Seeding Filter Embeddings

The search engine uses semantic vector embeddings for **Set 2** filter fields (Industry, Seniority, Function, etc.) to map user-generated terms to the exact CrustData/LinkedIn taxonomy.

## 1. Prerequisites
Ensure the following environment variables are set:
-   `GEMINI_API_KEY`: Google Generative AI API Key.
-   `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
-   `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (required to bypass RLS during seeding).

## 2. The Filter Registry
All canonical enum values are defined in:
`lib/crustdata/filter-enum-values.ts`

If you add new industries or seniority levels, add them to the `CRUSTDATA_INDUSTRY_VALUES` or other relevant arrays in this file first.

## 3. Running the Seed Script
The project includes a specialized seeding script that uses `gemini-embedding-2-preview` to generate vectors and upsert them to Supabase.

To run the seeding process:
```bash
npx tsx scripts/seed-filter-embeddings.ts
```

### What the script does:
1.  **Iterates** through all values in the `SET2_FILTER_REGISTRY`.
2.  **Checks** Supabase for existing values to avoid redundant API calls.
3.  **Embeds** new values using Gemini (reduces 3072-dim to 768-dim for efficiency).
4.  **Upserts** to the `filter_embeddings` table.

## 4. Troubleshooting
If industry search is returning irrelevant results:
1.  Check if the canonical industry value exists in `filter-enum-values.ts`.
2.  Verify the `match_filter_value` RPC function exists in Supabase.
3.  Ensure the `ivfflat` index is active on the `embedding` column in Supabase.
