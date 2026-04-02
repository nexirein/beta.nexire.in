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
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── CrustData Autocomplete Helpers ─────────────────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchCrustDataTitleSuggestions(query: string): Promise<string[]> {
  if (!query || query.trim().length < 3) return [];
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
  if (!query || query.trim().length < 3) return [];
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

// ── Dynamic Domain-Aware Title Expansion ───────────────────────────────────────
async function generateDomainAwareTitleCluster(titles: string[], industries: string[]): Promise<string[]> {
  if (titles.length === 0) return [];
  const cacheKey = `crustdata:suggest:domain_cluster:v1:${JSON.stringify({ titles, industries }).toLowerCase().replace(/\s+/g, "_")}`;

  if (redis.isAvailable) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as string[];
    } catch { /* ignore */ }
  }

  try {
    const prompt = `
You are an expert Headhunter and Talent Intelligence system.
Given these base job titles: ${JSON.stringify(titles)}
And these industries (if any): ${JSON.stringify(industries)}

Your task: Return a JSON array of strings containing the FULL semantic cluster of equivalent LinkedIn job titles for this specific role and seniority band in this specific domain.

CRITICAL INSTRUCTION: Understand domain-specific naming conventions!
- In Investment Banking: "Managing Director" = Partner/Owner equivalent.
- In Law Firms: "Associate" = Junior/Mid level.
- In Architecture/Design Firms: "Associate" or "Senior Associate" = Senior/Principal level.
- In Academia: "Assistant Professor" = Tenure-track but junior to "Associate Professor".
- In Tech: "Staff Engineer" = "Principal Engineer" at some companies.

Rules:
1. ONLY return titles that represent the SAME seniority band and function. Do NOT include junior roles if the base titles are senior, and vice versa.
2. Return ONLY natural LinkedIn titles (e.g. "Software Engineer" not "SWE III").
3. Do not invent completely different roles (e.g. if the input is "Fleet Manager", do not return "Logistics Director").
4. Return 3 to 8 titles. Include the base titles if they are natural LinkedIn strings.
5. Provide ONLY a JSON array of strings. No markdown, no explanation.
6. CRITICAL: DO NOT use commas, hyphens, or semicolons in the titles (e.g., return "Director of Public Affairs" or "Public Affairs Director" instead of "Director, Public Affairs"). Punctuation breaks exact substring matching arrays.

Example Input: titles: ["Architect", "Senior Architect"], industries: ["Architecture & Planning"]
Example Output: ["Senior Architect", "Project Architect", "Design Architect", "Associate", "Senior Associate", "Principal Architect", "Lead Architect"]
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    const raw = response.text;
    if (!raw) return [];
    
    const parsed = JSON.parse(raw);
    const results = Array.isArray(parsed) ? parsed.filter(t => typeof t === "string") : [];

    if (redis.isAvailable && results.length > 0) {
      redis.set(cacheKey, JSON.stringify(results), { ex: 60 * 60 * 24 * 7 }).catch(() => {});
    }
    
    return results;
  } catch (err) {
    console.error("[Domain Cluster AI Error]", err);
    return [];
  }
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
    const skipExpansion: boolean = body?.skipExpansion === true;

    if (!accumulatedContext || !accumulatedContext.job_titles?.length) {
      return NextResponse.json({ error: "Not enough context to build filters" }, { status: 400 });
    }

    // ── Step 1: Map accumulatedContext directly to structured filter inputs ──
    const userTitles: string[] = (accumulatedContext.job_titles ?? [])
      .filter(Boolean) as string[];
    
    const userLocations: string[] = Array.isArray(accumulatedContext.locations)
      ? accumulatedContext.locations.filter(Boolean).map(String)
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
    const experienceMin = typeof accumulatedContext.experience_min === 'number'
      ? accumulatedContext.experience_min
      : null;
    const experienceMax = typeof accumulatedContext.experience_max === 'number'
      ? accumulatedContext.experience_max
      : null;

    // ── Step 2: Resolve Job Titles & Regions ──────────────────────────────────
    // CRITICAL FIX: Disable expensive expansions by default to stop credit loss.
    // We only resolve the user's explicit seeds.
    const [titleSuggs, regionSuggs, resolvedIndustries] = await Promise.all([
      skipExpansion || userTitles.length === 0
        ? Promise.resolve([])
        : Promise.all(userTitles.map(fetchCrustDataTitleSuggestions)),
      userLocations.length === 0
        ? Promise.resolve([])
        : Promise.all(userLocations.map(fetchCrustDataRegionSuggestions)),
      userIndustries.length > 0 
        ? resolveIndustries(userIndustries) 
        : Promise.resolve([]),
    ]);

    // Resolved titles: user's titles always pinned at front, autocomplete follows.
    const allResolvedTitles = Array.from(new Set([
      ...userTitles,
      ...titleSuggs.flat(),
    ])).slice(0, 10);

    // Resolved regions: prefer CrustData canonical region strings
    const allResolvedRegions = Array.from(new Set([
      ...userLocations,
      ...regionSuggs.flat(),
    ])).slice(0, 10);

    const searchIntent = accumulatedContext.search_intent || "balanced";
    const { maxTitles } = getIntentConfig(searchIntent);

    // ── Step 3: Assemble Filter State ─────────────────────────────────────────
    const extracted = {
      requirement_summary: null as string | null,
      raw_job_titles: userTitles,
      similar_job_titles: [],
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
      raw_experience_max: experienceMax,
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

    const { filterTree, filterState } = assembleCrustDataFilters({
      extracted: extracted as any,
      resolvedTitles: allResolvedTitles,
      resolvedRegions: allResolvedRegions,
      resolvedIndustries: resolvedIndustries.length > 0 ? resolvedIndustries : undefined,
      radiusKm: 50,
      booleanSearchExpression: null,
      userTitles,
      ranking_priority: accumulatedContext.ranking_priority as any,
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
