/**
 * app/api/ai/extract-and-resolve/route.ts
 * Phase 16 — Pure CrustData Native AI Pipeline.
 *
 * Pipeline:
 * 1. Gemini extracts raw structured data (aligned with CrustData schema)
 * 2. In parallel: CrustData Autocomplete resolves titles, regions, skills, and industries.
 * 3. filter-assembler builds the final CrustData filter tree.
 *
 * NO Prospeo calls, NO local Vector resolution.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { extractFiltersFromText, type LLMExtractedFilters } from "@/lib/ai/extractor";
import { assembleCrustDataFilters } from "@/lib/ai/filter-assembler";
import type { SearchMode } from "@/lib/waterfall-engine";
import {
  autocompleteTitles,
  autocompleteRegions,
  autocompleteSkills,
  autocompleteIndustries,
} from "@/lib/crustdata/client";

// ─── Common Indian city name variations (Bengaluru ↔ Bangalore etc.) ──────────
const CITY_ALIASES: Record<string, string[]> = {
  "bangalore": ["Bengaluru", "Bangalore"],
  "bengaluru": ["Bengaluru", "Bangalore"],
  "mumbai":    ["Mumbai", "Bombay"],
  "bombay":    ["Mumbai", "Bombay"],
  "calcutta":  ["Kolkata", "Calcutta"],
  "kolkata":   ["Kolkata", "Calcutta"],
  "new delhi": ["New Delhi", "Delhi"],
  "delhi":     ["Delhi", "New Delhi"],
  "madras":    ["Chennai", "Madras"],
  "chennai":   ["Chennai", "Madras"],
  "pune":      ["Pune", "Poona"],
};

// ─── Words that indicate a bad/rural/peripheral region suggestion ─────────────
const RURAL_INDICATORS = [
  "rural", "district", "taluk", "taluka", "tehsil", "mandal",
  "block", "subdivision", "circle"
];

function isGoodRegionSuggestion(suggestion: string, originalQuery: string): boolean {
  const lower = suggestion.toLowerCase();
  const qLower = originalQuery.toLowerCase();

  // Reject clearly rural/peripheral if we asked for a city
  const hasRuralWord = RURAL_INDICATORS.some(w => lower.includes(w));
  // Allow rural if they explicitly searched for a district/rural area
  const queryIsExplicitlyRural = RURAL_INDICATORS.some(w => qLower.includes(w));
  if (hasRuralWord && !queryIsExplicitlyRural) return false;

  return true;
}

/**
 * Resolve a location query to a CrustData region string using autocomplete.
 * Tries aliases and picks the best non-rural matching result.
 */
async function resolveRegion(query: string): Promise<string | null> {
  const qLower = query.toLowerCase().trim();
  const aliases = CITY_ALIASES[qLower] ?? [query];

  // Try each alias until we get a good result
  for (const alias of aliases) {
    const suggestions = await autocompleteRegions(alias);
    const good = suggestions.filter(s => isGoodRegionSuggestion(s, alias));
    if (good.length > 0) {
      // Prefer suggestions that include the queried city name
      const aliasLower = alias.toLowerCase();
      const preferred = good.find(s =>
        s.toLowerCase().includes(aliasLower) ||
        aliasLower.includes(s.toLowerCase().split(",")[0].trim())
      ) ?? good[0];
      return preferred;
    }
  }

  // Last resort: return raw query if nothing resolved
  return query.length > 2 ? query : null;
}

function parseExperienceYears(input: unknown): { min: number | null; max: number | null } {
  const s = String(input ?? "").toLowerCase();
  const nums = (s.match(/\d+/g) ?? []).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return { min: null, max: null };
  if (s.includes("+")) return { min: nums[0], max: null };
  return { min: nums[0], max: null };
}

/**
 * Frequency-based accumulator for suggestions.
 */
function collectAllByFrequency(
  suggestionsBySeed: string[][],
  maxTotal: number
): string[] {
  const freq = new Map<string, number>();
  const order = new Map<string, number>();
  let idx = 0;

  for (const list of suggestionsBySeed) {
    const seen = new Set<string>();
    for (const title of list) {
      const t = String(title).trim();
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      freq.set(t, (freq.get(t) ?? 0) + 1);
      if (!order.has(t)) order.set(t, idx++);
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0);
    })
    .map(([title]) => title)
    .slice(0, maxTotal);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const text: string = body?.text ?? "";
    const accumulatedContext = body?.accumulatedContext;

    if (!text && !accumulatedContext) {
      return NextResponse.json({ error: "Missing input." }, { status: 400 });
    }

    // ── Step 1: LLM Extraction ──────────────────────────────────────────
    let extracted: LLMExtractedFilters;
    if (accumulatedContext) {
      const { min: expMin, max: expMax } = parseExperienceYears(accumulatedContext.experience_years);
      extracted = {
        raw_job_titles: accumulatedContext.job_titles || [],
        similar_job_titles: [],
        job_title_strategy: "include",
        boolean_search_expression: null,
        raw_location: (accumulatedContext.locations || [])[0] || null,
        similar_locations: (accumulatedContext.locations || []).slice(1),
        raw_tech: accumulatedContext.technologies || [],
        raw_industry: accumulatedContext.industry || [],
        similar_industries: [],
        person_seniority: accumulatedContext.seniority || [],
        raw_experience_min: expMin,
        raw_experience_max: expMax,
        company_headcount_range: [],
        company_funding_stage: [],
        raw_department: [],
        raw_company_type: null,
        raw_keywords: accumulatedContext.other_keywords || [],
        raw_time_in_role_max_months: null,
        raw_max_person_per_company: null,
        company_websites: [],
        time_in_current_role_min: null,
        time_in_current_role_max: null,
        time_in_current_company_min: null,
        time_in_current_company_max: null,
        raw_school: [],
        raw_degree: [],
        raw_field_of_study: [],
        languages: [],
        company_hq_location: [],
        exclude_job_titles: [],
        exclude_companies: [],
        exclude_industries: [],
        full_name: null,
      };
    } else {
      extracted = await extractFiltersFromText(text);
    }

    const searchMode: SearchMode = (
      ["sniper", "title_flex", "location_flex", "wide"].includes(accumulatedContext?.search_mode)
        ? accumulatedContext.search_mode
        : "wide"
    ) as SearchMode;

    // ── Step 2: Native Resolution ──────────────────────────────────────────

    // 2a. Job Titles
    const strategy = extracted.job_title_strategy ?? "include";
    let resolvedJobTitles: string[] = [];
    let booleanSearchExpression: string | null = null;

    if (strategy === "boolean" && extracted.boolean_search_expression) {
      // For boolean strategy: keep the expression AND also generate a title list for the OR filter
      booleanSearchExpression = extracted.boolean_search_expression;
      // Derive seed titles from the boolean groups to also resolve via autocomplete
      const seedTitles = Array.from(new Set([
        ...(extracted.raw_job_titles ?? []),
        ...(extracted.similar_job_titles ?? []),
      ])).filter(Boolean).slice(0, 6);

      if (seedTitles.length > 0) {
        const suggestionsBySeed = await Promise.all(
          seedTitles.map(t => autocompleteTitles(t, 8))
        );
        resolvedJobTitles = collectAllByFrequency(suggestionsBySeed, 15);
      }
    } else if (searchMode === "sniper" || searchMode === "location_flex") {
      const primaryTitles = (extracted.raw_job_titles ?? []).filter(Boolean);
      if (primaryTitles.length > 0) {
        booleanSearchExpression = primaryTitles
          .map((t: string) => `"${t.trim().toLowerCase()}"`)
          .join(" OR ");
      }
    } else {
      const titlesToResolve = Array.from(new Set([
        ...(extracted.raw_job_titles ?? []),
        ...(extracted.similar_job_titles ?? []),
      ])).filter(Boolean).slice(0, 8);

      const suggestionsBySeed = await Promise.all(
        titlesToResolve.map(t => autocompleteTitles(t))
      );
      resolvedJobTitles = collectAllByFrequency(suggestionsBySeed, 20);
    }

    // 2b. Regions — with smart de-ruralisation
    const locationsToResolve = Array.from(new Set([
      extracted.raw_location,
      ...(extracted.similar_locations ?? [])
    ])).filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 3);

    const resolvedRegions: string[] = [];
    for (const loc of locationsToResolve) {
      const resolved = await resolveRegion(loc);
      if (resolved && !resolvedRegions.includes(resolved)) {
        resolvedRegions.push(resolved);
      }
    }

    // 2c. Skills & Industries (Autocomplete only, no vector fallback)
    const [resolvedSkills, resolvedIndustries] = await Promise.all([
      (async () => {
        const seeds = (extracted.raw_tech ?? []).slice(0, 8);
        if (seeds.length === 0) return [];
        const results = await Promise.all(seeds.map(s => autocompleteSkills(s, 5)));
        return Array.from(new Set(results.flat())).slice(0, 15);
      })(),
      (async () => {
        const seeds = [...(extracted.raw_industry ?? []), ...(extracted.similar_industries ?? [])].slice(0, 8);
        if (seeds.length === 0) return [];
        const results = await Promise.all(seeds.map(s => autocompleteIndustries(s, 5)));
        return Array.from(new Set(results.flat())).slice(0, 10);
      })()
    ]);

    // ── Step 3: Assemble Filter Tree ───────────────────────────────────────
    // We override the extracted skills/industries with the resolved ones if found
    const resolutionInput = {
      ...extracted,
      raw_tech: resolvedSkills.length > 0 ? resolvedSkills : extracted.raw_tech,
      raw_industry: resolvedIndustries.length > 0 ? resolvedIndustries : extracted.raw_industry,
    };

    const { filterTree: filters, filterState } = assembleCrustDataFilters({
      extracted: resolutionInput,
      resolvedTitles: resolvedJobTitles,
      resolvedRegions: resolvedRegions,
      booleanSearchExpression,
    });

    return NextResponse.json({
      filters,
      searchMode,
      primaryJobTitles: extracted.raw_job_titles ?? [],
      resolvedMappings: {
        skills: resolvedSkills,
        industries: resolvedIndustries,
        locations: resolvedRegions,
        jobTitles: resolvedJobTitles,
        jobTitleStrategy: strategy,
        booleanSearchExpression: booleanSearchExpression ?? undefined,
      },
      filterState,
    });
  } catch (err: unknown) {
    console.error("[extract-and-resolve]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI extraction failed" },
      { status: 500 }
    );
  }
}
