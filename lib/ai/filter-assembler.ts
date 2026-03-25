/**
 * lib/ai/filter-assembler.ts
 * Phase 3 — Assembles CrustData filter tree (AND/OR nested conditions)
 * from LLM-extracted signals + CrustData autocomplete-resolved values.
 *
 * Replaces the old Prospeo flat-JSON assembler.
 * Uses the same filter-builder logic as FilterModal → consistent filters.
 */

import type { LLMExtractedFilters } from "./extractor";
import { buildCrustDataFilters } from "@/lib/crustdata/filter-builder";
import { resolveCrustDataIndustries } from "@/lib/crustdata/industry-map";
import type { CrustDataFilterState, CrustDataFilterNode } from "@/lib/crustdata/types";

// ─── Input from context-to-filters route ──────────────────────────────────────
export interface CrustDataAssemblerInput {
  extracted: LLMExtractedFilters;
  /** CrustData autocomplete-resolved job titles (from `/api/suggestions?source=crustdata&field=title`) */
  resolvedTitles: string[];
  /** CrustData autocomplete-resolved region strings (from `/api/suggestions?source=crustdata&field=region`) */
  resolvedRegions: string[];
  /**
   * Set2 vector-resolved industry values (canonical CrustData strings).
   * If provided, bypasses the static resolveCrustDataIndustries() map.
   */
  resolvedIndustries?: string[];
  /** Radius in miles to use for geo_distance filter (default: 30) */
  radiusMiles?: number;
  /** Boolean search expression (preserved for CrustData `current_employers.title` field if strategy=boolean) */
  booleanSearchExpression?: string | null;
}

// ─── Output mirrors the existing assembleProspeoFilters interface ──────────────
export interface CrustDataAssemblerOutput {
  /** The full CrustData AND/OR filter tree — pass directly to PersonDB search */
  filterTree: CrustDataFilterNode | null;
  /** The CrustDataFilterState that was assembled — can be used in FilterModal */
  filterState: CrustDataFilterState;
}

/**
 * Map seniority strings from LLM extraction to CrustData `current_employers.seniority_level` values.
 * Only uses VALID CrustData seniority level strings.
 */
function mapSeniorityToCrustData(levels: string[]): string[] {
  const MAP: Record<string, string[]> = {
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
  // Valid CrustData seniority values (pass-through if already exact)
  const VALID = new Set([
    "Owner / Partner", "CXO", "Vice President", "Director",
    "Experienced Manager", "Entry Level Manager", "Strategic",
    "Senior", "Entry Level", "In Training",
  ]);
  return Array.from(new Set(
    levels.flatMap((l) => {
      if (VALID.has(l)) return [l];
      return MAP[l.toLowerCase()] ?? [];
    }).filter(Boolean)
  ));
}

/**
 * Map CrustData headcount range strings to CrustData `current_employers.company_headcount_range` enum values.
 * CrustData uses same range strings as Prospeo (1-10, 11-50, etc.) — no mapping needed.
 */
function mapHeadcountToCrustData(ranges: string[]): string[] {
  // CrustData accepts the same range strings; just normalise to valid values.
  const VALID = new Set([
    "1-10", "11-20", "21-50", "51-100", "101-200", "201-500",
    "501-1000", "1001-2000", "2001-5000", "5001-10000", "10000+"
  ]);
  return ranges.filter(r => VALID.has(r));
}

// ─── Conceptual Mapping Logic ───────────────────────────────────────────────

const CONCEPTUAL_MAPS = {
  tier1: {
    schools: [
      "Indian Institute of Technology", "IIT", "Indian Institute of Management", "IIM",
      "Birla Institute of Technology and Science", "BITS Pilani", "Delhi Technological University",
      "DTU", "National Institute of Technology", "NIT", "Stanford University", "Harvard University",
      "Massachusetts Institute of Technology", "MIT", "Indian School of Business", "ISB"
    ],
  },
  top_product: {
    companies: [
      "Google", "Microsoft", "Amazon", "Meta", "Apple", "Netflix", "Uber", "Lyft", "Airbnb",
      "Stripe", "Palantir", "Atlassian", "Salesforce", "Adobe", "Oracle", "Cisco"
    ],
  },
  fintech: {
    industries: ["Financial Services", "Banking", "Capital Markets", "Insurance"],
    skills: ["Blockchain", "Cryptocurrency", "Payments", "Trading Systems", "Risk Management"]
  }
};

/**
 * Automatically expand high-level concepts (e.g., "tier 1", "top product companies")
 * into specific CrustData filter clusters.
 */
function applyConceptualMapping(extracted: LLMExtractedFilters, filterState: CrustDataFilterState) {
  const keywords = (extracted.raw_keywords ?? []).join(" ").toLowerCase();
  const rawOther = (extracted.raw_company_type ?? "").toLowerCase();

  // 1. Tier 1 / Ivy League Check
  if (keywords.includes("tier 1") || keywords.includes("ivy league") || keywords.includes("top university")) {
    filterState.education_school = Array.from(new Set([
      ...(filterState.education_school ?? []),
      ...CONCEPTUAL_MAPS.tier1.schools
    ]));
  }

  // 2. Top Product / FAANG Check
  if (keywords.includes("top product") || keywords.includes("faang") || keywords.includes("maang") || rawOther.includes("product company")) {
    filterState.company_names = Array.from(new Set([
      ...(filterState.company_names ?? []),
      ...CONCEPTUAL_MAPS.top_product.companies
    ]));
  }

  // 3. Fintech Specific
  if (keywords.includes("fintech") || keywords.includes("financial technology")) {
    filterState.company_industries = Array.from(new Set([
      ...(filterState.company_industries ?? []),
      ...CONCEPTUAL_MAPS.fintech.industries
    ]));
    filterState.skills = Array.from(new Set([
      ...(filterState.skills ?? []),
      ...CONCEPTUAL_MAPS.fintech.skills
    ]));
  }
}

// ─── Main assembler ────────────────────────────────────────────────────────────
export function assembleCrustDataFilters(input: CrustDataAssemblerInput): CrustDataAssemblerOutput {
  const {
    extracted,
    resolvedTitles,
    resolvedRegions,
    radiusMiles = 30,
    booleanSearchExpression,
  } = input;

  // ── 1. Build CrustDataFilterState from extracted signals ────────────────────
  const filterState: CrustDataFilterState = {};

  // Job titles: prefer CrustData autocomplete resolved → merge with LLM extracted
  // Cap at 8 titles — too many synonyms dilute results (e.g. "Operations Manager" matches everyone)
  // Core rule: put the most specific/primary titles first, generics last.
  const coreTitles = resolvedTitles.filter(Boolean);
  const extraTitles = [
    ...(extracted.raw_job_titles ?? []),
    ...(extracted.similar_job_titles ?? []),
  ].filter(t => !coreTitles.includes(t));
  const allTitles = Array.from(new Set([...coreTitles, ...extraTitles])).slice(0, 8);

  // STRATEGY ENFORCEMENT: Filter-First
  // If we have specific job titles, use them and IGNORE boolean expression to prevent over-constraining.
  // We only use boolean_expression if we have ZERO titles to work with.
  if (allTitles.length > 0) {
    filterState.titles = allTitles;
    filterState.boolean_expression = undefined; // Force disable boolean if titles exist
  } else if (booleanSearchExpression?.trim()) {
    filterState.boolean_expression = booleanSearchExpression;
  }

  // Location: geo_distance from CrustData autocomplete resolved regions
  const allRegions = Array.from(new Set([
    ...resolvedRegions,
    ...(extracted.similar_locations ?? []),
  ])).filter(Boolean);

  if (allRegions.length > 0) {
    filterState.regions = allRegions;
    filterState.region = allRegions[0]; // Kept for backwards compatibility
    filterState.radius_miles = radiusMiles;
  } else if (extracted.raw_location) {
    filterState.regions = [extracted.raw_location];
    filterState.region = extracted.raw_location;
    filterState.radius_miles = radiusMiles;
  }

  // Recruiter Intuition Rule (Experience)
  // If experience_min is provided, we apply a -2 year buffer (capped at 0)
  // to broaden the search and avoid excluding highly qualified but "slightly under-exp" talent.
  if (extracted.raw_experience_min !== null && extracted.raw_experience_min !== undefined) {
    const experienceMin = Math.max(0, extracted.raw_experience_min - 2);
    filterState.experience_min = experienceMin;
  }
  
  // We generally drop experience_max unless it's strictly required
  if (extracted.raw_experience_max !== null && extracted.raw_experience_max !== undefined) {
    filterState.experience_max = extracted.raw_experience_max;
  }

  // ── Seniority ─────────────────────────────────────────────────────────────
  // KEY RULE: Only apply seniority when the user EXPLICITLY mentions a seniority
  // keyword (senior, junior, director, VP, C-suite, founder, etc.).
  //
  // Problem: LLM often infers "manager" seniority from a title like "Fleet Manager".
  // This maps to ["Experienced Manager", "Entry Level Manager"] and eliminates
  // everyone whose CrustData seniority_level is blank, "Senior", or "Strategic",
  // even if they hold the exact title. The title filter already implies the seniority.
  //
  // SKIP seniority if:
  //   (a) The ONLY mapped values are manager-level AND we already have title filters
  //   (b) experience_min >= 8 AND seniority is not high-level (VP/CXO/Director)
  //
  // APPLY seniority if user says: "senior", "junior", "director", "VP", "C-level",
  // "entry level", "fresher", "founder" — terms that can't be inferred from title.
  const EXPLICIT_SENIORITY_SIGNALS = [
    "senior", "junior", "fresher", "intern", "trainee", "director", "vp",
    "vice president", "cxo", "c-suite", "c-level", "ceo", "cto", "coo",
    "founder", "entry level", "head of", "partner",
  ];
  const rawContext = [
    ...(extracted.raw_job_titles ?? []),
    ...(extracted.raw_keywords ?? []),
    extracted.boolean_search_expression ?? "",
  ].join(" ").toLowerCase();
  const seniorityIsExplicit = EXPLICIT_SENIORITY_SIGNALS.some(sig => rawContext.includes(sig));

  const hasExpMin = (filterState.experience_min ?? 0) > 0;
  if (Array.isArray(extracted.person_seniority) && extracted.person_seniority.length > 0 && seniorityIsExplicit) {
    const seniority = mapSeniorityToCrustData(extracted.person_seniority);
    const MANAGER_ONLY = new Set(["Experienced Manager", "Entry Level Manager"]);
    const isOnlyManagerLevel = seniority.length > 0 && seniority.every(s => MANAGER_ONLY.has(s));

    if (isOnlyManagerLevel && allTitles.length > 0) {
      // Title filter already handles manager-level — seniority would only cause false negatives
      filterState.seniority = undefined;
    } else if (hasExpMin && extracted.raw_experience_min && extracted.raw_experience_min >= 8) {
      const isHighLevel = seniority.some(s => ["Vice President", "CXO", "Director"].includes(s));
      if (isHighLevel) {
        filterState.seniority = Array.from(new Set([...seniority, "Senior", "Experienced Manager"]));
      } else {
        filterState.seniority = undefined;
      }
    } else {
      filterState.seniority = seniority;
    }
  }

  // ── Destructure resolvedIndustries from input ────────────────────────────
  const { resolvedIndustries: preResolvedIndustries } = input;

  // Skills: from raw_tech field (CrustData `skills` column)
  if (Array.isArray(extracted.raw_tech) && extracted.raw_tech.length > 0) {
    filterState.skills = extracted.raw_tech.slice(0, 15);
  }

  // Industries: use pre-resolved Set2 vector search results if available.
  // Fallback: check if raw values look like CrustData taxonomy, else use static map.
  if (preResolvedIndustries && preResolvedIndustries.length > 0) {
    // Vector search resolved canonical CrustData industry strings — use directly, max 6
    filterState.company_industries = preResolvedIndustries.slice(0, 6);
  } else {
    const rawIndustries = [
      ...(extracted.raw_industry ?? []),
      ...(extracted.similar_industries ?? []),
    ].filter(Boolean);

    if (rawIndustries.length > 0) {
      const seemsResolved = rawIndustries.some((i: string) => i.includes(" ") && i.length > 5);
      if (seemsResolved) {
        filterState.company_industries = rawIndustries.slice(0, 4) as string[];
      } else {
        const fallbackIndustries = resolveCrustDataIndustries(rawIndustries as string[]);
        if (fallbackIndustries.length > 0) {
          filterState.company_industries = fallbackIndustries.slice(0, 8);
        }
      }
    }
  }
  // Company Headcount
  if (Array.isArray(extracted.company_headcount_range) && extracted.company_headcount_range.length > 0) {
    filterState.company_headcount_range = mapHeadcountToCrustData(extracted.company_headcount_range);
  }

  // Education
  if (Array.isArray(extracted.raw_school) && extracted.raw_school.length > 0) {
    filterState.education_school = extracted.raw_school;
  }
  if (Array.isArray(extracted.raw_degree) && extracted.raw_degree.length > 0) {
    filterState.education_degree = extracted.raw_degree;
  }
  if (Array.isArray(extracted.raw_field_of_study) && extracted.raw_field_of_study.length > 0) {
    filterState.education_field_of_study = extracted.raw_field_of_study;
  }

  // Languages
  if (Array.isArray(extracted.languages) && extracted.languages.length > 0) {
    filterState.languages = extracted.languages;
  }

  // Company HQ
  if (Array.isArray(extracted.company_hq_location) && extracted.company_hq_location.length > 0) {
    filterState.company_hq_location = extracted.company_hq_location;
  }

  // Exclusions
  if (Array.isArray(extracted.exclude_job_titles) && extracted.exclude_job_titles.length > 0) {
    filterState.exclude_titles = extracted.exclude_job_titles;
  }
  if (Array.isArray(extracted.exclude_companies) && extracted.exclude_companies.length > 0) {
    filterState.exclude_company_names = extracted.exclude_companies;
  }
  if (Array.isArray(extracted.exclude_industries) && extracted.exclude_industries.length > 0) {
    filterState.exclude_industries = extracted.exclude_industries;
  }

  // Tenure
  if (extracted.time_in_current_role_min !== null) {
    filterState.years_at_current_role_min = Math.floor(extracted.time_in_current_role_min / 12);
  }
  if (extracted.time_in_current_role_max !== null) {
    filterState.years_at_current_role_max = Math.ceil(extracted.time_in_current_role_max / 12);
  }
  if (extracted.time_in_current_company_min !== null) {
    filterState.years_at_company_min = Math.floor(extracted.time_in_current_company_min / 12);
  }
  if (extracted.time_in_current_company_max !== null) {
    filterState.years_at_company_max = Math.ceil(extracted.time_in_current_company_max / 12);
  }

  // Advanced: keywords — DISABLED for Pass 1 to avoid zero results.
  // Industry-jargon keywords like "OEM", "Contractors", "Panel Builders" are NOT LinkedIn skill tags.
  // They cause 0-result passes. Keywords are kept in filterState only for display; building is skipped.
  // To add this back later, guard it behind a flag or only include confirmed LinkedIn-indexed skills.
  if (Array.isArray(extracted.raw_keywords) && extracted.raw_keywords.length > 0) {
    // Only add as non-indexed keywords if the list consists of genuine skill strings
    // (tech stack, certifications, etc.), not industry jargon.
    const SAFE_KEYWORD_PATTERNS = /^(iso|six sigma|sap|erp|crm|bom|plc|vfd|hmi|scada|autocad|matlab)/i;
    const safeKeywords = extracted.raw_keywords.filter((kw: string) => SAFE_KEYWORD_PATTERNS.test(kw.trim()));
    if (safeKeywords.length > 0) {
      filterState.keywords = safeKeywords.slice(0, 3);
    }
  }

  // ── 1.5 Apply Conceptual Mapping (Self-Correction/Expansion) ────────────────
  applyConceptualMapping(extracted, filterState);

  // ── 2. Convert filterState → CrustData AND/OR filter tree ──────────────────
  const filterTree = buildCrustDataFilters(filterState);

  return { filterTree, filterState };
}
