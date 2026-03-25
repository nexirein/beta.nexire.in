/**
 * lib/waterfall-engine.ts  — CrustData Edition
 *
 * Pagination model:
 *   - 20 results per page shown to the user
 *   - First call: fetch 100 profiles (limit=100) → cache → serve 20 at a time (5 pages free)
 *   - CrustData credits: 3 per 100 profiles
 *
 * Waterfall Passes (graceful degradation):
 *   Pass 1  EXACT     — Full filter state as-is
 *   Pass 2  RELAXED   — Drop: seniority, function_category, keywords
 *   Pass 3  NEARBY    — Drop: seniority, function_category, keywords, industries; expand radius ×5
 *   Pass 4  MINIMAL   — Keep: titles/boolean + region + experience only; radius=500mi
 *
 * Each pass only runs if previous returned < MIN_RESULTS_THRESHOLD.
 * New results from each pass are tagged with their tier and de-duplicated.
 */

import { crustdataSearchPeople } from "@/lib/crustdata/client";
import {
  buildCrustDataFilters,
  buildRelaxedFilters,
  buildExpandedRadiusFilters,
  buildMinimalFilters,
} from "@/lib/crustdata/filter-builder";
import type { CrustDataFilterState, CrustDataPerson } from "@/lib/crustdata/types";

export type ResultTier = "EXACT_MATCH" | "RELAXED_SKILLS" | "NEARBY" | "MINIMAL";
export type SearchMode = "sniper" | "title_flex" | "location_flex" | "wide";

export interface WaterfallResult {
  results: Array<CrustDataPerson & { _tier: ResultTier }>;
  total: number;
  credits_used: number;
  next_cursor: string | null;
  pass_used: 1 | 2 | 3 | 4;
  result_tiers: {
    exact: number;
    relaxed: number;
    nearby: number;
    minimal: number;
  };
}

// Minimum candidates we want before stopping the waterfall and returning results.
// Setting this too low (e.g. 1) means we stop after getting 3 candidates even though
// a later pass with fewer constraints would return 30+ much better candidates.
// 15 ensures we always try harder before giving up and showing a thin result set.
const MIN_RESULTS_THRESHOLD = 15;
/** Results to fetch per API call (costs 3 credits for 100) */
const FETCH_SIZE = 100;
/** Results shown per UI page */
export const PAGE_SIZE = 15;



/**
 * Main CrustData waterfall engine.
 *
 * @param filterState - The normalized Nexire filter state
 * @param cursor      - Pagination cursor from previous response (null = first page)
 */
export async function executeWaterfallCrustData({
  filterState,
  cursor = null,
  passLevel = 1,
}: {
  filterState: CrustDataFilterState;
  cursor?: string | null;
  passLevel?: number;
}): Promise<WaterfallResult> {

  console.log(`[Waterfall Engine] executeWaterfallCrustData called with passLevel: ${passLevel}, cursor: ${cursor ? "true" : "false"}`);

  let activeFilter;
  let tierName: ResultTier;

  switch (passLevel) {
    case 4:
      activeFilter = buildMinimalFilters(filterState);
      tierName = "MINIMAL";
      break;
    case 3:
      activeFilter = buildExpandedRadiusFilters(filterState);
      tierName = "NEARBY";
      break;
    case 2:
      activeFilter = buildRelaxedFilters(filterState);
      tierName = "RELAXED_SKILLS";
      break;
    case 1:
    default:
      activeFilter = buildCrustDataFilters(filterState);
      tierName = "EXACT_MATCH";
      break;
  }

  const response = await crustdataSearchPeople({
    filters: activeFilter,
    limit: FETCH_SIZE,
    cursor: cursor ?? undefined,
  });

  const results = (response.profiles ?? []).map((p) => ({
    ...p,
    _tier: tierName,
  }));

  return {
    results,
    total: response.total_count,
    credits_used: 3,
    next_cursor: response.next_cursor,
    pass_used: passLevel as 1 | 2 | 3 | 4,
    result_tiers: {
      exact: passLevel === 1 ? results.length : 0,
      relaxed: passLevel === 2 ? results.length : 0,
      nearby: passLevel === 3 ? results.length : 0,
      minimal: passLevel === 4 ? results.length : 0,
    },
  };
}

/**
 * Paginate a pre-fetched array locally.
 * Used when 100 results are cached — no extra API credits.
 */
export function paginateLocally<T>(
  allResults: T[],
  page: number
): { results: T[]; total: number; page: number; totalPages: number } {
  const start = (page - 1) * PAGE_SIZE;
  return {
    results: allResults.slice(start, start + PAGE_SIZE),
    total: allResults.length,
    page,
    totalPages: Math.ceil(allResults.length / PAGE_SIZE),
  };
}
