"use client";

/**
 * lib/hooks/useFilterState.ts — CrustData Edition
 *
 * Central filter state management.
 * Uses CrustDataFilterState as the canonical type.
 * Provides toCrustDataPayload() via filter-builder.ts.
 * Keeps a toProspeoPayload() stub for the contact unlock route only.
 */

import { useState, useCallback, useMemo } from "react";
import type { CrustDataFilterState } from "@/lib/crustdata/types";

export type { CrustDataFilterState as FilterState };

// ─── Active field detection ──────────────────────────────────────────────────

function isActive(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).some(isActive);
  return false;
}

const STORAGE_KEY = "nexire_filter_state_v2";
const PRIORITY_KEY = "nexire_default_ranking_priority";

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFilterState(initial: Partial<CrustDataFilterState> = {}) {
  const stored = (() => {
    if (typeof window === "undefined") return {};
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      const parsed = s ? JSON.parse(s) : {};
      
      // Load global default for priority if not in session
      if (!parsed.ranking_priority) {
        const globalPrio = localStorage.getItem(PRIORITY_KEY);
        if (globalPrio) parsed.ranking_priority = JSON.parse(globalPrio);
      }
      
      return parsed;
    } catch { return {}; }
  })();

  const [filters, setFilters] = useState<CrustDataFilterState>({ 
    ranking_priority: ["titles", "skills", "location", "experience"],
    ...stored, 
    ...initial 
  });

  const setFilter = useCallback(<K extends keyof CrustDataFilterState>(
    key: K,
    value: CrustDataFilterState[K]
  ) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      try { 
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); 
        // Persist priority globally
        if (key === "ranking_priority") {
          localStorage.setItem(PRIORITY_KEY, JSON.stringify(value));
        }
      } catch { /* ok */ }
      return next;
    });
  }, []);

  const resetFilter = useCallback((key: keyof CrustDataFilterState) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ok */ }
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setFilters({});
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ok */ }
  }, []);

  const getActiveFilterCount = useCallback(() => {
    const { cursor, company_match_mode, ...rest } = filters;
    void cursor;
    void company_match_mode;
    return Object.values(rest).filter(isActive).length;
  }, [filters]);

  const activeCategories = useMemo(() => {
    return {
      general: isActive(filters.experience_min) || isActive(filters.experience_max)
        || isActive(filters.recently_changed_jobs) || isActive(filters.num_connections_min)
        || isActive(filters.max_per_company),
      locations: isActive(filters.region) || isActive(filters.exclude_regions) || isActive(filters.past_regions),
      job: isActive(filters.titles) || isActive(filters.exclude_titles) || isActive(filters.past_titles)
        || isActive(filters.seniority) || isActive(filters.function_category)
        || isActive(filters.years_at_company_min) || isActive(filters.years_at_company_max)
        || isActive(filters.years_at_current_role_min) || isActive(filters.years_at_current_role_max),
      company: isActive(filters.company_names) || isActive(filters.exclude_company_names)
        || isActive(filters.company_headcount_range) || isActive(filters.company_type)
        || isActive(filters.company_hq_location) || isActive(filters.company_funding_min)
        || isActive(filters.company_funding_max) || isActive(filters.company_revenue_range)
        || isActive(filters.verified_business_email) || isActive(filters.company_domains),
      industry: isActive(filters.company_industries) || isActive(filters.exclude_industries),
      skills: isActive(filters.skills) || isActive(filters.keywords),
      education: isActive(filters.education_school) || isActive(filters.education_degree)
        || isActive(filters.education_field_of_study) || isActive(filters.languages)
        || isActive(filters.graduation_year_min) || isActive(filters.graduation_year_max)
        || isActive(filters.profile_language),
      boolean: isActive(filters.boolean_expression) || isActive(filters.full_name) || isActive(filters.headline),
    };
  }, [filters]);

  /**
   * Returns a clean copy of state for CrustData API use.
   * Strips cursor and any undefined/empty arrays.
   */
  const toCrustDataPayload = useCallback((): CrustDataFilterState => {
    const { cursor, ...rest } = filters;
    void cursor;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      cleaned[k] = v;
    }
    return cleaned as CrustDataFilterState;
  }, [filters]);

  /**
   * Load a complete filter state from outside (e.g. AI extraction result).
   */
  const fromCrustDataPayload = useCallback((payload: Partial<CrustDataFilterState>) => {
    setFilters(payload as CrustDataFilterState);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* ok */ }
  }, []);

  /**
   * Backward-compat stub: used by contact unlock route only.
   * Returns a minimal Prospeo-like payload with person_location_search.
   */
  const toProspeoPayload = useCallback((): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    if (filters.titles?.length) {
      payload.person_job_title = { include: filters.titles };
    }
    if (filters.region) {
      payload.person_location_search = { include: [filters.region] };
    }
    return payload;
  }, [filters]);

  /** True when at least one searchable filter is set */
  const hasAtLeastOneInclude = useMemo(() => {
    return (
      (filters.titles?.length ?? 0) > 0 ||
      (filters.past_titles?.length ?? 0) > 0 ||
      !!filters.region?.trim() ||
      (filters.past_regions?.length ?? 0) > 0 ||
      (filters.skills?.length ?? 0) > 0 ||
      (filters.company_industries?.length ?? 0) > 0 ||
      (filters.company_names?.length ?? 0) > 0 ||
      (filters.education_school?.length ?? 0) > 0 ||
      !!filters.boolean_expression?.trim()
    );
  }, [filters]);

  return {
    filters,
    setFilter,
    resetFilter,
    resetAll,
    getActiveFilterCount,
    activeCategories,
    toCrustDataPayload,
    fromCrustDataPayload,
    /** @deprecated Use toCrustDataPayload(). Kept for contact unlock only. */
    toProspeoPayload,
    hasAtLeastOneInclude,
  };
}
