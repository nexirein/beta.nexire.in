<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

# M03 — TASK 10: SEARCH API ROUTE (Master Orchestrator)
# Trae: Read CLAUDE.md first.
# This is the SINGLE API route that orchestrates: Redis cache check →
# Prospeo people-search → AI scoring → response. All M03 pieces plug in here.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build POST /api/search — the master search orchestrator:
1. Auth + rate limit check (Redis, from 02-redis-rate-limiter)
2. Build Prospeo query from filters
3. Check Redis cache (key = hash of filters)
4. If cache miss → call Prospeo /people-search API
5. Score + rank results with AI scorer (03-ai-scorer)
6. Cache results in Redis (TTL 1 hour)
7. Cross-reference DB: mark already-revealed candidates
8. Return paginated results + total count

---

## PROSPEO PEOPLE-SEARCH API SPEC

Endpoint: POST https://api.prospeo.io/linkedin-search
Headers: X-KEY: [PROSPEO_API_KEY], Content-Type: application/json

Request:
```json
{
  "limit": 25,
  "offset": 0,
  "query": {
    "title": "Senior Backend Engineer",
    "location": "Mumbai",
    "skills": ["Node.js", "PostgreSQL"],
    "company": "string",
    "seniority": ["senior", "lead"],
    "current_company_size": ["51-200", "201-500"]
  }
}
```

Response:
```json
{
  "error": false,
  "total": 142,
  "results": [
    {
      "id": "prospeo_unique_id",
      "full_name": "Rahul Sharma",
      "headline": "Senior Backend Engineer at Razorpay",
      "location": "Mumbai, Maharashtra, India",
      "company": "Razorpay",
      "skills": ["Node.js", "PostgreSQL", "Redis", "AWS"],
      "profile_url": "https://linkedin.com/in/rahulsharma",
      "connection_degree": 2
    }
  ]
}
```

---

## FILE — app/api/search/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/redis/rate-limiter";
import { scoreAndRankCandidates } from "@/lib/ai/scorer";
import { redis } from "@/lib/redis/client";
import { z } from "zod";
import crypto from "crypto";

const SearchSchema = z.object({
  keyword:      z.string().max(200).optional(),
  title:        z.string().max(200).optional(),
  skills:       z.array(z.string()).max(15).optional(),
  location:     z.string().max(100).optional(),
  company:      z.string().max(200).optional(),
  exp_min:      z.number().int().min(0).max(50).optional(),
  exp_max:      z.number().int().min(0).max(50).optional(),
  seniority:    z.array(z.enum(["intern","junior","mid","senior","lead","director","vp","c_suite"])).optional(),
  company_size: z.array(z.string()).optional(),
  limit:        z.number().int().min(1).max(50).default(25),
  offset:       z.number().int().min(0).default(0),
  project_id:   z.string().uuid().optional(),
  jd_text:      z.string().max(10000).optional(),
});

export type SearchFilters = z.infer<typeof SearchSchema>;

function buildCacheKey(filters: SearchFilters): string {
  const normalized = JSON.stringify({
    keyword:      filters.keyword ?? null,
    title:        filters.title ?? null,
    skills:       (filters.skills ?? []).sort(),
    location:     filters.location ?? null,
    company:      filters.company ?? null,
    exp_min:      filters.exp_min ?? null,
    exp_max:      filters.exp_max ?? null,
    seniority:    (filters.seniority ?? []).sort(),
    company_size: (filters.company_size ?? []).sort(),
    limit:        filters.limit,
    offset:       filters.offset,
  });
  return `nexire:search:${crypto.createHash("md5").update(normalized).digest("hex")}`;
}

function buildProspeoQuery(filters: SearchFilters) {
  const query: any = {};
  if (filters.title || filters.keyword) query.title = filters.title ?? filters.keyword;
  if (filters.location)   query.location     = filters.location;
  if (filters.company)    query.company      = filters.company;
  if (filters.skills?.length)    query.skills      = filters.skills;
  if (filters.seniority?.length) query.seniority   = filters.seniority;
  if (filters.company_size?.length) query.current_company_size = filters.company_size;
  return query;
}

function normalizeProspeoResult(r: any) {
  return {
    prospeo_id:       r.id,
    full_name:        r.full_name ?? "Unknown",
    headline:         r.headline ?? null,
    current_company:  r.company ?? null,
    location:         r.location ? r.location.split(",")[0].trim() : null,
    skills:           Array.isArray(r.skills) ? r.skills : [],
    linkedin_url:     r.profile_url,
    experience_years: null,  // Prospeo people-search doesn't return this — estimated by AI scorer
    is_revealed:      false,
    email:            null,
    phone:            null,
    candidate_id:     null,
    is_shortlisted:   false,
    shortlisted_project_id: null,
    ai_score:         null,
  };
}

export async function POST(req: NextRequest) {
  // ─── 1. Auth ───────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ─── 2. Validate ──────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  const filters = parsed.data;

  // ─── 3. Rate limit ────────────────────────────────────────
  const rl = await checkRateLimit(user.id, "search", 30, 60); // 30 searches/min
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // ─── 4. Redis cache check ─────────────────────────────────
  const cacheKey = buildCacheKey(filters);
  const cached = await redis.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached as string);
    // Still cross-ref revealed status even on cache hit
    const crossRefed = await crossRefRevealed(supabase, user.id, data.results);
    return NextResponse.json({ ...data, results: crossRefed, fromCache: true });
  }

  // ─── 5. Call Prospeo people-search ───────────────────────
  let prospeoResults: any[] = [];
  let totalCount = 0;

  try {
    const prospeoRes = await fetch("https://api.prospeo.io/linkedin-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": process.env.PROSPEO_API_KEY!,
      },
      body: JSON.stringify({
        limit:  filters.limit,
        offset: filters.offset,
        query:  buildProspeoQuery(filters),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!prospeoRes.ok) {
      if (prospeoRes.status === 429) {
        return NextResponse.json({ error: "SERVICE_LIMIT", message: "Search limit reached. Try again shortly." }, { status: 429 });
      }
      throw new Error(`Prospeo HTTP ${prospeoRes.status}`);
    }

    const prospeoData = await prospeoRes.json();
    if (prospeoData.error) throw new Error(prospeoData.message ?? "Prospeo search failed");

    prospeoResults = (prospeoData.results ?? []).map(normalizeProspeoResult);
    totalCount     = prospeoData.total ?? prospeoResults.length;
  } catch (err: any) {
    console.error("[Search] Prospeo error:", err.message);
    return NextResponse.json(
      { error: "SEARCH_FAILED", message: "Search service temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }

  // ─── 6. AI Scoring ───────────────────────────────────────
  let scoredResults = prospeoResults;
  if (filters.jd_text && prospeoResults.length > 0) {
    try {
      scoredResults = await scoreAndRankCandidates(prospeoResults, {
        jd_text:   filters.jd_text,
        skills:    filters.skills ?? [],
        exp_min:   filters.exp_min,
        exp_max:   filters.exp_max,
        seniority: filters.seniority ?? [],
      });
    } catch (err) {
      console.error("[Search] Scorer error, using unscored results:", err);
      // Non-fatal — continue with unscored results
    }
  }

  // ─── 7. Cache in Redis (1 hour TTL) ──────────────────────
  const responsePayload = { results: scoredResults, total: totalCount, filters };
  await redis.set(cacheKey, JSON.stringify(responsePayload), { ex: 3600 });

  // ─── 8. Cross-reference already-revealed candidates ──────
  const crossRefed = await crossRefRevealed(supabase, user.id, scoredResults);

  // ─── 9. Log search to history ────────────────────────────
  supabase.from("search_history").insert({
    user_id:       user.id,
    query_text:    filters.keyword ?? filters.title ?? null,
    filters:       filters,
    results_count: totalCount,
    project_id:    filters.project_id ?? null,
  }).then(() => {}); // fire and forget

  return NextResponse.json({
    results:   crossRefed,
    total:     totalCount,
    fromCache: false,
    filters,
  });
}

// Cross-reference: mark candidates that user has already revealed
async function crossRefRevealed(supabase: any, userId: string, results: any[]) {
  if (!results.length) return results;

  const linkedinUrls = results.map(r => r.linkedin_url).filter(Boolean);
  if (!linkedinUrls.length) return results;

  const { data: revealed } = await supabase
    .from("candidates")
    .select("linkedin_url, id, email, phone")
    .in("linkedin_url", linkedinUrls)
    .eq("revealed_by", userId);

  if (!revealed?.length) return results;

  const revealMap = Object.fromEntries(revealed.map((r: any) => [r.linkedin_url, r]));

  return results.map(r => {
    const match = revealMap[r.linkedin_url];
    if (!match) return r;
    return {
      ...r,
      is_revealed:  true,
      email:        match.email,
      phone:        match.phone,
      candidate_id: match.id,
    };
  });
}
```

---

## COMPLETION CHECKLIST
- [ ] POST /api/search validates with Zod
- [ ] Rate limit: 30 searches/min per user (Redis)
- [ ] Redis cache: MD5 key from normalized filters, 1hr TTL
- [ ] Prospeo linkedin-search called with correct query shape
- [ ] AI scorer called when jd_text provided (non-fatal if fails)
- [ ] Cross-reference: already-revealed candidates marked is_revealed=true
- [ ] Search logged to search_history (fire-and-forget)
- [ ] 429 from Prospeo returns user-friendly message

## BUILD LOG ENTRY
## M03-10 Search API Route — [date]
### File: app/api/search/route.ts
### M03 COMPLETE ✅ — all 10 files done
### Status: ✅ Complete
