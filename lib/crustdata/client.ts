/**
 * lib/crustdata/client.ts
 * HTTP wrapper for CrustData PersonDB API.
 * Covers: search, autocomplete (field + realtime), and credits check.
 */

import type {
  CrustDataSearchRequest,
  CrustDataSearchResponse,
  CrustDataAutocompleteRequest,
  CrustDataAutocompleteResponse,
  CrustDataRealtimeAutocompleteResponse,
  CrustDataFilterTree,
} from "./types";

const BASE_URL = "https://api.crustdata.com";

function getApiKey(): string {
  const key = process.env.CRUSTDATA_API_KEY;
  if (!key) throw new Error("[CrustData] CRUSTDATA_API_KEY env var not set");
  return key;
}

function headers() {
  return {
    "Authorization": `Token ${getApiKey()}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

// ─── People Search ──────────────────────────────────────────────────────────

/**
 * Search people in CrustData PersonDB.
 * Returns `profiles[]`, `next_cursor`, and `total_count`.
 *
 * Credit cost: 3 credits per 100 results returned.
 * Use `limit: 20` per page to get 5 pages from 1 credit batch (100 results / 20 per page).
 */
export async function crustdataSearchPeople(
  request: CrustDataSearchRequest
): Promise<CrustDataSearchResponse> {
  const response = await fetch(`${BASE_URL}/screener/persondb/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[CrustData search] HTTP ${response.status}:`, text);
    return { profiles: [], next_cursor: null, total_count: 0, error: text };
  }

  const data = await response.json();
  return data as CrustDataSearchResponse;
}

// ─── PersonDB Field Autocomplete ────────────────────────────────────────────

/**
 * Get autocomplete suggestions for any PersonDB field.
 * POST /screener/persondb/autocomplete
 * No credit cost.
 *
 * Supports contextual filtering: pass `filters` to narrow suggestions
 * (e.g., get titles only at a specific company).
 */
export async function crustdataAutocomplete(
  request: CrustDataAutocompleteRequest
): Promise<string[]> {
  try {
    const response = await fetch(`${BASE_URL}/screener/persondb/autocomplete`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(request),
    });

    if (!response.ok) return [];
    const data: CrustDataAutocompleteResponse = await response.json();
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

// ─── Realtime Filter Autocomplete ────────────────────────────────────────────

/**
 * Realtime autocomplete for filter values.
 * GET /screener/linkedin_filter/autocomplete
 * No credit cost.
 *
 * filter_type: "region" | "industry" | "title" | "school"
 */
export async function crustdataRealtimeAutocomplete(
  filterType: "region" | "industry" | "title" | "school",
  query: string,
  count = 10
): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      filter_type: filterType,
      query,
      count: String(count),
    });
    const response = await fetch(
      `${BASE_URL}/screener/linkedin_filter/autocomplete?${params}`,
      { method: "GET", headers: headers() }
    );

    if (!response.ok) return [];
    const data: CrustDataRealtimeAutocompleteResponse = await response.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

// ─── Credits Check ──────────────────────────────────────────────────────────

/**
 * Check remaining API credits.
 * GET /user/credits
 * No credit cost.
 */
export async function crustdataGetCredits(): Promise<number | null> {
  try {
    const response = await fetch(`${BASE_URL}/user/credits`, {
      method: "GET",
      headers: headers(),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.credits === "number" ? data.credits : null;
  } catch {
    return null;
  }
}

// ─── Convenience: Autocomplete by use case ──────────────────────────────────

/** Get job title suggestions (uses PersonDB autocomplete for best results) */
export async function autocompleteTitles(query: string, limit = 10): Promise<string[]> {
  if (query.length < 2) return [];
  return crustdataAutocomplete({
    field: "current_employers.title",
    query,
    limit,
  });
}

/** Get region/location suggestions */
export async function autocompleteRegions(query: string, limit = 10): Promise<string[]> {
  if (query.length < 2) return [];
  return crustdataAutocomplete({
    field: "region",
    query,
    limit,
  });
}

/** Get skill suggestions */
export async function autocompleteSkills(query: string, limit = 15): Promise<string[]> {
  if (query.length < 2) return [];
  return crustdataAutocomplete({
    field: "skills",
    query,
    limit,
  });
}

/** Get company name suggestions */
export async function autocompleteCompanies(query: string, limit = 10): Promise<string[]> {
  if (query.length < 2) return [];
  return crustdataAutocomplete({
    field: "current_employers.name",
    query,
    limit,
  });
}

/** Get industry suggestions for `current_employers.company_industries` */
export async function autocompleteIndustries(query: string, limit = 15): Promise<string[]> {
  // Use realtime autocomplete which is tuned for industry
  const results = await crustdataRealtimeAutocomplete("industry", query, limit);
  if (results.length > 0) return results;
  // Fallback: PersonDB autocomplete
  return crustdataAutocomplete({
    field: "current_employers.company_industries",
    query,
    limit,
  });
}

/** Get school/university suggestions */
export async function autocompleteSchools(query: string, limit = 10): Promise<string[]> {
  if (query.length < 2) return [];
  return crustdataAutocomplete({
    field: "education_background.institute_name",
    query,
    limit,
  });
}

// ─── CrustDataClient Class (OO Wrapper) ────────────────────────────────────

/**
 * OO wrapper for CrustData API, useful for testing and structured calls.
 */
export class CrustDataClient {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      "Authorization": `Token ${this.apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  async search(filters: CrustDataFilterTree, limit = 10, cursor?: string): Promise<{ total: number; results: any[] }> {
    const response = await fetch(`${BASE_URL}/screener/persondb/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ filters, limit, cursor }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Search failed: ${text}`);
    }

    const data = await response.json();
    return {
      total: data.total_count || 0,
      results: data.profiles || []
    };
  }

  async autocomplete(field: string, query: string, limit = 10): Promise<string[]> {
    const response = await fetch(`${BASE_URL}/screener/persondb/autocomplete`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ field, query, limit }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.suggestions || [];
  }
}
