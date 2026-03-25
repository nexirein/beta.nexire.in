/**
 * app/api/ai/context-to-filters/route.ts
 * Phase 3 — Filter Resolution Pipeline (CrustData edition).
 *
 * Input:  accumulated conversational context (raw text from chat)
 * Output: CrustData-ready filter tree + filterState
 *
 * Resolution paths:
 * Path A: CrustData autocomplete → job titles + locations (exact strings)
 * Path B: resolveCrustDataIndustries() → industry values
 * Path C: Direct LLM Mapping → seniority, headcount (small whitelists)
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createServerClient } from "@/lib/supabase/server";
import { assembleCrustDataFilters } from "@/lib/ai/filter-assembler";
import { redis } from "@/lib/redis/client";
import { crustdataRealtimeAutocomplete } from "@/lib/crustdata/client";
import { resolveIndustries } from "@/lib/crustdata/filter-vector-search";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Enum Whitelists (Path C — small enough to pass to LLM) ─────────────────────
const SENIORITY_VALUES = [
  "C-Suite", "Director", "Entry", "Founder/Owner", "Head",
  "Intern", "Manager", "Partner", "Senior", "Vice President"
];

const HEADCOUNT_RANGES = [
  "1-10", "11-20", "21-50", "51-100", "101-200", "201-500",
  "501-1000", "1001-2000", "2001-5000", "5001-10000", "10000+"
];

// ── LLM Extraction Prompt ───────────────────────────────────────────────────────
const EXTRACTION_PROMPT = `You are Nexire AI — a Senior Executive Headhunter.
Extract a precise, structured candidate search profile from the conversational context below.
You are preparing this profile for a high-priority search in the CrustData PersonDB.

══════════════════════════════════════════════════════════════════
EXTRACTION RULES
══════════════════════════════════════════════════════════════════
1. requirement_summary (CRITICAL): A professional, one-sentence brief of the requirement.
   Example: "Searching for a Senior Frontend Engineer in Bangalore with 5+ years experience in React/Next.js for a Fintech startup."

2. job_titles:
   - Extract 1-2 PRIMARY titles exactly as they appear on LinkedIn.
   - For similar_job_titles, generate 5-8 realistic LinkedIn titles people ACTUALLY have in their profiles.
   - Titles must be SHORT (2-4 words max). Do NOT append technology suffixes like '- PLC', '- VFD', '/ HMI'.
   - Valid: "Automation Sales Engineer", "Technical Sales Manager", "Regional Sales Engineer"
   - INVALID: "Field Sales Engineer - PLC/VFD", "Application Engineer - Automation Sales"
   - Use "boolean" strategy for niche roles (logistics, manufacturing, healthcare, construction).
   - Use "include" strategy for tech, finance, HR, sales.
   - boolean_search_expression: Required for niche roles. Syntax: (Senior OR Head) AND (Operations OR Logistics).

3. locations:
   - raw_location: The PRIMARY city only (single city, no country suffix needed).
   - similar_locations: ONLY include 1-2 genuinely nearby cities. If user is in Mumbai, include ONLY Navi Mumbai or Thane. NOT other cities like Ahmedabad or Surat unless user explicitly wants them.
   - Do NOT add distant locations or entire metro regions automatically.

4. experience_years:
   - raw_experience_min: Minimum years (integer).
   - raw_experience_max: Only if explicitly capped (integer).

5. seniority: ONLY use: ${SENIORITY_VALUES.join(", ")}
6. company_headcount_range: ONLY use: ${HEADCOUNT_RANGES.join(", ")}
7. raw_tech / skills_json: Skills map to CrustData "skills" field.
8. raw_industry / similar_industries: Map to standard LinkedIn industry sectors.

══════════════════════════════════════════════════════════════════
OUTPUT SCHEMA
══════════════════════════════════════════════════════════════════
Return ONLY valid JSON:
{
  "requirement_summary": "Professional search brief",
  "raw_job_titles": [],
  "similar_job_titles": [],
  "job_title_strategy": "include | boolean",
  "boolean_search_expression": null,
  "domain_cluster": "software | mechanical | civil | logistics | sales_marketing | finance | medical | other",
  "raw_location": null,
  "similar_locations": [],
  "raw_tech": [],
  "raw_industry": [],
  "similar_industries": [],
  "person_seniority": [],
  "raw_experience_min": null,
  "raw_experience_max": null,
  "company_headcount_range": [],
  "company_funding_stage": [],
  "raw_school": [],
  "exclude_companies": [],
  "exclude_job_titles": [],
  "raw_keywords": [],
  "raw_max_person_per_company": null,
  "time_in_current_role_min": null,
  "time_in_current_role_max": null,
  "time_in_current_company_min": null,
  "time_in_current_company_max": null
}`;

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
    // Use 'title' filter_type (realtime autocomplete for current_employers.title)
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

// ── Main Route ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const rawText: string = body?.text ?? "";
    const accumulatedContext = body?.accumulatedContext;

    // Build text input for extraction
    let inputText = rawText;
    if (!inputText && accumulatedContext) {
      const parts: string[] = [];
      if (accumulatedContext.job_titles?.length) parts.push(`Role: ${accumulatedContext.job_titles.join(", ")}`);
      if (accumulatedContext.locations?.length) parts.push(`Location: ${accumulatedContext.locations.join(", ")}`);
      if (accumulatedContext.technologies?.length) parts.push(`Skills: ${accumulatedContext.technologies.join(", ")}`);
      if (accumulatedContext.seniority?.length) parts.push(`Seniority: ${accumulatedContext.seniority.join(", ")}`);
      if (accumulatedContext.industry?.length) parts.push(`Industry: ${accumulatedContext.industry.join(", ")}`);
      if (accumulatedContext.experience_years != null) parts.push(`Experience: ${accumulatedContext.experience_years} years`);
      if (accumulatedContext.schools?.length) parts.push(`Schools/Institutes: ${accumulatedContext.schools.join(", ")}`);
      if (accumulatedContext.company_headcount_range?.length) parts.push(`Company Size: ${accumulatedContext.company_headcount_range.join(", ")}`);
      if (accumulatedContext.company_funding_stage?.length) parts.push(`Funding: ${accumulatedContext.company_funding_stage.join(", ")}`);
      if (accumulatedContext.exclude_companies?.length) parts.push(`Exclude Companies: ${accumulatedContext.exclude_companies.join(", ")}`);
      if (accumulatedContext.exclude_job_titles?.length) parts.push(`Exclude Titles: ${accumulatedContext.exclude_job_titles.join(", ")}`);
      if (accumulatedContext.other_keywords?.length) parts.push(`Keywords: ${accumulatedContext.other_keywords.join(", ")}`);
      inputText = parts.join(". ");
    }

    if (!inputText || inputText.trim().length < 5) {
      return NextResponse.json({ error: "Not enough context to build filters" }, { status: 400 });
    }

    // ── Step 1: LLM Extraction ────────────────────────────────────────────────
    const extractionResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: EXTRACTION_PROMPT }] },
        { role: "model", parts: [{ text: "Understood. I will return only JSON." }] },
        { role: "user", parts: [{ text: `HIRING REQUIREMENTS:\n${inputText}` }] },
      ],
      config: { responseMimeType: "application/json", temperature: 0 },
    });

    const raw = extractionResult.text;
    if (!raw) throw new Error("Empty LLM extraction response");
    const extracted = JSON.parse(raw);

    // ── Step 2: CrustData Autocomplete (Path A — Set1) + Vector Search (Path B — Set2) ─
    const userTitles: string[] = Array.isArray(accumulatedContext?.job_titles)
      ? accumulatedContext.job_titles : [];
    const userLocations: string[] = Array.isArray(accumulatedContext?.locations)
      ? accumulatedContext.locations : [];

    const seedTitles = Array.from(new Set([
      ...userTitles,
      ...(extracted.raw_job_titles ?? []),
      ...(extracted.similar_job_titles ?? []).slice(0, 3),
    ])).filter(Boolean).slice(0, 5);

    const seedLocations = Array.from(new Set([
      ...userLocations,
      extracted.raw_location,
    ])).filter(Boolean).slice(0, 3) as string[];

    // Raw industry inputs: prefer user context, fallback to LLM extraction
    const rawIndustries: string[] = Array.from(new Set([
      ...(Array.isArray(accumulatedContext?.industry) ? accumulatedContext.industry : []),
      ...(extracted.raw_industry ?? []),
      ...(extracted.similar_industries ?? []),
    ])).filter(Boolean).slice(0, 6);

    // Parallel: Set1 autocomplete (titles + regions) + Set2 vector search (industries)
    const [titleSuggsBySeeed, regionSuggsBySeeed, resolvedIndustries] = await Promise.all([
      batchedSuggestions(seedTitles, fetchCrustDataTitleSuggestions, 3, 100),
      batchedSuggestions(seedLocations, fetchCrustDataRegionSuggestions, 3, 100),
      resolveIndustries(rawIndustries),
    ]);

    // Flatten resolved titles to a max of 12
    const allResolvedTitles = Array.from(new Set(titleSuggsBySeeed.flat())).slice(0, 12);

    // Flatten and de-duplicate resolved regions
    // IMPORTANT: Filter out suggestions that match a different country than expected.
    // Strategy: keep only the BEST match per unique seed city. Avoid 11-region bloat.
    const rawRegions = Array.from(new Set(regionSuggsBySeeed.flat()));
    // Per seed city, keep only the first (best) suggestion from that seed.
    // Seed i → regionSuggsBySeeed[i][0] is the top match for that city.
    const bestRegions = regionSuggsBySeeed
      .map((suggestions, idx) => {
        if (suggestions.length > 0) return suggestions[0];
        // Fallback: If autocomplete failed, use the raw user string, but strip out "(Remote)" or "Remote only"
        const seed = seedLocations[idx];
        if (!seed) return null;
        const cleaned = seed.replace(/\(?remote.*?\)?/ig, "").trim();
        return cleaned; // If it was EXACTLY "Remote", it becomes "", and .filter(Boolean) drops it correctly.
      })
      .filter(Boolean) as string[];
    const allResolvedRegions = Array.from(new Set(bestRegions)).slice(0, 4);
    void rawRegions; // available if needed

    // ── Step 3: Assemble CrustData filter tree ────────────────────────────────
    const explicitSeniority = Array.isArray(accumulatedContext?.seniority) ? accumulatedContext.seniority : [];
    const expMin = accumulatedContext?.experience_years
      ? parseInt(String(accumulatedContext.experience_years), 10) || null
      : null;

    const mergedExtracted = {
      ...extracted,
      person_seniority: explicitSeniority.length > 0 ? explicitSeniority : (extracted.person_seniority ?? []),
      raw_experience_min: expMin ?? extracted.raw_experience_min ?? null,
      raw_school: Array.isArray(accumulatedContext?.schools) && accumulatedContext.schools.length > 0
        ? accumulatedContext.schools
        : (extracted.raw_school ?? []),
      company_headcount_range: Array.isArray(accumulatedContext?.company_headcount_range) && accumulatedContext.company_headcount_range.length > 0
        ? accumulatedContext.company_headcount_range
        : (extracted.company_headcount_range ?? []),
      company_funding_stage: Array.isArray(accumulatedContext?.company_funding_stage) && accumulatedContext.company_funding_stage.length > 0
        ? accumulatedContext.company_funding_stage
        : (extracted.company_funding_stage ?? []),
      exclude_companies: Array.isArray(accumulatedContext?.exclude_companies) && accumulatedContext.exclude_companies.length > 0
        ? accumulatedContext.exclude_companies
        : (extracted.exclude_companies ?? []),
      exclude_job_titles: Array.isArray(accumulatedContext?.exclude_job_titles) && accumulatedContext.exclude_job_titles.length > 0
        ? accumulatedContext.exclude_job_titles
        : (extracted.exclude_job_titles ?? []),
    };

    const { filterTree, filterState } = assembleCrustDataFilters({
      extracted: mergedExtracted,
      resolvedTitles: allResolvedTitles,
      resolvedRegions: allResolvedRegions,
      resolvedIndustries: resolvedIndustries.length > 0 ? resolvedIndustries : undefined,
      radiusMiles: 30,
      booleanSearchExpression: extracted.boolean_search_expression ?? null,
    });

    // ── Step 4: Build response ────────────────────────────────────────────────
    return NextResponse.json({
      // Primary output: CrustData filterState for useFilterState.fromCrustDataPayload()
      filters: filterState,
      filterTree,
      requirementSummary: extracted.requirement_summary || null,
      // Legacy fields kept for SearchTerminal compatibility
      primaryJobTitles: (filterState.titles ?? []).slice(0, 3),
      adjacentJobTitles: (filterState.titles ?? []).slice(3, 12),
      exactCityLocations: allResolvedRegions.slice(0, 5),
      expandedLocations: allResolvedRegions,
      searchMode: accumulatedContext?.search_mode ?? "wide",
      domainCluster: extracted.domain_cluster || "other",
      // Resolution transparency
      resolution: {
        extraction: extracted,
        titleSuggestions: allResolvedTitles,
        regionSuggestions: allResolvedRegions,
      },
      warnings: [],
      stats: {
        filtersApplied: Object.keys(filterState).length,
        titlesResolved: allResolvedTitles.length,
        regionsResolved: allResolvedRegions.length,
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
