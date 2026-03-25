// nexire-app — lib/prospeo/types.ts
// ACCURATE Prospeo API types based on official docs:
// https://prospeo.io/api-docs/search-person
// https://prospeo.io/api-docs/filters-documentation
// https://prospeo.io/api-docs/person-object

// ─── Prospeo Filter Types (exact API contract) ────────────────────────────────

export interface ProspeoJobTitleFilter {
  include?: string[];
  exclude?: string[];
  match_only_exact_job_titles?: boolean;
  /** Cannot be combined with include/exclude */
  boolean_search?: string;
}

export interface ProspeoPersonSeniorityFilter {
  /**
   * Valid values: "C-Suite" | "Director" | "Entry" | "Founder/Owner" |
   * "Head" | "Intern" | "Manager" | "Partner" | "Senior" | "Vice President"
   */
  include?: ProspeoSeniority[];
  exclude?: ProspeoSeniority[];
}

export type ProspeoSeniority =
  | "C-Suite"
  | "Director"
  | "Entry"
  | "Founder/Owner"
  | "Head"
  | "Intern"
  | "Manager"
  | "Partner"
  | "Senior"
  | "Vice President";

export type ProspeoTopDepartment =
  | "C-Suite"
  | "Consulting"
  | "Design"
  | "Education & Coaching"
  | "Engineering & Technical"
  | "Finance"
  | "Human Resources"
  | "Information Technology"
  | "Legal"
  | "Marketing"
  | "Medical & Health"
  | "Operations"
  | "Product"
  | "Sales";

export type ProspeoHeadcountRange =
  | "1-10"
  | "11-20"
  | "21-50"
  | "51-100"
  | "101-200"
  | "201-500"
  | "501-1000"
  | "1001-2000"
  | "2001-5000"
  | "5001-10000"
  | "10000+";

/** Main Prospeo search filters object — maps directly to API */
export interface ProspeoFilters {
  /** Filter by person's first/last/full name */
  person_name?: { include?: string[]; exclude?: string[] };

  /** Quick search across name AND job title */
  person_name_or_job_title?: string;

  /** Filter by job title */
  person_job_title?: ProspeoJobTitleFilter;


  /** Filter by functional department */
  person_department?: {
    include?: ProspeoTopDepartment[];
    exclude?: ProspeoTopDepartment[];
  };

  /** Filter by seniority level */
  person_seniority?: ProspeoPersonSeniorityFilter;

  /**
   * Filter by person's location.
   * IMPORTANT: Location strings must come from the Search Suggestions API.
   * Use "City, State, Country" format for Indian cities.
   */
  person_location_search?: { include?: string[]; exclude?: string[] };

  /** Filter by person's past locations (career history) */
  person_past_location_search?: { include?: string[]; exclude?: string[] };

  /** Filter by availability of verified email/mobile */
  person_contact_details?: {
    email?: ("VERIFIED" | "UNVERIFIED" | "UNAVAILABLE")[];
    mobile?: ("VERIFIED" | "UNVERIFIED" | "UNAVAILABLE")[];
    operator?: "OR" | "AND";
    hide_people_with_details_already_revealed?: boolean;
  };

  /** Limit results per company */
  max_person_per_company?: number;

  /** Filter by total years of professional experience */
  person_year_of_experience?: { min?: number; max?: number };

  /** Filter by months in current role (proxy for notice period) */
  person_time_in_current_role?: { min?: number; max?: number };

  /** Filter by months at current company */
  person_time_in_current_company?: { min?: number; max?: number };

  /** Filter by recent job changes */
  person_job_change?: {
    timeframe_days: 30 | 60 | 90 | 180 | 270 | 365;
    only_promotion?: boolean;
    only_new_company?: boolean;
  };

  // ─── Company filters ──────────────────────────────────────────────────────

  /** Filter by company name or website */
  company?: {
    names?: { include?: string[]; exclude?: string[] };
    websites?: { include?: string[]; exclude?: string[] };
    /** Company tags/categories for broader industry classification */
    tags?: { include?: string[]; exclude?: string[] };
  };

  /** Filter by company HQ location  */
  company_location_search?: { include?: string[]; exclude?: string[] };

  /** Filter by predefined employee count ranges */
  company_headcount_range?: ProspeoHeadcountRange[];

  /** Filter by custom employee count range (cannot use with company_headcount_range) */
  company_headcount_custom?: { min?: number; max?: number };

  /** Filter by company industry */
  company_industry?: { include?: string[]; exclude?: string[] };

  /** Filter by keywords in company data */
  company_keywords?: {
    include?: string[];
    exclude?: string[];
    include_all?: boolean;
    include_company_description?: boolean;
    include_company_description_seo?: boolean;
  };

  /** Filter by company type */
  company_type?: ("Private" | "Public" | "Non Profit" | "Other")[];

  /** Filter by technology stack used by the company */
  company_technology?: { include?: string[]; exclude?: string[] };

  /** Filter by funding stage */
  company_funding?: {
    stage?: string[];
    funding_date?: number;
    last_funding?: { min?: string; max?: string };
    total_funding?: { min?: string; max?: string };
  };

  /** Filter by founding year */
  company_founded?: {
    min?: number;
    max?: number;
    include_unknown_founded?: boolean;
  };

  /** Filter by headcount growth percentage */
  company_headcount_growth?: {
    timeframe_month?: 3 | 6 | 12 | 24;
    min?: number;
    max?: number;
    departments?: string[];
  };

  /** Filter by job posting titles actively hiring */
  company_job_posting_hiring_for?: string[];

  /** Filter by number of active job postings */
  company_job_posting_quantity?: { min?: number; max?: number };
}

// ─── Prospeo API Request ──────────────────────────────────────────────────────

export interface ProspeoSearchRequest {
  filters: ProspeoFilters;
  page: number;
}

// ─── Prospeo Person Object (real response shape) ─────────────────────────────

export interface ProspeoJobHistoryEntry {
  title: string;
  company_name: string;
  logo_url: string | null;
  current: boolean;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  duration_in_months: number | null;
  departments: string[];
  seniority: string;
  company_id: string | null;
  job_key: string | null;
}

export interface ProspeoPersonEmail {
  status: "VERIFIED" | "UNVERIFIED" | "CATCH_ALL" | "UNAVAILABLE";
  revealed: boolean;
  email: string | null;
  verification_method?: string;
  email_mx_provider?: string;
}

export interface ProspeoPersonMobile {
  status: "VERIFIED" | "UNVERIFIED" | "UNAVAILABLE";
  revealed: boolean;
  mobile: string | null;
  mobile_national: string | null;
  mobile_international: string | null;
  mobile_country: string | null;
  mobile_country_code: string | null;
}

export interface ProspeoPersonLocation {
  country: string | null;
  country_code: string | null;
  state: string | null;
  city: string | null;
  time_zone: string | null;
  time_zone_offset: number | null;
}

export interface ProspeoPersonObject {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  linkedin_url: string | null;
  current_job_title: string | null;
  current_job_key: string | null;
  headline: string | null;
  linkedin_member_id: string | null;
  last_job_change_detected_at: string | null;
  job_history: ProspeoJobHistoryEntry[];
  mobile: ProspeoPersonMobile | null;
  email: ProspeoPersonEmail | null;
  location: ProspeoPersonLocation | null;
  skills: string[];
}

export interface ProspeoCompanyObject {
  company_id?: string | null;
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
  linkedin_url?: string | null;
  headcount?: number | null;
  location?: {
    country?: string | null;
    state?: string | null;
    city?: string | null;
  } | null;
}

/** Each result from /search-person: { person, company } */
export interface ProspeoSearchResult {
  person: ProspeoPersonObject;
  company?: ProspeoCompanyObject | null;
}

export interface ProspeoSearchResponse {
  error: boolean;
  /** Present on error responses */
  error_code?: string;
  /** Present on filter validation errors */
  filter_error?: string;
  message?: string;
  /** Total matching results (across all pages) */
  total?: number;
  /** Some responses use total_count */
  total_count?: number;
  /** Array of { person, company } objects — 25 per page */
  results?: ProspeoSearchResult[];
  pagination?: {
    current_page: number;
    per_page: number;
    total_page: number;
    total_count: number;
  };
}

// ─── Nexire Internal Types ────────────────────────────────────────────────────

/** Nexire processed candidate — ready for DB upsert and UI display */
export interface ProcessedCandidate {
  person_id: string;               // Prospeo person_id (stable — use as unique key)
  full_name: string;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  experience_years: number | null;
  skills: string[];
  linkedin_url: string | null;
  job_history_json: ProspeoJobHistoryEntry[];
  // Nexire-computed
  estimated_notice_days: number | null;
  notice_label: string | null;
  // Contact (only after reveal)
  email: string | null;
  phone: string | null;
}

/**
 * Nexire user-facing search filters.
 * This is what the UI sends → Gemini converts to ProspeoFilters.
 * Also includes India-specific fields that Prospeo doesn't have natively.
 */
export interface NexireSearchFilters {
  // Maps to Prospeo person_job_title.include
  job_title?: string[];
  similar_job_titles?: string[];
  // Maps to Prospeo person_location_search.include
  location?: string[];
  // Maps to Prospeo person_job_title.boolean_search (via Gemini)
  skills?: string[];
  // Maps to Prospeo person_seniority.include (via buildProspeoFilters mapping)
  seniority?: string[];
  // Maps to Prospeo company.names.include
  company?: string[];
  // Maps to Prospeo company_industry.include
  industry?: string[];
  // Maps to Prospeo company_headcount_range
  company_size?: ProspeoHeadcountRange[];
  // Maps to Prospeo person_year_of_experience
  min_experience_years?: number;
  max_experience_years?: number;
  // ── India-specific ──────────────────────────────────────────────────
  // Maps to Prospeo person_time_in_current_role.max (notice period proxy)
  // Logic: long tenure = long notice; max 90 days at current role ≈ ≤180 mo
  notice_max_days?: 15 | 30 | 60 | 90 | null;
  // ── Natural language query (passed to Gemini for filter generation) ──
  natural_query?: string;
}

/** Gemini-generated filter JSON that maps to ProspeoFilters */
export interface GeminiFilterResult {
  filters: ProspeoFilters;
  /** Explanation of what was parsed (for debugging) */
  reasoning?: string;
}
