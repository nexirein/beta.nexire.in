// nexire-app — lib/prospeo/filters.ts
// Converts NexireSearchFilters (from UI) → ProspeoFilters (API format)
// The Gemini route (lib/ai/gemini-filter.ts) is the primary path for natural queries.
// This is the secondary path for explicit UI-panel filter selections.

import type {
  NexireSearchFilters,
  ProspeoFilters,
} from "./types";
import { mapSeniorityToProspeo } from "../seniority-mapper";

// India city → Prospeo location string mapping
// Must match Prospeo's Search Suggestions API format exactly
const INDIA_LOCATION_MAP: Record<string, string> = {
  Mumbai: "Mumbai, Maharashtra, India",
  Delhi: "Delhi, India",
  Bangalore: "Bangalore, Karnataka, India",
  Bengaluru: "Bangalore, Karnataka, India",
  Hyderabad: "Hyderabad, Telangana, India",
  Chennai: "Chennai, Tamil Nadu, India",
  Pune: "Pune, Maharashtra, India",
  Kolkata: "Kolkata, West Bengal, India",
  Noida: "Noida, Uttar Pradesh, India",
  Gurgaon: "Gurugram, Haryana, India",
  Gurugram: "Gurugram, Haryana, India",
  Kochi: "Kochi, Kerala, India",
  Chandigarh: "Chandigarh, India",
  Ahmedabad: "Ahmedabad, Gujarat, India",
  Indore: "Indore, Madhya Pradesh, India",
  Jaipur: "Jaipur, Rajasthan, India",
};

/**
 * Convert NexireSearchFilters (UI selections) to Prospeo API filter format.
 * Used for explicit filter-panel selections (not natural language queries).
 */
export function buildProspeoFilters(
  nexireFilters: NexireSearchFilters
): ProspeoFilters {
  const filters: ProspeoFilters = {};

  // ── Job Titles ─────────────────────────────────────────────────────────────
  if (nexireFilters.job_title?.length) {
    filters.person_job_title = {
      include: nexireFilters.job_title,
      match_only_exact_job_titles: false,
    };
  }

  // ── Location ───────────────────────────────────────────────────────────────
  if (nexireFilters.location?.length) {
    const include: string[] = [];
    for (const loc of nexireFilters.location) {
      if (["Remote", "Pan India"].includes(loc)) continue; // no location filter
      const mapped = INDIA_LOCATION_MAP[loc];
      if (mapped) {
        include.push(mapped);
      } else {
        include.push(loc); // pass through unknown locations as-is
      }
    }
    if (include.length > 0) {
      filters.person_location_search = { include: Array.from(new Set(include)) };
    }
  }

  // ── Seniority ──────────────────────────────────────────────────────────────
  if (nexireFilters.seniority?.length) {
    const prospeoSeniorities = mapSeniorityToProspeo(nexireFilters.seniority);
    if (prospeoSeniorities.length > 0) {
      filters.person_seniority = {
        include: prospeoSeniorities,
      };
    }
  }

  // ── Experience Years ───────────────────────────────────────────────────────
  if (
    nexireFilters.min_experience_years !== undefined ||
    nexireFilters.max_experience_years !== undefined
  ) {
    filters.person_year_of_experience = {
      min: nexireFilters.min_experience_years,
      // Recruiter Intuition: If max is set to a very high value (or the user didn't strictly cap it), 
      // we drop it to avoid narrowing the funnel.
      max: (nexireFilters.max_experience_years && nexireFilters.max_experience_years < 30)
        ? nexireFilters.max_experience_years
        : undefined,
    };
  }

  // ── Notice Period → person_time_in_current_role (months) ─────────────────
  if (nexireFilters.notice_max_days) {
    const noticeToMonths: Record<number, number> = {
      15: 1,
      30: 2,
      60: 4,
      90: 6,
    };
    const maxMonths = noticeToMonths[nexireFilters.notice_max_days];
    if (maxMonths) {
      filters.person_time_in_current_role = { max: maxMonths };
    }
  }

  // ── Company Names ──────────────────────────────────────────────────────────
  if (nexireFilters.company?.length) {
    filters.company = {
      names: { include: nexireFilters.company },
    };
  }

  // ── Industry ───────────────────────────────────────────────────────────────
  if (nexireFilters.industry?.length) {
    filters.company_industry = { include: nexireFilters.industry };
  }

  // ── Company Size / Headcount ───────────────────────────────────────────────
  if (nexireFilters.company_size?.length) {
    filters.company_headcount_range = nexireFilters.company_size;
  }

  return filters;
}

/**
 * Convert notice_max_days to Prospeo person_time_in_current_role.max (months)
 */
export function noticeDaysToRoleMonths(noticeDays: number): number {
  const map: Record<number, number> = { 15: 1, 30: 2, 60: 4, 90: 6 };
  return map[noticeDays] ?? 6;
}
