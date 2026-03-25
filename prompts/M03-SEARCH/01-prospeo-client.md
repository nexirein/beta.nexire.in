<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

M03 — TASK 01: PROSPEO API CLIENT + TYPES + INDIA FILTERS
Trae: Read CLAUDE.md first. This is the ONLY file that talks to Prospeo.
PROSPEO_API_KEY is SERVER-SIDE ONLY — never expose to client.
Nexire builds 3 India-specific filters ON TOP of Prospeo (not from Prospeo).
After completion, append to _meta/BUILD-LOG.md
CRITICAL: What Prospeo Does NOT Have (Nexire Builds These)
┌─────────────────────┬────────────────────────────────────────────────────────┐
│ Filter │ How Nexire Handles It │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Notice period │ Estimated from duration_in_months at current job │
│ CTC in LPA │ Manual field — recruiter fills when shortlisting │
│ WhatsApp link │ Generated from revealed phone: wa.me/?text=... │
└─────────────────────┴────────────────────────────────────────────────────────┘

FILE 1 — lib/prospeo/types.ts
typescript
// nexire-app — lib/prospeo/types.ts
// Prospeo API response types

export interface ProspeoSearchFilter {
  job_title?: string[];
  company?: string[];
  location?: string[];
  skills?: string[];
  seniority?: ("entry" | "junior" | "mid" | "senior" | "director" | "vp" | "c_suite")[];
  industry?: string[];
  min_employee?: number;
  max_employee?: number;
  keywords?: string[];
  not_job_title?: string[];
  not_company?: string[];
  not_location?: string[];
}

export interface ProspeoSearchRequest {
  filters: ProspeoSearchFilter;
  limit: number;     // 1–25 per page
  page?: number;     // starts at 1
}

export interface ProspeoPosition {
  title: string;
  company: string;
  start_date?: string;   // "YYYY-MM" format
  end_date?: string;     // "YYYY-MM" or null if current
  duration_in_months?: number;
  is_current: boolean;
}

export interface ProspeoEducation {
  school: string;
  degree?: string;
  field?: string;
  start_year?: number;
  end_year?: number;
}

export interface ProspeoProfile {
  id: string;                  // Prospeo's internal ID — use as prospeo_id
  full_name: string;
  headline?: string;
  location?: string;           // "City, State, Country" format
  linkedin_url?: string;
  skills?: string[];
  positions?: ProspeoPosition[];
  educations?: ProspeoEducation[];
  emails?: { email: string; type: string; status: string }[];
  phones?: { number: string; type: string }[];
}

export interface ProspeoSearchResponse {
  status: "success" | "error";
  data: {
    profiles: ProspeoProfile[];
    total: number;
    page: number;
    has_more: boolean;
  };
  error?: string;
}

export interface ProspeoEmailFindRequest {
  linkedin_url?: string;
  first_name?: string;
  last_name?: string;
  company_domain?: string;
  prospeo_id?: string;
}

export interface ProspeoEmailFindResponse {
  status: "success" | "error";
  email?: string;
  email_status?: "VERIFIED" | "UNVERIFIED" | "CATCH_ALL";
  error?: string;
}

export interface ProspeoPhoneFindResponse {
  status: "success" | "error";
  phone?: string;
  phone_status?: "VERIFIED";
  email?: string;
  email_status?: "VERIFIED" | "UNVERIFIED";
  error?: string;
}

// Nexire-internal: result after processing a Prospeo profile
export interface ProcessedCandidate {
  prospeo_id: string;
  full_name: string;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location_city: string | null;
  location_state: string | null;
  experience_years: number | null;
  skills: string[];
  linkedin_url: string | null;
  work_history_json: ProspeoPosition[];
  education_json: ProspeoEducation[];
  // Nexire computed
  estimated_notice_days: number | null;   // from tenure
  notice_label: string | null;            // "~15d" | "~30d" | "~60d" | "~90d+"
}

// Nexire search filters (superset of Prospeo)
export interface NexireSearchFilters {
  // Sent to Prospeo
  job_title?: string[];
  location?: string[];
  skills?: string[];
  seniority?: string[];
  company?: string[];
  keywords?: string[];
  not_job_title?: string[];
  // Nexire-side filters (applied after Prospeo returns)
  notice_max_days?: 15 | 30 | 60 | 90 | null;
  min_experience_years?: number;
  max_experience_years?: number;
}
FILE 2 — lib/prospeo/client.ts [CRITICAL — only file calling Prospeo]
typescript
// nexire-app — lib/prospeo/client.ts
// ALL Prospeo API calls go here. Never import this in client components.

import type {
  ProspeoSearchRequest, ProspeoSearchResponse,
  ProspeoEmailFindRequest, ProspeoEmailFindResponse,
  ProspeoPhoneFindResponse, ProspeoProfile, ProcessedCandidate
} from "./types";

const PROSPEO_BASE = "https://api.prospeo.io";
const PROSPEO_API_KEY = process.env.PROSPEO_API_KEY!;

// ─── Core fetch wrapper ────────────────────────────────────
async function prospeoFetch<T>(
  path: string,
  body: Record<string, any>
): Promise<T> {
  if (!PROSPEO_API_KEY) throw new Error("PROSPEO_API_KEY not set");

  const res = await fetch(`${PROSPEO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": PROSPEO_API_KEY,
    },
    body: JSON.stringify(body),
    // No caching at fetch level — handled by Upstash Redis
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Prospeo API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── 1. Search (1 credit per page of 25) ─────────────────
export async function prospeoSearch(
  filters: ProspeoSearchRequest["filters"],
  page: number = 1,
  limit: number = 25
): Promise<ProspeoSearchResponse> {
  return prospeoFetch<ProspeoSearchResponse>("/linkedin-search", {
    filters,
    limit: Math.min(limit, 25),
    page,
  });
}

// ─── 2. Email reveal (1 credit = 1 Prospeo credit) ───────
export async function prospeoFindEmail(
  req: ProspeoEmailFindRequest
): Promise<ProspeoEmailFindResponse> {
  return prospeoFetch<ProspeoEmailFindResponse>("/email-finder", req);
}

// ─── 3. Phone + Email reveal (8 Nexire = 10 Prospeo) ─────
export async function prospeoFindPhone(
  linkedinUrl: string
): Promise<ProspeoPhoneFindResponse> {
  return prospeoFetch<ProspeoPhoneFindResponse>("/mobile-finder", {
    url: linkedinUrl,
  });
}

// ─── 4. Check if candidate already enriched (free) ───────
export async function prospeoGetEnriched(
  linkedinUrl: string
): Promise<ProspeoEmailFindResponse> {
  // Re-enriching already-enriched profiles is FREE in Prospeo
  return prospeoFetch<ProspeoEmailFindResponse>("/email-finder", {
    linkedin_url: linkedinUrl,
  });
}

// ─── 5. Profile processor: Prospeo → Nexire format ───────
export function processProspeoProfile(profile: ProspeoProfile): ProcessedCandidate {
  const current = profile.positions?.find(p => p.is_current);
  const allPositions = profile.positions ?? [];

  // Parse location: "Bangalore, Karnataka, India" → city + state
  const locationParts = (profile.location ?? "").split(",").map(s => s.trim());
  const location_city  = locationParts || null;
  const location_state = locationParts || null;

  // Total experience: sum all position durations
  const experience_months = allPositions.reduce(
    (sum, p) => sum + (p.duration_in_months ?? 0), 0
  );
  const experience_years = experience_months > 0
    ? Math.round(experience_months / 12)
    : null;

  // Notice period estimate from current job tenure
  const { days: estimated_notice_days, label: notice_label } =
    estimateNoticePeriod(current?.duration_in_months ?? null);

  return {
    prospeo_id:          profile.id,
    full_name:           profile.full_name,
    headline:            profile.headline ?? null,
    current_title:       current?.title ?? null,
    current_company:     current?.company ?? null,
    location_city,
    location_state,
    experience_years,
    skills:              profile.skills ?? [],
    linkedin_url:        profile.linkedin_url ?? null,
    work_history_json:   allPositions,
    education_json:      profile.educations ?? [],
    estimated_notice_days,
    notice_label,
  };
}

// ─── 6. Notice Period Estimator ───────────────────────────
// Logic: longer tenure at current company = longer notice period
// Indian white-collar norms: <1yr=15d, 1-2yr=30d, 2-4yr=60d, 4yr+=90d
export function estimateNoticePeriod(tenureMonths: number | null): {
  days: number | null;
  label: string | null;
} {
  if (tenureMonths === null || tenureMonths === undefined) {
    return { days: null, label: null };
  }
  if (tenureMonths < 12)  return { days: 15,  label: "~15d (est.)" };
  if (tenureMonths < 24)  return { days: 30,  label: "~30d (est.)" };
  if (tenureMonths < 48)  return { days: 60,  label: "~60d (est.)" };
  return                          { days: 90,  label: "~90d+ (est.)" };
}

// ─── 7. WhatsApp Link Generator ───────────────────────────
// India-specific feature — wa.me job link
export function generateWhatsAppJobLink(
  phone: string,
  jobTitle: string,
  recruiterName: string,
  companyName?: string
): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
  const message = encodeURIComponent(
    `Hi ${recruiterName ? "I'm " + recruiterName : "there"},

I came across your profile and wanted to reach out about an exciting ${jobTitle} opportunity${companyName ? " at " + companyName : ""}.

Would you be open to a quick chat?

— Sent via Nexire`
  );
  return `https://wa.me/${intlPhone}?text=${message}`;
}
FILE 3 — lib/prospeo/filters.ts [Filter builder — Prospeo API format]
typescript
// nexire-app — lib/prospeo/filters.ts
// Converts NexireSearchFilters → Prospeo API filter format

import type { NexireSearchFilters, ProspeoSearchFilter } from "./types";

// Indian cities → Prospeo location format
// Prospeo expects "City, Country" or "City, State, Country"
const INDIA_LOCATION_MAP: Record<string, string[]> = {
  "Mumbai":      ["Mumbai, Maharashtra, India", "Navi Mumbai, Maharashtra, India"],
  "Delhi":       ["New Delhi, Delhi, India", "Delhi, India"],
  "Bangalore":   ["Bangalore, Karnataka, India", "Bengaluru, Karnataka, India"],
  "Hyderabad":   ["Hyderabad, Telangana, India"],
  "Chennai":     ["Chennai, Tamil Nadu, India"],
  "Pune":        ["Pune, Maharashtra, India"],
  "Kolkata":     ["Kolkata, West Bengal, India"],
  "Ahmedabad":   ["Ahmedabad, Gujarat, India"],
  "Noida":       ["Noida, Uttar Pradesh, India"],
  "Gurgaon":     ["Gurgaon, Haryana, India", "Gurugram, Haryana, India"],
  "Kochi":       ["Kochi, Kerala, India"],
  "Chandigarh":  ["Chandigarh, India"],
  "Indore":      ["Indore, Madhya Pradesh, India"],
  "Remote":      [],   // no location filter for remote
  "Pan India":   [],   // no location filter for pan india
};

export function buildProspeoFilters(nexireFilters: NexireSearchFilters): ProspeoSearchFilter {
  const filters: ProspeoSearchFilter = {};

  // Job titles
  if (nexireFilters.job_title?.length) {
    filters.job_title = nexireFilters.job_title;
  }

  // Location — map Indian city names to Prospeo format
  if (nexireFilters.location?.length) {
    const prospeoLocations: string[] = [];
    for (const loc of nexireFilters.location) {
      const mapped = INDIA_LOCATION_MAP[loc];
      if (mapped && mapped.length > 0) {
        prospeoLocations.push(...mapped);
      } else if (!mapped) {
        // Not in map — pass through as-is
        prospeoLocations.push(loc);
      }
      // Remote/Pan India = no location filter (skip)
    }
    if (prospeoLocations.length > 0) {
      filters.location = prospeoLocations;
    }
  }

  // Skills
  if (nexireFilters.skills?.length) {
    filters.skills = nexireFilters.skills;
  }

  // Seniority
  if (nexireFilters.seniority?.length) {
    filters.seniority = nexireFilters.seniority as ProspeoSearchFilter["seniority"];
  }

  // Company
  if (nexireFilters.company?.length) {
    filters.company = nexireFilters.company;
  }

  // Keywords
  if (nexireFilters.keywords?.length) {
    filters.keywords = nexireFilters.keywords;
  }

  // Exclude titles
  if (nexireFilters.not_job_title?.length) {
    filters.not_job_title = nexireFilters.not_job_title;
  }

  return filters;
}

// NOTE: notice_max_days, min/max_experience_years are applied
// AFTER Prospeo returns results — not sent to Prospeo API.
// See lib/ai/scorer.ts for post-processing filter logic.
COMPLETION CHECKLIST
 lib/prospeo/types.ts — all types including ProcessedCandidate + NexireSearchFilters

 lib/prospeo/client.ts — 7 functions: search, email, phone, enriched, processProfile, estimateNotice, generateWhatsApp

 lib/prospeo/filters.ts — buildProspeoFilters with India city mapping

 estimateNoticePeriod() logic: <12mo=15d, <24mo=30d, <48mo=60d, 4yr+=90d

 generateWhatsAppJobLink() produces valid wa.me URL

 PROSPEO_API_KEY never referenced in any client component

 All functions are exported from index — no barrel file needed

BUILD LOG ENTRY
M03-01 Prospeo Client — [date]
Files: lib/prospeo/types.ts, lib/prospeo/client.ts, lib/prospeo/filters.ts
India Filters: notice (estimated), CTC (manual), WhatsApp (generated)
Status: ✅ Complete