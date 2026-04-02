/**
 * lib/crustdata/types.ts
 * TypeScript types for CrustData PersonDB API responses and filter structures.
 */

// ─── Filter Tree ─────────────────────────────────────────────────────────────

export interface CrustDataSimpleFilter {
  column: string;
  filter_type?: string; // alias used in autocomplete filters
  type:
    | "="
    | "!="
    | "in"
    | "not_in"
    | ">"
    | "<"
    | "=>"
    | "=<"
    | "(.)"
    | "[.]"
    | "geo_distance";
  value: string | number | boolean | string[] | number[] | GeoDistanceValue;
}

export interface GeoDistanceValue {
  location: string;
  distance: number;
  unit: "km" | "mi" | "miles" | "m" | "meters" | "ft" | "feet";
}

export interface CrustDataCompoundFilter {
  op: "and" | "or";
  conditions: CrustDataFilterNode[];
}

export type CrustDataFilterNode = CrustDataSimpleFilter | CrustDataCompoundFilter;

// Top-level filter can be a simple filter or a compound filter
export type CrustDataFilterTree = CrustDataFilterNode;

// ─── API Request ──────────────────────────────────────────────────────────────

export interface CrustDataSearchRequest {
  filters: CrustDataFilterTree;
  limit?: number;          // default 20, max 1000
  cursor?: string;         // for pagination (next_cursor from prev response)
  sorts?: CrustDataSort[];
  post_processing?: CrustDataPostProcessing;
  preview?: boolean;       // 0 credits preview mode
}

export interface CrustDataSort {
  column:
    | "person_id"
    | "years_of_experience_raw"
    | "num_of_connections"
    | "name"
    | "recently_changed_jobs"
    | "current_employers.years_at_company_raw"
    | "current_employers.start_date"
    | "current_employers.company_headcount_latest"
    | "region"
    | "location_city"
    | "location_state"
    | "location_country";
  order: "asc" | "desc";
}

export interface CrustDataPostProcessing {
  exclude_profiles?: string[];  // LinkedIn profile URLs to exclude
  exclude_names?: string[];
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface CrustDataSearchResponse {
  profiles: CrustDataPerson[];
  next_cursor: string | null;
  total_count: number;
  error?: string;
}

// ─── Person Object ────────────────────────────────────────────────────────────

export interface CrustDataPerson {
  person_id: number;
  name: string;
  first_name: string;
  last_name: string;
  linkedin_profile_url: string;
  flagship_profile_url: string;
  region: string;
  region_address_components: string[];
  headline: string;
  summary?: string;
  emails: string[];
  twitter_handle?: string;
  profile_picture_url?: string;
  profile_picture_permalink?: string;
  num_of_connections: number;
  open_to_cards?: unknown[];
  recently_changed_jobs: boolean;
  years_of_experience: string;       // categorical, e.g. "More than 10 years"
  years_of_experience_raw: number;   // numeric
  skills: string[];
  languages: string[];
  profile_language?: string;
  current_employers: CrustDataEmployer[];
  past_employers: CrustDataEmployer[];
  all_employers: CrustDataEmployer[];
  education_background: CrustDataEducation[];
  certifications: CrustDataCertification[];
  honors?: CrustDataHonor[];
  location_details?: CrustDataLocationDetails;
  last_updated?: string;
  updated_at?: string;
  // Nexire internal fields added post-fetch:
  _tier?: "EXACT_MATCH" | "RELAXED_SKILLS" | "NEARBY" | "MINIMAL";
  _score?: number;
  _score_breakdown?: ScoreBreakdown;
}

export interface CrustDataLocationDetails {
  city?: string;
  state?: string;
  country?: string;
  continent?: string;
}

export interface CrustDataEmployer {
  name: string;
  linkedin_id?: string;
  company_id?: number;
  company_linkedin_id?: string;
  company_website_domain?: string;
  position_id?: string;
  title: string;
  description?: string;
  location?: string;
  start_date?: string;
  end_date?: string | null;
  employer_is_default?: boolean;
  seniority_level?: string;
  function_category?: string;
  years_at_company?: string;
  years_at_company_raw?: number;
  company_headquarters_country?: string;
  company_hq_location?: string;
  company_hq_location_address_components?: string[];
  company_headcount_range?: string;
  company_headcount_latest?: number;
  company_industries: string[];
  company_linkedin_industry?: string;
  company_type?: string;
  company_website?: string;
  company_linkedin_profile_url?: string;
  business_email_verified?: boolean;
}

export interface CrustDataEducation {
  degree_name?: string;
  field_of_study?: string;
  institute_name?: string;
  institute_linkedin_id?: string;
  institute_linkedin_url?: string;
  institute_logo_url?: string;
  start_date?: string;
  end_date?: string;
  activities_and_societies?: string;
}

export interface CrustDataCertification {
  name?: string;
  issued_date?: string;
  expiration_date?: string;
  url?: string;
  issuer_organization?: string;
  issuer_organization_linkedin_id?: string;
  certification_id?: string;
}

export interface CrustDataHonor {
  title?: string;
  issued_date?: string;
  description?: string;
  issuer?: string;
  media_urls?: string[];
  associated_organization?: string;
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

export interface CrustDataAutocompleteRequest {
  field: string;
  query: string;
  limit?: number;
  filters?: CrustDataFilterNode;
}

export interface CrustDataAutocompleteResponse {
  suggestions: string[];
}

// Realtime Autocomplete (GET endpoint)
export interface CrustDataRealtimeAutocompleteResponse {
  results: string[];
}

// ─── Score Breakdown (Nexire internal) ───────────────────────────────────────

export interface ScoreBreakdown {
  title: number;
  skills: number;
  domain: number;
  location: number;
  experience: number;
  penalty: number;
  total: number;
  matched_skills: string[];
  missing_skills: string[];
}

// ─── Title Mode ──────────────────────────────────────────────────────────────

/**
 * Controls which employer timeline the job title filter targets.
 * - current_only     → current_employers.title (default)
 * - current_recent   → current_employers.title OR past_employers.title within last 2 years
 * - current_and_past → all_employers.title (entire career)
 * - nested_companies → current_employers.title scoped to the same company filter
 * - funding_stage    → current_employers.title scoped to the same funding filter
 */
export type TitleMode =
  | "current_only"
  | "current_recent"
  | "current_and_past"
  | "nested_companies"
  | "funding_stage";

// ─── Nexire CrustData Filter State ───────────────────────────────────────────
// This is the normalized state that useFilterState will use.
// It maps directly to CrustData filter columns.

export interface CrustDataFilterState {
  // Job Titles
  titles?: string[];
  exclude_titles?: string[];
  past_titles?: string[];
  title_mode?: TitleMode; // default: "current_only"

  // Location (geo_distance)
  region?: string; // Kept for backwards compatibility
  regions?: string[];
  radius_km?: number;           // default: 50
  exclude_regions?: string[];
  past_regions?: string[];

  // Experience & Tenure
  experience_min?: number;
  experience_max?: number;
  years_at_company_min?: number;
  years_at_company_max?: number;
  years_at_current_role_min?: number;
  years_at_current_role_max?: number;

  // Skills (maps to CrustData `skills` field)
  skills?: string[];

  // Job details
  seniority?: string[];
  function_category?: string[];
  recently_changed_jobs?: boolean;

  // Company
  company_names?: string[];
  company_match_mode?: "strict" | "boost"; // "strict" = hard filter; "boost" = score signal only
  exclude_company_names?: string[];
  company_headcount_range?: string[];
  company_type?: string[];
  company_hq_location?: string[];
  company_funding_min?: number;   // in millions USD
  company_funding_max?: number;   // in millions USD
  company_revenue_range?: string[];
  company_domains?: string[];

  // Industry
  company_industries?: string[];
  exclude_industries?: string[];

  // Education
  education_school?: string[];
  education_degree?: string[];
  education_field_of_study?: string[];
  graduation_year_min?: number;
  graduation_year_max?: number;

  // Languages
  languages?: string[];

  // Contact quality
  verified_business_email?: boolean;

  // Profile language
  profile_language?: string[];

  // Keywords (fuzzy match against headline + skills)
  keywords?: string[];

  // Advanced
  num_connections_min?: number;
  max_per_company?: number;
  boolean_expression?: string; // string-based boolean search for current_employers.title
  exclude_profiles?: string[]; // linkedIn URLs
  full_name?: string;
  headline?: string;

  // Pagination (not a filter, but stored with state)
  cursor?: string;

  // Custom Ranking configuration array
  ranking_priority?: string[];
}
