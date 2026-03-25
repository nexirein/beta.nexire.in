// nexire-app — lib/ai/scorer.ts
// Multi-factor relevance scoring. Pure deterministic — no LLM.
//
// SCORING ARCHITECTURE (100 pts total — no flat base):
// ┌─────────────────────────────────┬──────────────┐
// │ Factor                          │ Max pts      │
// ├─────────────────────────────────┼──────────────┤
// │ 1. Title Match                  │ 30 pts       │
// │ 2. Skills Match (profile-level) │ 25 pts       │
// │ 3. Domain / Industry Match      │ 20 pts       │
// │ 4. Location Proximity           │ 15 pts       │
// │ 5. Experience Range             │ 10 pts       │
// │ Domain Penalty (cross-domain)   │ up to -30    │
// │ Stability bonus/penalty         │ ±3           │
// └─────────────────────────────────┴──────────────┘

import type { CrustDataFilterState } from "@/lib/crustdata/types";
import { sanitizeTitle } from "@/lib/utils/sanitizeTitle";
import {
  detectDomainClusterFallback,
  getDomainPenalty,
  getSkillsScore,
  type DomainCluster,
} from "./domain-filter";

export interface ScoredCandidate {
  person_id: string;
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
  estimated_notice_days: number | null;
  notice_label: string | null;
  open_to_work: boolean;
  // Scoring fields
  ai_score: number;
  match_label: string;
  ai_reason?: string;
  score_breakdown?: {
    title: number;
    skills: number;
    domain: number;
    location: number;
    experience: number;
    penalty: number;
  };
  // Reveal state
  is_revealed: boolean;
  email: string | null;
  phone: string | null;
  candidate_id: string | null;
  is_shortlisted: boolean;
  job_history_json: any[];
  raw_crustdata_json?: any;
}

interface ScoringInput {
  candidates: Array<Record<string, unknown>>;
  searchFilters: CrustDataFilterState;
  /** PRIMARY titles = what the user explicitly asked for.
   *  These get a higher title score than adjacent/similar titles. */
  primaryJobTitles?: string[];
  /** Raw skills extracted from JD (e.g. "Vernier Calipers", "SAP", "Micrometer") */
  requiredSkills?: string[];
  /** Raw industries from JD for domain cluster detection */
  searchIndustries?: string[];
  /** Domain cluster if pre-computed */
  searchDomain?: DomainCluster;
}

export function scoreAndRankCandidates(input: ScoringInput): ScoredCandidate[] {
  const {
    candidates,
    searchFilters,
    primaryJobTitles = [],
    requiredSkills = [],
    searchIndustries = [],
    searchDomain: precomputedDomain,
  } = input;

  // Detect search domain once for all candidates
  const searchDomain: DomainCluster =
    precomputedDomain ??
    detectDomainClusterFallback(
      searchIndustries,
      [...(searchFilters.titles ?? [])],
      requiredSkills,
    );

  const primaryTitleSet = primaryJobTitles.map(t => t.toLowerCase().trim());
  const allTargetTitles = [...(searchFilters.titles ?? [])].map(t => t.toLowerCase().trim());

  const scored = candidates.map((c: any) => {
    const rawTitle = (c.current_employers?.[0]?.title ?? c.headline ?? "").toLowerCase();
    const cleanTitle = sanitizeTitle(rawTitle).toLowerCase();
    const rawSkills = (c.skills ?? []).map((s: string) => s.toLowerCase());
    const rawLocation = (c.location_details?.city ?? "").toLowerCase();
    const rawState = (c.location_details?.state ?? "").toLowerCase();
    const rawCountry = (c.location_details?.country ?? "").toLowerCase();
    const candidateExp = c.years_of_experience_raw as number | null;
    const currentCompany = (c.current_employers?.[0]?.name ?? "").toLowerCase();
    
    // CrustData specific stability / notice proxy
    // We use the 'years_at_company_raw' if available in current_employers
    const yearsInRole = c.current_employers?.[0]?.years_at_company_raw || 2;
    const monthsInRole = yearsInRole * 12;
    const aiReasonParts: string[] = [];

    // ── 1. Job Title Match (Max 30 pts) ────────────────────────────────────────
    let titlePts = 0;

    if (allTargetTitles.length > 0) {
      // Check primary titles first (highest score)
      const isPrimaryExact = primaryTitleSet.some(t => cleanTitle === t);
      const isPrimaryPartial = primaryTitleSet.some(t => cleanTitle.includes(t) || t.includes(cleanTitle));
      const isAllExact = allTargetTitles.some(t => cleanTitle === t);
      const isAllPartial = allTargetTitles.some(t => cleanTitle.includes(t) || t.includes(cleanTitle));

      if (isPrimaryExact) {
        titlePts = 30; aiReasonParts.push("Exact Title Match");
      } else if (isPrimaryPartial) {
        titlePts = 22; aiReasonParts.push("Primary Title");
      } else if (isAllExact) {
        titlePts = 18; aiReasonParts.push("Similar Title");
      } else if (isAllPartial) {
        titlePts = 12; aiReasonParts.push("Adjacent Role");
      } else {
        titlePts = 8; // No title match — rely on other factors
      }
    }

    // ── 2. Skills Match (Max 25 pts) ───────────────────────────────────────────
    const candidateHeadline = ((c.headline as string) ?? "").toLowerCase();
    const candidateJobHistory: string = ((c.job_history_json as any[]) ?? [])
      .map((j: any) => `${j.title ?? ""} ${j.company ?? ""}`)
      .join(" ")
      .toLowerCase();

    const { pts: skillsPts, matched: matchedSkills } = getSkillsScore(
      requiredSkills,
      [...rawSkills, ...candidateJobHistory.split(" ")],
      candidateHeadline,
    );
    if (matchedSkills.length > 0) {
      aiReasonParts.push(`Skills: ${matchedSkills.slice(0, 2).join(", ")}`);
    }

    // ── 3. Domain / Industry Match (Max 20 pts incl. penalty) ─────────────────
    const candidateProfileText = [
      cleanTitle, candidateHeadline, currentCompany, rawState
    ].join(" ");
    const domainDelta = getDomainPenalty(searchDomain, candidateProfileText);
    let domainPts = 0;
    if (domainDelta > 0) {
      domainPts = Math.min(20, domainDelta); aiReasonParts.push("Industry Match");
    }
    // Negative domain delta is a direct penalty applied at the end

    // ── 4. Location Proximity (Max 15 pts, -20 for cross-border) ──────────────
    let locPts = 0;
    // We check against searchFilters.region (singular in CrustDataFilterState)
    const searchLoc = (searchFilters.region ?? "").toLowerCase();
    if (searchLoc) {
      const isIndiaSearch = searchLoc.includes("india");
      const targetCountry = isIndiaSearch ? "india" : "";

      const cityPart = searchLoc.split(",")[0].trim();
      const isExactCity = rawLocation.includes(cityPart) || cityPart.includes(rawLocation);
      const isCountryMatch = targetCountry && (
        rawCountry.includes(targetCountry) || targetCountry.includes(rawCountry) ||
        (targetCountry === "india" && (rawCountry === "in" || rawCountry.includes("india")))
      );

      if (isExactCity) {
        locPts = 15; aiReasonParts.push("Exact City");
      } else if (targetCountry && rawCountry && !isCountryMatch) {
        locPts = -20; // Hard: cross-border penalty
      } else if (isCountryMatch) {
        locPts = 5;
      } else if (searchLoc === "remote" || searchLoc.includes("pan india")) {
        locPts = 10; aiReasonParts.push("Remote OK");
      }
    }

    // ── 5. Experience Range (Max 10 pts) ───────────────────────────────────────
    let expPts = 0;
    if (candidateExp !== null) {
      const min = searchFilters.experience_min ?? 0;
      const max = 40; // CrustData personDB doesn't usually use a tight max
      if (candidateExp >= min && candidateExp <= max) {
        expPts = 10;
      } else if (candidateExp >= min - 1) {
        expPts = 5; // Close enough
      }
    } else {
      expPts = 5; // Unknown experience — don't penalize missing data
    }

    // ── Stability bonus/penalty ─────────────────────────────────────────────────
    let stabilityPts = 0;
    if (monthsInRole >= 24) stabilityPts = 2;
    else if (monthsInRole < 12) stabilityPts = -3;

    // ── Compile final score ─────────────────────────────────────────────────────
    const domainPenalty = domainDelta < 0 ? domainDelta : 0;
    const raw = titlePts + skillsPts + domainPts + locPts + expPts + stabilityPts + domainPenalty;

    // Clamp 1–99 (never 0 or 100)
    const score = Math.min(99, Math.max(1, Math.round(raw)));

    let match_label = "Potential";
    if (score >= 80) match_label = "Excellent";
    else if (score >= 65) match_label = "Strong";
    else if (score >= 50) match_label = "Good";

    const ai_reason = aiReasonParts.slice(0, 3).join(" • ");

    return {
      person_id: String(c.person_id ?? ""),
      full_name: c.name ?? "Unknown",
      headline: c.headline ?? null,
      current_title: c.current_employers?.[0]?.title ?? null,
      current_company: c.current_employers?.[0]?.name ?? null,
      location_city: c.location_details?.city ?? null,
      location_state: c.location_details?.state ?? null,
      location_country: c.location_details?.country ?? null,
      experience_years: candidateExp,
      skills: c.skills ?? [],
      linkedin_url: c.flagship_profile_url ?? c.linkedin_profile_url ?? null,
      estimated_notice_days: c.estimated_notice_days ?? null,
      notice_label: c.notice_label ?? null,
      ai_score: score,
      match_label,
      ai_reason,
      score_breakdown: {
        title: titlePts,
        skills: skillsPts,
        domain: domainPts + domainPenalty,
        location: locPts,
        experience: expPts,
        penalty: domainPenalty,
      },
      open_to_work: !!c.open_to_cards || !!c.recently_changed_jobs, // CrustData proxy for interest
      is_revealed: (c.is_revealed as boolean) ?? false,
      email: (c.email as string) ?? null,
      phone: (c.phone as string) ?? null,
      candidate_id: (c.candidate_id as string) ?? null,
      is_shortlisted: (c.is_shortlisted as boolean) ?? false,
      job_history_json: c.past_employers ?? [],
      raw_crustdata_json: c,
    } satisfies ScoredCandidate;
  });

  // Sort by score descending
  scored.sort((a, b) => b.ai_score - a.ai_score);
  return scored;
}

/**
 * Apply hard post-filters — used for fields Prospeo can't filter.
 */
export function applyHardFilters(
  candidates: ScoredCandidate[],
  filters: CrustDataFilterState
): ScoredCandidate[] {
  let result = candidates;

  if (filters.experience_min !== undefined) {
    result = result.filter(
      (c) => c.experience_years === null || c.experience_years >= filters.experience_min!
    );
  }

  if (filters.experience_max !== undefined) {
    result = result.filter(
      (c) => c.experience_years === null || c.experience_years <= filters.experience_max!
    );
  }

  return result;
}
