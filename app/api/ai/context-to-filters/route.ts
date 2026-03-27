/**
 * app/api/ai/context-to-filters/route.ts
 * Phase 3 — Filter Resolution Pipeline (CrustData edition).
 *
 * Architecture (v2 — no LLM re-extraction):
 * The accumulated context from the chat AI is already structured.
 * Re-running an LLM on it adds latency, noise, and invents fields
 * the user never asked for (similar_job_titles, similar_industries, etc.).
 *
 * Instead: map accumulatedContext directly to filter inputs, then
 * resolve titles/regions/industries through CrustData autocomplete.
 *
 * Resolution paths:
 * Path A: CrustData autocomplete → job titles + locations (exact LinkedIn strings)
 * Path B: Vector search → industry canonical values
 * Path C: Direct mapping → seniority, experience, headcount (already structured)
 *
 * search_intent controls title count:
 *   tight    → 1 seed, top 3 from autocomplete  (specialist/niche roles)
 *   balanced → 2 seeds, top 5 from autocomplete  (default)
 *   wide     → 3 seeds, top 8 from autocomplete  (broad functional roles)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { assembleCrustDataFilters } from "@/lib/ai/filter-assembler";
import { redis } from "@/lib/redis/client";
import { crustdataRealtimeAutocomplete } from "@/lib/crustdata/client";
import { resolveIndustries } from "@/lib/crustdata/filter-vector-search";

// ── CrustData Autocomplete Helpers ─────────────────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchCrustDataTitleSuggestions(query: string): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];
  const cacheKey = `crustdata:suggest:title:v1:${query.trim().toLowerCase().replace(/\s+/g, "_")}`;

  if (redis.isAvailable) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as string[];
    } catch { /* ignore cache miss */ }
  }

  try {
    const results = await crustdataRealtimeAutocomplete("title", query.trim());
    if (redis.isAvailable && results.length > 0) {
      redis.set(cacheKey, JSON.stringify(results), { ex: 60 * 60 * 24 * 3 }).catch(() => {});
    }
    return results.slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchCrustDataRegionSuggestions(query: string): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];
  const cacheKey = `crustdata:suggest:region:v1:${query.trim().toLowerCase().replace(/\s+/g, "_")}`;

  if (redis.isAvailable) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as string[];
    } catch { /* ignore */ }
  }

  try {
    const results = await crustdataRealtimeAutocomplete("region", query.trim());
    if (redis.isAvailable && results.length > 0) {
      redis.set(cacheKey, JSON.stringify(results), { ex: 60 * 60 * 24 * 7 }).catch(() => {});
    }
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

async function batchedSuggestions<T>(
  items: T[],
  fetchFn: (item: T) => Promise<string[]>,
  batchSize = 3,
  delayMs = 100
): Promise<string[][]> {
  const results: string[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkRes = await Promise.all(chunk.map(fetchFn));
    results.push(...chunkRes);
    if (i + batchSize < items.length) await delay(delayMs);
  }
  return results;
}

// ── Intent → title count config ────────────────────────────────────────────────
function getIntentConfig(intent: string | null | undefined) {
  switch (intent) {
    case "tight":
      // Specialist/niche role: "Fleet Manager", "Radiologist", "DevOps Engineer"
      // User wants only people with that exact title on LinkedIn.
      return { maxSeeds: 1, maxTitles: 3 };
    case "wide":
      // Broad functional role: "Marketing", "Operations", "Finance"
      // User is willing to see the full adjacent role cluster.
      return { maxSeeds: 3, maxTitles: 8 };
    case "balanced":
    default:
      // Default: role + its closest LinkedIn synonyms.
      return { maxSeeds: 2, maxTitles: 5 };
  }
}

// ── Main Route ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const accumulatedContext = body?.accumulatedContext;
    // skipExpansion=true: user clicked Skip — use only their exact titles, no autocomplete expansion.
    const skipExpansion: boolean = body?.skipExpansion === true;

    if (!accumulatedContext || !accumulatedContext.job_titles?.length) {
      return NextResponse.json({ error: "Not enough context to build filters" }, { status: 400 });
    }

    // ── Step 1: Map accumulatedContext directly to structured filter inputs ──
    // No second LLM call. The chat AI already structured this data.
    // Re-running extraction adds noise and invents fields (similar_job_titles, etc.)
    // that pollute the search with irrelevant titles.
    const userTitles: string[] = Array.isArray(accumulatedContext.job_titles)
      ? accumulatedContext.job_titles.filter(Boolean)
      : [];
    const userLocations: string[] = Array.isArray(accumulatedContext.locations)
      ? accumulatedContext.locations.filter(Boolean)
      : [];
    const userIndustries: string[] = Array.isArray(accumulatedContext.industry)
      ? accumulatedContext.industry.filter(Boolean)
      : [];
    const userSeniority: string[] = Array.isArray(accumulatedContext.seniority)
      ? accumulatedContext.seniority.filter(Boolean)
      : [];
    const userTechnologies: string[] = Array.isArray(accumulatedContext.technologies)
      ? accumulatedContext.technologies.filter(Boolean)
      : [];
    const userSchools: string[] = Array.isArray(accumulatedContext.schools)
      ? accumulatedContext.schools.filter(Boolean)
      : [];
    const userHeadcount: string[] = Array.isArray(accumulatedContext.company_headcount_range)
      ? accumulatedContext.company_headcount_range.filter(Boolean)
      : [];
    const userFunding: string[] = Array.isArray(accumulatedContext.company_funding_stage)
      ? accumulatedContext.company_funding_stage.filter(Boolean)
      : [];
    const userExcludeCompanies: string[] = Array.isArray(accumulatedContext.exclude_companies)
      ? accumulatedContext.exclude_companies.filter(Boolean)
      : [];
    const userExcludeTitles: string[] = Array.isArray(accumulatedContext.exclude_job_titles)
      ? accumulatedContext.exclude_job_titles.filter(Boolean)
      : [];
    const experienceMin = accumulatedContext.experience_years
      ? parseInt(String(accumulatedContext.experience_years), 10) || null
      : null;

    // ── Step 2: Intent-controlled seeding ──────────────────────────────────────
    const searchIntent = accumulatedContext.search_intent ?? "balanced";
    const { maxSeeds, maxTitles } = skipExpansion
      ? { maxSeeds: userTitles.length, maxTitles: userTitles.length }
      : getIntentConfig(searchIntent);

    // For tight/skip: only seed the user's exact title(s) — no expansion.
    // For balanced/wide: seed from user titles only (not LLM-invented similar titles).
    // The autocomplete results themselves provide the LinkedIn-native variants.
    const seedTitles = userTitles.slice(0, Math.max(maxSeeds, 1));
    const seedLocations = userLocations.slice(0, 3);

    // ── Step 3: CrustData Autocomplete + Industry Vector Search ────────────────
    const [titleSuggsBySeeed, regionSuggsBySeeed, resolvedIndustries] = await Promise.all([
      skipExpansion
        ? Promise.resolve(userTitles.map(() => [] as string[]))
        : batchedSuggestions(seedTitles, fetchCrustDataTitleSuggestions, 3, 100),
      batchedSuggestions(seedLocations, fetchCrustDataRegionSuggestions, 3, 100),
      userIndustries.length > 0 ? resolveIndustries(userIndustries) : Promise.resolve([]),
    ]);

    // Resolved titles: user's titles always pinned at front, autocomplete follows.
    // Trim to intent-controlled max so we don't send 8 titles when user wanted tight.
    const allResolvedTitles = Array.from(new Set([
      ...userTitles,               // pinned first — user's explicit request
      ...titleSuggsBySeeed.flat(), // CrustData autocomplete (LinkedIn-native variants)
    ])).slice(0, maxTitles);

    // Resolved regions: prefer CrustData's canonical region string (e.g. "Vadodara Taluka, Gujarat, India")
    // because it geocodes precisely for radius search. Fall back to a Title-Cased version of the
    // raw seed (better geocoding than all-lowercase "vadodara").
    const toTitleCase = (s: string) =>
      s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const bestRegions = regionSuggsBySeeed
      .map((suggestions, idx) => {
        if (suggestions.length > 0) return suggestions[0];
        const seed = seedLocations[idx];
        if (!seed) return null;
        const clean = seed.replace(/\(?remote.*?\)?/ig, "").trim();
        // Title-case fallback gives geocoders the best chance to resolve correctly
        return clean ? toTitleCase(clean) : null;
      })
      .filter(Boolean) as string[];
    const allResolvedRegions = Array.from(new Set(bestRegions)).slice(0, 4);

    // ── Step 4: Build extracted object directly from user context ──────────────
    // Only populate fields the user actually specified.
    // Sparse filters = precise results. Dense guessed filters = noise.
    const extracted = {
      requirement_summary: null as string | null,
      raw_job_titles: userTitles,
      similar_job_titles: [],        // never invent these — they caused the Fleet Manager problem
      job_title_strategy: "include" as const,
      boolean_search_expression: null as string | null,
      domain_cluster: "other" as string,
      raw_location: userLocations[0] ?? null,
      similar_locations: [],
      raw_tech: userTechnologies,
      raw_industry: userIndustries,
      similar_industries: [],
      person_seniority: userSeniority,
      raw_experience_min: experienceMin,
      raw_experience_max: null as number | null,
      company_headcount_range: userHeadcount,
      company_funding_stage: userFunding,
      raw_school: userSchools,
      exclude_companies: userExcludeCompanies,
      exclude_job_titles: userExcludeTitles,
      raw_keywords: Array.isArray(accumulatedContext.other_keywords)
        ? accumulatedContext.other_keywords.filter(Boolean)
        : [],
      raw_max_person_per_company: null,
      time_in_current_role_min: null,
      time_in_current_role_max: null,
      time_in_current_company_min: null,
      time_in_current_company_max: null,
    };

    // ── Step 5: Assemble CrustData filter tree ────────────────────────────────
    const { filterTree, filterState } = assembleCrustDataFilters({
      extracted,
      resolvedTitles: allResolvedTitles,
      resolvedRegions: allResolvedRegions,
      resolvedIndustries: resolvedIndustries.length > 0 ? resolvedIndustries : undefined,
      radiusMiles: 30,
      booleanSearchExpression: null,
      userTitles,
    });

    // ── Step 6: Build response ────────────────────────────────────────────────
    return NextResponse.json({
      filters: filterState,
      filterTree,
      requirementSummary: null,
      primaryJobTitles: userTitles.length > 0 ? userTitles : (filterState.titles ?? []).slice(0, 3),
      adjacentJobTitles: (filterState.titles ?? []).filter((t: string) => !userTitles.includes(t)).slice(0, 9),
      exactCityLocations: allResolvedRegions.slice(0, 5),
      expandedLocations: allResolvedRegions,
      searchMode: searchIntent,
      domainCluster: "other",
      resolution: {
        extraction: extracted,
        titleSuggestions: allResolvedTitles,
        regionSuggestions: allResolvedRegions,
        searchIntent,
      },
      warnings: [],
      stats: {
        filtersApplied: Object.keys(filterState).length,
        titlesResolved: allResolvedTitles.length,
        regionsResolved: allResolvedRegions.length,
        searchIntent,
        maxTitles,
      },
    });
  } catch (err: unknown) {
    console.error("[context-to-filters]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Filter resolution failed" },
      { status: 500 }
    );
  }
}
