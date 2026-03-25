# Phase 4 — AI/JD Search Pipeline (OpenAI Embeddings + Supabase pgvector)
[PREPEND MASTER_CONTEXT.md + ALL CORRECTIONS]

## What already exists (do not recreate)
- Supabase client configured, all prior migrations applied
- lib/prospeo/client.ts with ProspeoCient class
- lib/prospeo/account-manager.ts with AccountManager
- lib/redis/keys.ts with all REDIS_KEYS constants
- app/api/suggestions/route.ts (Prospeo suggestions with Redis cache)
- OpenAI SDK: install it if not present → npm install openai (already in package.json likely)

---

## 4.1 — Enable pgvector + Create Embedding Tables

Create supabase/migrations/0017_create_vector_index.sql:

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Step 2: Table to store Prospeo enum embeddings
CREATE TABLE prospeo_embeddings (
  id          TEXT PRIMARY KEY DEFAULT 'emb_' || nanoid(12),
  category    TEXT NOT NULL,       -- 'technology' | 'industry'
  label       TEXT NOT NULL,       -- exact Prospeo enum string e.g. "Amazon Web Services"
  embedding   vector(1536),        -- text-embedding-3-small output
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, label)
);

-- Step 3: IVFFlat index for fast similarity search
-- lists=100 is optimal for ~5200 vectors (rule: sqrt(n_rows))
CREATE INDEX ON prospeo_embeddings
  USING ivfflat (embedding vector_ip_ops)
  WITH (lists = 100);

-- Step 4: Match function (RPC called from Next.js)
-- Uses inner product (<#>) — correct for normalized OpenAI embeddings
CREATE OR REPLACE FUNCTION match_prospeo_enum(
  query_embedding   vector(1536),
  filter_category   TEXT,
  match_threshold   FLOAT    DEFAULT 0.82,
  match_count       INT      DEFAULT 5
)
RETURNS TABLE (
  label       TEXT,
  category    TEXT,
  similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    label,
    category,
    1 - (embedding <#> query_embedding) AS similarity
  FROM prospeo_embeddings
  WHERE category = filter_category
    AND 1 - (embedding <#> query_embedding) > match_threshold
  ORDER BY embedding <#> query_embedding
  LIMIT match_count;
$$;

-- Note: No RLS on this table — it's read-only reference data, not user data.
-- GRANT SELECT on prospeo_embeddings to anon, authenticated;
GRANT SELECT ON prospeo_embeddings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_prospeo_enum TO anon, authenticated;

Apply this migration with: supabase db push OR supabase migration up

---

## 4.2 — OpenAI Embeddings Client

Create lib/ai/embeddings.ts:

import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const
export const EMBEDDING_DIMENSIONS = 1536

/**
 * Embed a single string. Returns a 1536-float array.
 * OpenAI text-embedding-3-small outputs are already normalized — no manual L2 needed.
 */
export async function embedSingle(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim().toLowerCase(),  // normalize input for consistent matching
  })
  return res.data[0].embedding
}

/**
 * Embed multiple strings in one API call (batch).
 * OpenAI accepts up to 2048 inputs per request.
 * Returns array of { text, embedding } in same order as input.
 */
export async function embedBatch(
  texts: string[]
): Promise<{ text: string; embedding: number[] }[]> {
  // Split into chunks of 500 to stay well within limits
  const CHUNK_SIZE = 500
  const results: { text: string; embedding: number[] }[] = []

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE)
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: chunk.map(t => t.trim().toLowerCase()),
    })
    chunk.forEach((text, idx) => {
      results.push({ text, embedding: res.data[idx].embedding })
    })
    // Small delay between chunks to avoid rate limits during index build
    if (i + CHUNK_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }
  return results
}

---

## 4.3 — One-Time Index Build Script

Create scripts/build-embedding-index.ts:
(Run with: npx tsx scripts/build-embedding-index.ts)

This script is run ONCE after Phase 4 is deployed.
The user will populate the data arrays before running.

import { createClient } from '@supabase/supabase-js'
import { embedBatch } from '../lib/ai/embeddings'

// ════════════════════════════════════════════════
// PASTE VALUES HERE BEFORE RUNNING
// Technologies: copy array from https://prospeo.io/api-docs/enum/technologies
const TECHNOLOGIES: string[] = [
  // PASTE_4946_TECHNOLOGY_STRINGS_HERE
]

// Industries: copy array from https://prospeo.io/api-docs/enum/industries
const INDUSTRIES: string[] = [
  // PASTE_256_INDUSTRY_STRINGS_HERE
]
// ════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // needs service role to bypass RLS for inserts
)

async function buildIndex(category: 'technology' | 'industry', labels: string[]) {
  console.log(`\nEmbedding ${labels.length} ${category} strings...`)
  const embedded = await embedBatch(labels)
  console.log(`Embedding complete. Upserting into Supabase...`)

  // Batch upsert in groups of 100 (Supabase limit per upsert)
  const BATCH = 100
  let inserted = 0
  for (let i = 0; i < embedded.length; i += BATCH) {
    const chunk = embedded.slice(i, i + BATCH)
    const rows = chunk.map(({ text, embedding }) => ({
      category,
      label: text,          // NOTE: this is lowercase-trimmed from embedBatch
      embedding: `[${embedding.join(',')}]`,  // pgvector format
    }))
    const { error } = await supabase
      .from('prospeo_embeddings')
      .upsert(rows, { onConflict: 'category,label' })
    if (error) { console.error(`Error at batch ${i}:`, error); process.exit(1) }
    inserted += chunk.length
    process.stdout.write(`\r  ${inserted}/${embedded.length} upserted`)
  }
  console.log(`\n✅ ${category}: ${inserted} embeddings stored.`)
}

async function main() {
  if (TECHNOLOGIES.length === 0) {
    console.error('❌ TECHNOLOGIES array is empty. Paste values before running.')
    process.exit(1)
  }
  await buildIndex('technology', TECHNOLOGIES)
  await buildIndex('industry', INDUSTRIES)
  console.log('\n🚀 Index build complete. Nexire AI resolver is ready.')
}

main().catch(console.error)

IMPORTANT: Add SUPABASE_SERVICE_ROLE_KEY to .env.local (get from Supabase dashboard → Project Settings → API → service_role key). This key is NEVER exposed to the frontend — server/script use only.

---

## 4.4 — Vector Resolver Service

Create lib/ai/vector-resolver.ts:

import { createClient } from '@supabase/supabase-js'
import { embedSingle } from './embeddings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ResolvedMatch {
  query: string          // what HR typed ("AWS")
  match: string          // exact Prospeo value ("amazon web services" — note: stored lowercase)
  matchOriginalCase: string  // original case from Prospeo list (stored in DB)
  score: number          // similarity 0-1
  confident: boolean     // score >= 0.82
}

/**
 * Resolve a list of raw tech/industry strings to exact Prospeo enum values.
 * Embeds each term individually and queries pgvector.
 * Runs all embeds in parallel for speed.
 */
export async function resolveTerms(
  terms: string[],
  category: 'technology' | 'industry',
  options: { threshold?: number; topK?: number } = {}
): Promise<{
  resolved: ResolvedMatch[]
  unresolved: string[]
}> {
  const threshold = options.threshold ?? 0.82
  const topK = options.topK ?? 5

  if (terms.length === 0) return { resolved: [], unresolved: [] }

  // Embed all terms in parallel (each is a single cheap API call)
  const embedPromises = terms.map(term => embedSingle(term))
  const embeddings = await Promise.all(embedPromises)

  // Query pgvector for each term in parallel
  const matchPromises = embeddings.map((embedding, idx) =>
    supabase.rpc('match_prospeo_enum', {
      query_embedding: `[${embedding.join(',')}]`,
      filter_category: category,
      match_threshold: threshold,
      match_count: topK,
    })
  )
  const matchResults = await Promise.all(matchPromises)

  const resolved: ResolvedMatch[] = []
  const unresolved: string[] = []

  terms.forEach((term, idx) => {
    const { data, error } = matchResults[idx]
    if (error || !data || data.length === 0) {
      unresolved.push(term)
      return
    }
    // Take best match (highest similarity, first result since ordered by pgvector)
    const best = data[0]
    resolved.push({
      query: term,
      match: best.label,
      matchOriginalCase: best.label,  // already stored as original Prospeo value
      score: best.similarity,
      confident: best.similarity >= 0.82,
    })
  })

  return { resolved, unresolved }
}

---

## 4.5 — LLM Extraction Service

Create lib/ai/extractor.ts:

import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// These small enum lists ARE included inline in the prompt
// (they're small enough — total ~60 values)
const INLINE_ENUMS = `
SENIORITY (use ONLY these exact values): C-Suite, Director, Entry, Founder/Owner, Head, Intern, Manager, Partner, Senior, Vice President
HEADCOUNT_RANGE (use ONLY these exact values): 1-10, 11-20, 21-50, 51-100, 101-200, 201-500, 501-1000, 1001-2000, 2001-5000, 5001-10000, 10000+
FUNDING_STAGE (use ONLY these exact values): Angel, Pre seed, Seed, Series A, Series B, Series C, Series D, Series E-J, Post IPO equity, Post IPO debt, Private equity, Undisclosed
DEPARTMENT (use ONLY these exact values): C-Suite, Consulting, Design, Engineering & Technical, Finance, Human Resources, Information Technology, Legal, Marketing, Medical & Health, Operations, Product, Sales
`

const SYSTEM_PROMPT = `You are a recruitment filter extractor for an Indian hiring platform.
Extract structured data from HR job requirements or job descriptions.
Return ONLY a valid JSON object — no explanation, no markdown, no code blocks.

${INLINE_ENUMS}

Output this exact JSON schema (use null for missing values):
{
  "raw_job_titles": [],
  "raw_location": null,
  "raw_tech": [],
  "raw_industry": [],
  "person_seniority": [],
  "raw_experience_min": null,
  "raw_experience_max": null,
  "company_headcount_range": [],
  "company_funding_stage": [],
  "person_department": [],
  "raw_company_type": null,
  "raw_keywords": [],
  "raw_time_in_role_max_months": null
}

Rules:
- raw_tech and raw_industry: extract exactly as mentioned (do NOT map to enum values — that is done separately)
- person_seniority: map to the SENIORITY enum values listed above (can be multiple)
- company_headcount_range: map to the HEADCOUNT_RANGE enum values (can be multiple — e.g. "startup" → ["1-10","11-20","21-50"])
- company_funding_stage: map to the FUNDING_STAGE enum values
- person_department: map to the DEPARTMENT enum values
- raw_location: single string as mentioned (city, region, or country)
- raw_experience_min/max: integer years or null
- Return ONLY the JSON object`

export interface LLMExtractedFilters {
  raw_job_titles: string[]
  raw_location: string | null
  raw_tech: string[]
  raw_industry: string[]
  person_seniority: string[]
  raw_experience_min: number | null
  raw_experience_max: number | null
  company_headcount_range: string[]
  company_funding_stage: string[]
  person_department: string[]
  raw_company_type: string | null
  raw_keywords: string[]
  raw_time_in_role_max_months: number | null
}

export async function extractFiltersFromText(text: string): Promise<LLMExtractedFilters> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, 4000) },  // cap at 4000 chars
    ],
    response_format: { type: 'json_object' },
    temperature: 0,       // deterministic extraction
    max_tokens: 500,      // output is small JSON
  })

  const raw = completion.choices[0].message.content
  if (!raw) throw new Error('Empty LLM response')

  try {
    return JSON.parse(raw) as LLMExtractedFilters
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`)
  }
}

---

## 4.6 — Filter Assembler

Create lib/ai/filter-assembler.ts:

import { LLMExtractedFilters } from './extractor'
import { ResolvedMatch } from './vector-resolver'
import { ProspeoFilters } from '../prospeo/client'

interface AssemblerInput {
  extracted: LLMExtractedFilters
  resolvedTech: ResolvedMatch[]
  resolvedIndustry: ResolvedMatch[]
  resolvedLocations: string[]     // from Prospeo suggestions API
  resolvedJobTitles: string[]     // from Prospeo suggestions API
}

export function assembleProspeoFilters(input: AssemblerInput): ProspeoFilters {
  const {
    extracted,
    resolvedTech,
    resolvedIndustry,
    resolvedLocations,
    resolvedJobTitles,
  } = input

  const filters: ProspeoFilters = {}

  // Job title
  if (resolvedJobTitles.length > 0) {
    filters.person_job_title = { include: resolvedJobTitles.slice(0, 10) }
  }

  // Location
  if (resolvedLocations.length > 0) {
    filters.person_location_search = { include: resolvedLocations }
  }

  // Seniority
  if (extracted.person_seniority.length > 0) {
    filters.person_seniority = { include: extracted.person_seniority }
  }

  // Department
  if (extracted.person_department.length > 0) {
    filters.person_department = { include: extracted.person_department }
  }

  // Experience
  if (extracted.raw_experience_min !== null || extracted.raw_experience_max !== null) {
    filters.person_year_of_experience = {}
    if (extracted.raw_experience_min !== null)
      filters.person_year_of_experience.min = extracted.raw_experience_min
    if (extracted.raw_experience_max !== null)
      filters.person_year_of_experience.max = extracted.raw_experience_max
  }

  // Technologies (max 20 — Prospeo hard limit)
  const confidentTech = resolvedTech
    .filter(t => t.confident)
    .slice(0, 20)
    .map(t => t.matchOriginalCase)
  if (confidentTech.length > 0) {
    filters.company_technology = { include: confidentTech }
  }

  // Industries (max 10 practical limit)
  const confidentIndustry = resolvedIndustry
    .filter(i => i.confident)
    .slice(0, 10)
    .map(i => i.matchOriginalCase)
  if (confidentIndustry.length > 0) {
    filters.company_industry = { include: confidentIndustry }
  }

  // Headcount
  if (extracted.company_headcount_range.length > 0) {
    filters.company_headcount_range = { include: extracted.company_headcount_range }
  }

  // Funding stage
  if (extracted.company_funding_stage.length > 0) {
    filters.company_funding = {
      stage: { include: extracted.company_funding_stage }
    }
  }

  // Company keywords
  if (extracted.raw_keywords.length > 0) {
    filters.company_keywords = {
      include: extracted.raw_keywords.slice(0, 10),
      include_all: false
    }
  }

  return filters
}

---

## 4.7 — Main Orchestration API Route

Create app/api/ai/extract-and-resolve/route.ts:

import { NextRequest, NextResponse } from 'next/server'
import { extractFiltersFromText } from '@/lib/ai/extractor'
import { resolveTerms } from '@/lib/ai/vector-resolver'
import { assembleProspeoFilters } from '@/lib/ai/filter-assembler'
import { createClient } from '@/lib/supabase/server'
import redis, { REDIS_KEYS, REDIS_TTL } from '@/lib/redis'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { text } = await req.json()
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'Text too short' }, { status: 400 })
    }

    // ── Step 1: LLM Extraction (gpt-4o-mini, ~300ms, ~$0.0002) ──────────
    const extracted = await extractFiltersFromText(text)

    // ── Step 2: Run all 4 resolvers in parallel ───────────────────────────
    const [techResult, industryResult, locationSuggestions, jobTitleSuggestions] =
      await Promise.all([
        // 2a. FAISS-equivalent: embed raw tech → pgvector cosine search
        resolveTerms(extracted.raw_tech, 'technology'),

        // 2b. FAISS-equivalent: embed raw industry → pgvector cosine search
        resolveTerms(extracted.raw_industry, 'industry'),

        // 2c. Prospeo Suggestions API for location (via cached route)
        extracted.raw_location
          ? fetch(`${process.env.NEXTAUTH_URL}/api/suggestions?type=location_search&q=${encodeURIComponent(extracted.raw_location)}`)
              .then(r => r.json())
              .then(d => d.suggestions as string[])
              .catch(() => [])
          : Promise.resolve([]),

        // 2d. Prospeo Suggestions API for job title
        extracted.raw_job_titles[0]
          ? fetch(`${process.env.NEXTAUTH_URL}/api/suggestions?type=job_title_search&q=${encodeURIComponent(extracted.raw_job_titles[0])}`)
              .then(r => r.json())
              .then(d => d.suggestions as string[])
              .catch(() => [])
          : Promise.resolve([]),
      ])

    // ── Step 3: Assemble final Prospeo filter JSON ─────────────────────────
    const filters = assembleProspeoFilters({
      extracted,
      resolvedTech: techResult.resolved,
      resolvedIndustry: industryResult.resolved,
      resolvedLocations: locationSuggestions.slice(0, 5),
      resolvedJobTitles: jobTitleSuggestions.slice(0, 10),
    })

    // ── Step 4: Build response with full transparency (for UI badges) ──────
    const warnings: string[] = []
    techResult.unresolved.forEach(t =>
      warnings.push(`Technology "${t}" not found in Prospeo database`)
    )
    industryResult.unresolved.forEach(i =>
      warnings.push(`Industry "${i}" not found in Prospeo database`)
    )

    return NextResponse.json({
      filters,
      aiExtractedRaw: extracted,
      resolvedMappings: {
        tech: techResult.resolved,
        industry: industryResult.resolved,
        location: locationSuggestions,
        jobTitle: jobTitleSuggestions,
      },
      warnings,
      stats: {
        techResolved: techResult.resolved.length,
        techUnresolved: techResult.unresolved.length,
        industryResolved: industryResult.resolved.length,
        filtersApplied: Object.keys(filters).length,
      }
    })
  } catch (err: any) {
    console.error('[extract-and-resolve]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

---

## 4.8 — JD Search Modal

Create components/search/JDSearchModal.tsx:

This is a client component modal triggered by the "JD Search" option.

### Modal behavior:
- Width: 600px, centered, dark #111111 background, border #222222
- Header: "Search from Job Description" + X close button
- Two mode tabs: "Full JD" | "Quick Description" (framer-motion AnimatePresence)
  - Full JD mode: large textarea (min-height 280px) placeholder "Paste your job description here..."
  - Quick Description mode: single text input placeholder "e.g. Senior Python developer at fintech startup in Bangalore 5+ years"
- Character counter (bottom-right of textarea): "{n} / 4000"
- Footer: Cancel (zinc outlined) + "Extract & Apply Filters →" (purple, with loading spinner)

### On "Extract & Apply Filters" click:
1. Validate: at least 20 characters
2. Show loading state — replace button text with animated "🤖 Analyzing..." + shimmer overlay on textarea
3. Call POST /api/ai/extract-and-resolve with { text }
4. On success:
   a. Close JD modal
   b. Open Filter Modal (Phase 3) with initialFilters = response.filters
   c. Pass resolvedMappings and warnings as props to Filter Modal
5. On error: show react-hot-toast error

### Props the JDSearchModal emits on success (to parent):
onFiltersExtracted(filters: ProspeoFilters, meta: { resolvedMappings, warnings, aiExtractedRaw })

---

## 4.9 — AI Filter Indicators in Filter Modal

In the Filter Modal (Phase 3), add support for receiving AI-applied filters.

Add prop to FilterModal: aiMeta?: { resolvedMappings, warnings, aiExtractedRaw }

When aiMeta is present:
1. Show a banner at top of filter content area:
   "✨ AI applied {stats.filtersApplied} filters from your job description — review and customize"
   Style: purple gradient background, white text, dismiss (X) button

2. For each AI-applied value in a filter:
   - Render a small "✨" sparkle icon next to the chip
   - On hover: show tooltip "AI matched with {score}% confidence"
   - Chips from AI: slightly purple-tinted background (#1E0A3C) vs regular solid

3. For unresolved warnings (techResult.unresolved):
   - Show a "⚠️ Unresolved" section at bottom of Skills section
   - List unresolved terms as yellow chips: "⚠️ SomeLib"
   - Tooltip: "Could not find this in Prospeo's technology database. Add manually if needed."

---

## 4.10 — New Search Entry Points

Modify the "+ New Search" button behavior (currently a placeholder from Phase 2).

When "+ New Search" is clicked, show a choice modal:

Two options side by side (card style):
1. [🔍 icon] "Filter Search"
   "Build your search manually using filters"
   → Opens Filter Modal with empty filters

2. [🤖 icon] "AI / JD Search"
   "Paste a JD or describe in plain text"
   → Opens JD Search Modal

Style: dark cards (#1A1A1A), border #333333, hover border #7C3AED
Selected state: purple border + subtle purple background tint

---

## Environment Variables to Add

Add to .env.local:
SUPABASE_SERVICE_ROLE_KEY=    # from Supabase dashboard → Project Settings → API → service_role

This is different from SUPABASE_ANON_KEY. The service role key bypasses RLS and is only 
used server-side (embedding index build script + vector-resolver.ts server-side calls).
NEVER expose it in client components or browser bundles.

---

## Deliverable Checklist

Setup:
- [ ] supabase/migrations/0017_create_vector_index.sql applied successfully
- [ ] pgvector extension enabled: SELECT * FROM pg_extension WHERE extname = 'vector' returns 1 row
- [ ] prospeo_embeddings table created with IVFFlat index
- [ ] match_prospeo_enum() RPC function works (test in Supabase SQL editor)

Embedding client:
- [ ] lib/ai/embeddings.ts — embedSingle() returns 1536-float array
- [ ] lib/ai/embeddings.ts — embedBatch() handles 500-item chunks with 200ms delay

Index build:
- [ ] scripts/build-embedding-index.ts — dry-run with 5 test strings works
- [ ] After user pastes values: full build completes → prospeo_embeddings has 5,200 rows

Services:
- [ ] lib/ai/extractor.ts — returns valid JSON for any HR text input
- [ ] lib/ai/vector-resolver.ts — "AWS" resolves to "amazon web services" with score > 0.90
- [ ] lib/ai/filter-assembler.ts — output is valid ProspeoFilters JSON

API route:
- [ ] POST /api/ai/extract-and-resolve returns in < 1000ms (LLM + 4 parallel resolvers)
- [ ] All 4 resolvers run in parallel (check timestamps in logs)
- [ ] Warnings array populated for unresolved terms
- [ ] Route protected by auth session check

UI:
- [ ] "+ New Search" shows choice modal with Filter Search / AI JD Search options
- [ ] JD Search Modal opens, accepts text, shows loading state
- [ ] On success: Filter Modal opens with AI-applied filters
- [ ] AI banner shows at top of filter modal
- [ ] Sparkle ✨ icon on AI-applied filter chips
- [ ] Unresolved terms shown as yellow warning chips
- [ ] Confidence score in tooltip on hover

- [ ] npx tsc --noEmit → 0 errors
- [ ] npm run build → exit code 0
