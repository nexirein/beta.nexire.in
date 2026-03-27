/**
 * lib/crustdata/filter-builder.ts
 *
 * Converts a Nexire CrustDataFilterState into a CrustData filter tree.
 *
 * Operator reference:
 *  "in"          — exact / case-sensitive set membership (good for enum / autocomplete values)
 *  "not_in"      — exact set exclusion
 *  "(.)"         — case-insensitive fuzzy contains (ILIKE)
 *  "[.]"         — regex match  (use for pipe-OR patterns)
 *  "geo_distance"— radius search on `region` field
 *  "=>" / "=<"   — numeric ≥ / ≤
 *
 * Operator choice per field:
 *  - Enum / autocomplete-resolved values  → "in"  (seniority, headcount, company_type, industries, skills)
 *  - Fuzzy human-typed strings            → "(.)" with OR  (titles, company names, degrees, languages, …)
 *  - Numeric bounds                       → "=>" / "=<"
 *  - Exclusions from autocomplete         → "not_in"
 */

import type {
  CrustDataFilterState,
  CrustDataFilterTree,
  CrustDataSimpleFilter,
  CrustDataCompoundFilter,
} from "./types";

// ─── Valid CrustData seniority levels ────────────────────────────────────────
const CRUSTDATA_SENIORITY_LEVELS = new Set([
  "Owner / Partner",
  "CXO",
  "Vice President",
  "Director",
  "Experienced Manager",
  "Entry Level Manager",
  "Strategic",
  "Senior",
  "Entry Level",
  "In Training",
]);

const SENIORITY_MAP: Record<string, string[]> = {
  "c-suite":             ["CXO"],
  "cxo":                 ["CXO"],
  "director":            ["Director"],
  "entry":               ["Entry Level"],
  "founder":             ["Owner / Partner"],
  "owner":               ["Owner / Partner"],
  "founder/owner":       ["Owner / Partner"],
  "head":                ["Director", "Strategic"],
  "intern":              ["In Training"],
  "trainee":             ["In Training"],
  "manager":             ["Experienced Manager", "Entry Level Manager"],
  "entry level manager": ["Entry Level Manager"],
  "experienced manager": ["Experienced Manager"],
  "partner":             ["Owner / Partner"],
  "senior":              ["Senior"],
  "senior management":   ["Director", "Vice President", "CXO"],
  "vice president":      ["Vice President"],
  "vp":                  ["Vice President"],
  "executive":           ["CXO", "Director", "Vice President"],
  "strategic":           ["Strategic"],
};

function mapSeniority(raw: string): string[] {
  const lower = raw.toLowerCase();
  if (CRUSTDATA_SENIORITY_LEVELS.has(raw)) return [raw];
  return SENIORITY_MAP[lower] ?? [];
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function simpleFilter(
  column: string,
  type: CrustDataSimpleFilter["type"],
  value: CrustDataSimpleFilter["value"]
): CrustDataSimpleFilter {
  return { column, type, value };
}

function and(conditions: CrustDataFilterTree[]): CrustDataCompoundFilter {
  return { op: "and", conditions };
}

function or(conditions: CrustDataFilterTree[]): CrustDataCompoundFilter {
  return { op: "or", conditions };
}

/** Build an OR of fuzzy (.) filters for each value in a string[] */
function fuzzyOR(column: string, values: string[]): CrustDataFilterTree {
  if (values.length === 1) return simpleFilter(column, "(.)", values[0]);
  return or(values.map((v) => simpleFilter(column, "(.)", v)));
}

// ─── Boolean Expression Parser ───────────────────────────────────────────────

/**
 * Parse a boolean expression into a CrustData AND/OR filter tree.
 *
 * "(Head OR Regional OR Senior) AND (Operations OR Logistics)"
 *  →  AND([
 *       OR([title(.) "Head", title(.) "Regional", title(.) "Senior"]),
 *       OR([title(.) "Operations" OR headline(.) "Operations",
 *           title(.) "Logistics"  OR headline(.) "Logistics"])
 *     ])
 *
 * Rules:
 *  - Group 0 (core role): title only
 *  - Group 1+ (domain):   OR(title, headline) for each term
 */
function parseBooleanExpressionToFilters(expression: string): CrustDataFilterTree | null {
  if (!expression?.trim()) return null;

  try {
    const andGroups = expression
      .split(/\bAND\b/i)
      .map((s) => s.trim().replace(/^\(|\)$/g, "").trim())
      .filter(Boolean);

    if (andGroups.length === 0) return null;

    const regexConditions = andGroups
      .map((group, index) => {
        const terms = group
          .replace(/^\(|\)$/g, "")
          .split(/\bOR\b/i)
          .map((t) => t.trim().replace(/"/g, "").replace(/\s+/g, " "))
          .filter((t) => t.length >= 2 && t.length <= 80);

        if (terms.length === 0) return null;

        // Core role group → title only
        if (index === 0) {
          return terms.length === 1
            ? simpleFilter("current_employers.title", "(.)", terms[0])
            : or(terms.map((t) => simpleFilter("current_employers.title", "(.)", t)));
        }

        // Domain/specialty groups → OR(title, headline) per term
        const checks = terms.map((t) =>
          or([
            simpleFilter("current_employers.title", "(.)", t),
            simpleFilter("headline", "(.)", t),
          ])
        );
        return checks.length === 1 ? checks[0] : or(checks);
      })
      .filter(Boolean) as CrustDataFilterTree[];

    if (regexConditions.length === 0) return null;
    if (regexConditions.length === 1) return regexConditions[0];
    return and(regexConditions);
  } catch {
    const clean = expression.replace(/\b(AND|OR)\b/gi, " ").replace(/[()]/g, " ").trim();
    return clean.length >= 2
      ? simpleFilter("current_employers.title", "(.)", clean)
      : null;
  }
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

/**
 * Build a CrustData filter tree from a Nexire CrustDataFilterState.
 *
 * Design rules:
 *  1. All active filters are ANDed at the top level.
 *  2. Multiple values for "OR" semantics use the `or()` helper.
 *  3. Enum/autocomplete fields use "in"; human-typed fields use "(.)" per value.
 *  4. Empty/undefined/null fields are never emitted.
 */
export function buildCrustDataFilters(state: CrustDataFilterState): CrustDataFilterTree {
  const conditions: CrustDataFilterTree[] = [];

  // ─── Job Titles ────────────────────────────────────────────────────────────
  const titles = (state.titles ?? []).filter(Boolean);
  const excludeTitles = (state.exclude_titles ?? []).filter(Boolean);
  const booleanExpression = state.boolean_expression?.trim();
  const titleMode = state.title_mode ?? "current_only";

  const coreRoleConditions: CrustDataFilterTree[] = [];

  if (booleanExpression) {
    // Boolean expression always targets current title; mode doesn't override it
    const boolFilter = parseBooleanExpressionToFilters(booleanExpression);
    if (boolFilter) coreRoleConditions.push(boolFilter);
  } else if (titles.length > 0) {
    if (titleMode === "current_only") {
      // Default: only people who currently hold one of these titles
      coreRoleConditions.push(fuzzyOR("current_employers.title", titles));

    } else if (titleMode === "current_recent") {
      // Current OR held within the last 2 years
      // CrustData's past_employers.end_date is a date string; we compare >= 2 years ago
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const cutoff = twoYearsAgo.toISOString().slice(0, 10); // "YYYY-MM-DD"

      const currentTitleFilter = fuzzyOR("current_employers.title", titles);
      const recentPastFilter = and([
        fuzzyOR("past_employers.title", titles),
        simpleFilter("past_employers.end_date", "=>", cutoff),
      ]);
      coreRoleConditions.push(or([currentTitleFilter, recentPastFilter]));

    } else if (titleMode === "current_and_past") {
      // Entire career: search across all (current + past) employers
      coreRoleConditions.push(fuzzyOR("all_employers.title", titles));

    } else if (titleMode === "nested_companies") {
      // Title scoped to the same employer record as the selected companies.
      // We pull the company names from state and build a nested AND so
      // CrustData matches both conditions on the same employment record.
      const companyNames = (state.company_names ?? []).filter(Boolean);
      if (companyNames.length > 0) {
        // Nested AND: title + company within the same current_employers record
        const titleNode = fuzzyOR("current_employers.title", titles);
        const companyNode = fuzzyOR("current_employers.name", companyNames);
        coreRoleConditions.push(and([titleNode, companyNode]));
      } else {
        // No companies selected yet, fall back to current-only
        coreRoleConditions.push(fuzzyOR("current_employers.title", titles));
      }

    } else if (titleMode === "funding_stage") {
      // Title scoped to current employers in the configured funding range.
      const fundingMin = state.company_funding_min;
      const fundingMax = state.company_funding_max;
      const fundingConditions: CrustDataFilterTree[] = [
        fuzzyOR("current_employers.title", titles),
      ];
      if (typeof fundingMin === "number") {
        fundingConditions.push(
          simpleFilter("current_employers.company_funding_latest", "=>", fundingMin * 1_000_000)
        );
      }
      if (typeof fundingMax === "number") {
        fundingConditions.push(
          simpleFilter("current_employers.company_funding_latest", "=<", fundingMax * 1_000_000)
        );
      }
      coreRoleConditions.push(fundingConditions.length > 1 ? and(fundingConditions) : fundingConditions[0]);
    }
  }

  if (excludeTitles.length > 0) {
    // Use not_in for exact exclusion; autocomplete gives exact values
    conditions.push(simpleFilter("current_employers.title", "not_in", excludeTitles));
  }

  // ─── Past Titles ───────────────────────────────────────────────────────────
  const pastTitles = (state.past_titles ?? []).filter(Boolean);
  if (pastTitles.length > 0) {
    coreRoleConditions.push(fuzzyOR("past_employers.title", pastTitles));
  }

  // ─── Function Category (LinkedIn job function) ────────────────────────────
  const functionCategories = (state.function_category ?? []).filter(Boolean);
  if (functionCategories.length > 0) {
    // These are fixed enum values from LinkedIn → use "in"
    conditions.push(simpleFilter("current_employers.function_category", "in", functionCategories));
  }

  // ─── Location ─────────────────────────────────────────────────────────────
  // Strategy:
  //   1. Text-match on region / region_address_components (most reliable for India + small cities)
  //   2. geo_distance as a supplementary signal (good for Western geos)
  //   Both are combined with OR so either match is sufficient.
  //
  //   Google-search equivalent: site:linkedin.com/in "fleet manager" "ghaziabad"
  //   → just text-matching the city name in profile fields. We replicate this here.
  const regionsToSearch = state.regions?.length ? state.regions : (state.region ? [state.region] : []);
  if (regionsToSearch.length > 0) {
    const radiusMiles = state.radius_miles ?? 30;

    const INDIA_SIGNALS = [
      "india", "mumbai", "delhi", "bangalore", "hyderabad", "chennai",
      "kolkata", "pune", "ahmedabad", "baroda", "vadodara", "surat",
      "jaipur", "lucknow", "noida", "gurgaon", "gurugram", "thane",
      "navi mumbai", "nagpur", "indore", "bhopal", "patna", "agra",
      "visakhapatnam", "kochi", "coimbatore", "chandigarh", "goa",
      "rajkot", "jodhpur", "dehradun", "ncr", "navi", "metropolitan",
      "ghaziabad", "faridabad", "meerut", "agra", "kanpur", "varanasi",
    ];
    const allIndia = regionsToSearch.every(r => {
      const lower = r.toLowerCase();
      return lower.includes("india") || INDIA_SIGNALS.some(sig => lower.includes(sig));
    });

    // Dedupe regions — if multiple cities overlap (e.g. Delhi + Noida + Ghaziabad
    // are all within 30mi of each other), keep only the primary/most-specific city.

    // Build all per-region location conditions
    const locationConditions: CrustDataFilterTree[] = [];

    // Strip administrative suffixes like "Taluka", "District", "Division", "Tehsil"
    // so "Vadodara Taluka, Gujarat, India" → clean city = "Vadodara"
    const ADMIN_SUFFIX_RE = /\s+(taluka|district|tehsil|division|municipality|cantonment|township|block|mandal|nagar|rural)\b.*/i;
    const cleanCityName = (raw: string) => {
      const part = raw.split(",")[0].trim();
      return part.replace(ADMIN_SUFFIX_RE, "").trim();
    };

    // TEXT matching — reliable for ALL markets, especially India
    // Add both the raw first segment AND the clean city name (e.g. "Vadodara Taluka" AND "Vadodara")
    const addedCities = new Set<string>();
    for (const loc of regionsToSearch) {
      const rawCity = loc.split(",")[0].trim();
      const cleanCity = cleanCityName(loc);
      const citiesToAdd = Array.from(new Set([rawCity, cleanCity].filter(Boolean)));
      for (const city of citiesToAdd) {
        if (!addedCities.has(city.toLowerCase())) {
          addedCities.add(city.toLowerCase());
          locationConditions.push(simpleFilter("region", "(.)", city));
          locationConditions.push(simpleFilter("region_address_components", "(.)", city));
        }
      }
    }

    // GEO_DISTANCE — generate one radius bubble per location so that
    // adding a second city (e.g. Delhi + Noida) EXPANDS the pool, not shrinks it.
    // All bubbles are OR'd together with the text-match conditions above.
    const addedGeo = new Set<string>();
    for (const loc of regionsToSearch) {
      const normalized = loc.trim().toLowerCase();
      if (!addedGeo.has(normalized)) {
        addedGeo.add(normalized);
        locationConditions.push(simpleFilter("region", "geo_distance", {
          location: loc,
          distance: radiusMiles,
          unit: "mi",
        }));
      }
    }

    conditions.push(locationConditions.length === 1 ? locationConditions[0] : or(locationConditions));

    // Country guard — pin to India when all locations are India-based
    if (allIndia) {
      conditions.push(simpleFilter("location_country", "in", ["India"]));
    }
  }


  const excludeRegions = (state.exclude_regions ?? []).filter(Boolean);
  if (excludeRegions.length > 0) {
    // Regions come from autocomplete → exact values → not_in is fine
    conditions.push(simpleFilter("region", "not_in", excludeRegions));
  }

  // Past Regions — searched against all-employers work location
  // Use (.) fuzzy per value since region autocomplete values may not exactly match employer location format
  const pastRegions = (state.past_regions ?? []).filter(Boolean);
  if (pastRegions.length > 0) {
    conditions.push(fuzzyOR("all_employers.location", pastRegions));
  }

  // ─── Experience & Tenure ──────────────────────────────────────────────────
  if (typeof state.experience_min === "number") {
    conditions.push(simpleFilter("years_of_experience_raw", "=>", state.experience_min));
  }
  if (typeof state.experience_max === "number") {
    conditions.push(simpleFilter("years_of_experience_raw", "=<", state.experience_max));
  }

  if (typeof state.years_at_company_min === "number") {
    conditions.push(simpleFilter("current_employers.years_at_company_raw", "=>", state.years_at_company_min));
  }
  if (typeof state.years_at_company_max === "number") {
    conditions.push(simpleFilter("current_employers.years_at_company_raw", "=<", state.years_at_company_max));
  }

  if (typeof state.years_at_current_role_min === "number") {
    conditions.push(simpleFilter("current_employers.years_at_current_role_raw", "=>", state.years_at_current_role_min));
  }
  if (typeof state.years_at_current_role_max === "number") {
    conditions.push(simpleFilter("current_employers.years_at_current_role_raw", "=<", state.years_at_current_role_max));
  }

  // ─── Skills ───────────────────────────────────────────────────────────────
  // Skills come from CrustData autocomplete → exact values → "in" means "has at least one of these"
  const skills = (state.skills ?? []).filter(Boolean);
  if (skills.length > 0) {
    conditions.push(simpleFilter("skills", "in", skills));
  }

  // ─── Seniority ────────────────────────────────────────────────────────────
  // These are CrustData enum values → "in"
  const seniorityRaw = (state.seniority ?? []).filter(Boolean);
  const seniority = Array.from(new Set(
    seniorityRaw.flatMap(mapSeniority).filter(Boolean)
  ));
  if (seniority.length > 0) {
    conditions.push(simpleFilter("current_employers.seniority_level", "in", seniority));
  }

  // ─── Company Constraints ──────────────────────────────────────────────────
  // Company names from autocomplete — use (.) for robustness since LinkedIn name variants exist
  const companyNames = (state.company_names ?? []).filter(Boolean);
  if (companyNames.length > 0) {
    conditions.push(fuzzyOR("current_employers.name", companyNames));
  }

  const excludeCompanies = (state.exclude_company_names ?? []).filter(Boolean);
  if (excludeCompanies.length > 0) {
    // Exclude from ALL past + current employers
    conditions.push(simpleFilter("all_employers.name", "not_in", excludeCompanies));
  }

  // Company HQ — use (.) since region autocomplete values may not exactly match stored HQ strings
  const hqLocations = (state.company_hq_location ?? []).filter(Boolean);
  if (hqLocations.length > 0) {
    conditions.push(fuzzyOR("current_employers.company_hq_location", hqLocations));
  }

  // Headcount ranges are fixed enums → "in"
  const headcountRange = (state.company_headcount_range ?? []).filter(Boolean);
  if (headcountRange.length > 0) {
    conditions.push(simpleFilter("current_employers.company_headcount_range", "in", headcountRange));
  }

  // Company type fixed enums → "in"
  const companyType = (state.company_type ?? []).filter(Boolean);
  if (companyType.length > 0) {
    conditions.push(simpleFilter("current_employers.company_type", "in", companyType));
  }

  if (typeof state.company_funding_min === "number") {
    // CrustData stores funding in USD (not millions)
    conditions.push(simpleFilter("current_employers.company_funding_latest", "=>", state.company_funding_min * 1_000_000));
  }
  if (typeof state.company_funding_max === "number") {
    conditions.push(simpleFilter("current_employers.company_funding_latest", "=<", state.company_funding_max * 1_000_000));
  }

  // Company domains — exact match
  const domains = (state.company_domains ?? []).filter(Boolean);
  if (domains.length > 0) {
    conditions.push(simpleFilter("current_employers.company_website_domain", "in", domains));
  }

  // ─── Industries ───────────────────────────────────────────────────────────
  // CRITICAL: CrustData stores industry names as LONG strings like
  // "Transportation, Logistics, Supply Chain and Storage" — NOT simple words.
  // Using "in" (exact match) with "Logistics" will return 0 results.
  // We use (.) fuzzy/substring matching per industry in an OR group instead.
  // This mirrors how Google "site:linkedin.com/in" search works — substring match.
  const industries = (state.company_industries ?? []).filter(Boolean);
  if (industries.length > 0) {
    conditions.push(or(industries.map(ind => simpleFilter("current_employers.company_industries", "(.)", ind))));
  }

  const excludeIndustries = (state.exclude_industries ?? []).filter(Boolean);
  if (excludeIndustries.length > 0) {
    conditions.push(or(excludeIndustries.map(ind => simpleFilter("current_employers.company_industries", "not_in", [ind]))));
  }

  // ─── Verified Business Email ──────────────────────────────────────────────
  if (state.verified_business_email === true) {
    conditions.push(simpleFilter("current_employers.business_email_verified", "=", true));
  }

  // ─── Profile Language ─────────────────────────────────────────────────────
  // Stored as "English (Native or bilingual proficiency)" etc. → use (.) fuzzy per value
  const profileLangs = (state.profile_language ?? []).filter(Boolean);
  if (profileLangs.length > 0) {
    conditions.push(fuzzyOR("profile_language", profileLangs));
  }

  // ─── Education (Optional OR Feature) ──────────────────────────────────────
  const eduConditions: CrustDataFilterTree[] = [];
  
  // Schools are typically from LLM extraction (not autocomplete) → (.) fuzzy
  const schools = (state.education_school ?? []).filter(Boolean);
  if (schools.length > 0) {
    eduConditions.push(fuzzyOR("education_background.institute_name", schools));
  }

  // Degrees are user-typed (e.g. "Bachelor's", "MBA") → (.) fuzzy
  const degrees = (state.education_degree ?? []).filter(Boolean);
  if (degrees.length > 0) {
    eduConditions.push(fuzzyOR("education_background.degree_name", degrees));
  }

  // Field of study is user-typed → (.) fuzzy
  const fields = (state.education_field_of_study ?? []).filter(Boolean);
  if (fields.length > 0) {
    eduConditions.push(fuzzyOR("education_background.field_of_study", fields));
  }

  // Combine Core Role and Education in an OR relationship
  // This supports the "optional not mandatory" intent ("broader usecase scenario")
  // e.g., "Find an Architect OR anyone with a BArch degree"
  if (coreRoleConditions.length > 0 && eduConditions.length > 0) {
    const combinedCore = coreRoleConditions.length === 1 ? coreRoleConditions[0] : and(coreRoleConditions);
    const combinedEdu = eduConditions.length === 1 ? eduConditions[0] : or(eduConditions); // any edu match
    conditions.push(or([combinedCore, combinedEdu]));
  } else {
    conditions.push(...coreRoleConditions);
    conditions.push(...eduConditions);
  }

  // Graduation Year (filter on end_date of education)
  if (typeof state.graduation_year_min === "number") {
    conditions.push(simpleFilter("education_background.end_date", "=>", `${state.graduation_year_min}-01-01`));
  }
  if (typeof state.graduation_year_max === "number") {
    conditions.push(simpleFilter("education_background.end_date", "=<", `${state.graduation_year_max}-12-31`));
  }

  // ─── Languages ────────────────────────────────────────────────────────────
  // Stored as "English (Native or bilingual proficiency)" → (.) fuzzy per value
  const langs = (state.languages ?? []).filter(Boolean);
  if (langs.length > 0) {
    conditions.push(fuzzyOR("languages", langs));
  }

  // ─── Keywords (fuzzy across headline + skills) ────────────────────────────
  // Each keyword is independently checked: headline OR skills must contain it
  const keywords = (state.keywords ?? []).filter(Boolean);
  if (keywords.length > 0) {
    const kwConditions = keywords.map((kw: string) =>
      or([
        simpleFilter("headline", "(.)", kw),
        simpleFilter("skills", "(.)", kw),
      ])
    );
    if (kwConditions.length === 1) {
      conditions.push(kwConditions[0]);
    } else {
      conditions.push(and(kwConditions));
    }
  }

  // ─── Advanced ─────────────────────────────────────────────────────────────
  if (state.recently_changed_jobs) {
    conditions.push(simpleFilter("recently_changed_jobs", "=", true));
  }

  if (typeof state.num_connections_min === "number") {
    conditions.push(simpleFilter("num_of_connections", "=>", state.num_connections_min));
  }

  const exProfiles = (state.exclude_profiles ?? []).filter(Boolean);
  if (exProfiles.length > 0) {
    conditions.push(simpleFilter("linkedin_profile_url", "not_in", exProfiles));
  }

  if (state.full_name?.trim()) {
    conditions.push(simpleFilter("name", "(.)", state.full_name.trim()));
  }

  if (state.headline?.trim()) {
    conditions.push(simpleFilter("headline", "(.)", state.headline.trim()));
  }

  // ─── Assemble ─────────────────────────────────────────────────────────────
  if (conditions.length === 0) {
    return simpleFilter("years_of_experience_raw", "=>", 0);
  }
  if (conditions.length === 1) return conditions[0];
  return and(conditions);
}

// ─── Relaxation Helpers ───────────────────────────────────────────────────────

/**
 * Pass 2: Drop seniority + skills to broaden the result set.
 * Keeps titles, location, experience, industries.
 */
export function buildRelaxedFilters(state: CrustDataFilterState): CrustDataFilterTree {
  const relaxed: CrustDataFilterState = {
    ...state,
    seniority: [],
    skills: [],
    function_category: [],
    keywords: [],
    // Relax boolean expression to first group only
    boolean_expression: state.boolean_expression?.includes(" AND ")
      ? state.boolean_expression.split(/\bAND\b/i)[0].trim()
      : state.boolean_expression,
  };
  return buildCrustDataFilters(relaxed);
}

/**
 * Pass 3: Drop seniority + skills + expand geo radius.
 * Preserves core filters like company, school, and industry.
 */
export function buildExpandedRadiusFilters(state: CrustDataFilterState): CrustDataFilterTree {
  const currentRadius = state.radius_miles ?? 30;
  const relaxed: CrustDataFilterState = {
    ...state,
    seniority: [],
    skills: [],
    function_category: [],
    keywords: [],
    boolean_expression: state.boolean_expression?.includes(" AND ")
      ? state.boolean_expression.split(/\bAND\b/i)[0].trim()
      : state.boolean_expression,
    radius_miles: Math.min(currentRadius * 5, 500),
  };
  return buildCrustDataFilters(relaxed);
}

/**
 * Pass 4: Absolute minimum — drops industries, seniority, skills, keywords.
 * Expands radius fully. Relaxes experience by 4 years.
 * CRITICAL: Spreads `...state` to strictly PRESERVE all hard explicit constraints
 * like `company_names`, `education_school`, `exclude_companies`, `headcount`, etc.
 */
export function buildMinimalFilters(state: CrustDataFilterState): CrustDataFilterTree {
  const minimal: CrustDataFilterState = {
    ...state,
    seniority: [],
    skills: [],
    function_category: [],
    keywords: [],
    company_industries: [], // Drop industry as a last resort to find someone
    boolean_expression: state.boolean_expression?.includes(" AND ")
      ? state.boolean_expression.split(/\bAND\b/i)[0].trim()
      : state.boolean_expression,
    radius_miles: 500,
    experience_min: state.experience_min ? Math.max(0, state.experience_min - 4) : undefined,
  };
  return buildCrustDataFilters(minimal);
}
