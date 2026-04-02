// nexire-app — lib/ai/scorer.ts
// Multi-factor relevance scoring. Pure deterministic — no LLM.
//
// ── SCORING ARCHITECTURE (v3) ────────────────────────────────────────────────
//
// WHEN requiredSkills.length > 0 (recruiter specified JD skills):
//   1. JD Skill Match Ratio → determines TIER (primary gate, cannot be overridden)
//   2. Secondary signals (title, location, exp, domain) → push WITHIN ±12 of tier
//   3. Experience penalty gate → candidates far outside JD exp range are dropped
//
//   TIER GATES
//   ──────────────────────────────────────────────────────────────
//   ≥ 70% skills matched  → Strong Fit   (tier base 78, max score ~92)
//   50–69% matched        → Good Fit     (tier base 60, max score ~74)
//   30–49% matched        → Moderate Fit (tier base 40, max score ~54)
//   1–29% matched         → Weak Fit     (tier base 18, max score ~32)
//   0 / N matched         → Weak Fit     (tier base 5,  max score ~18)
//
// WHEN requiredSkills is empty (no JD skills specified):
//   Falls back to title + domain + location + experience additive scoring.
//
// ── KEY v3 BUG FIXES ─────────────────────────────────────────────────────────
//   1. SEMANTIC SKILL MATCHING: Uses expandedMatch() from domain-filter.ts.
//      "CA" now matches "Chartered Accountant", "ERP" matches "SAP/Tally", etc.
//   2. WIDER SKILL SURFACE: Checks skills in past_employers titles + summary,
//      not just c.skills[] (which is often empty on CrustData profiles).
//   3. FIELD NAME FIX: Uses c.past_employers (correct CrustData field),
//      not c.job_history_json (wrong field that was always empty).
//   4. EXPERIENCE PENALTY: -25pts for candidates below JD min exp (previously -4).
//      Candidates above max exp get -10pts (over-qualified risk signal).
//   5. TIE-BREAKING: Same-score candidates sorted by exp proximity,
//      then profile richness, then open-to-work signal.
//
// ── SCORE → BADGE MAPPING (aligned with AI Insight verdict) ──────────────────
//   80+   → "Strong Fit" 🟢
//   65–79 → "Good Fit"   🔵
//   45–64 → "Moderate Fit" 🟡
//   < 45  → "Weak Fit"   ⚪

import type { CrustDataFilterState } from "@/lib/crustdata/types";
import { sanitizeTitle } from "@/lib/utils/sanitizeTitle";
import {
  detectDomainClusterFallback,
  getDomainPenalty,
  getSkillsScore,
  expandedMatch,
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
  // Scoring
  ai_score: number;
  match_label: string;
  ai_reason?: string;
  // JD match metadata (pre-computed for insight card)
  jd_match_ratio?: number;
  jd_skills_matched?: string[];
  jd_skills_total?: number;
  score_breakdown?: {
    title: number;
    skills: number;
    domain: number;
    location: number;
    experience: number;
    penalty: number;
  };
  // Reveal
  is_revealed: boolean;
  email: string | null;
  phone: string | null;
  candidate_id: string | null;
  is_shortlisted: boolean;
  job_history_json: any[];
  raw_crustdata_json?: any;
  ai_insight?: string;
}

interface ScoringInput {
  candidates: Array<Record<string, unknown>>;
  searchFilters: CrustDataFilterState;
  primaryJobTitles?: string[];
  /** Raw skills extracted from JD (e.g. "CA", "MS Excel", "ERP") */
  requiredSkills?: string[];
  searchIndustries?: string[];
  searchDomain?: DomainCluster;
}

// ── Tier boundaries ───────────────────────────────────────────────────────────
function getMatchTier(ratio: number): {
  base: number;
  label: "Strong Match" | "Good Match" | "Moderate Match" | "Weak Match";
} {
  if (ratio >= 0.7) return { base: 78, label: "Strong Match" };
  if (ratio >= 0.5) return { base: 60, label: "Good Match" };
  if (ratio >= 0.3) return { base: 40, label: "Moderate Match" };
  if (ratio >  0)   return { base: 18, label: "Weak Match" };
  return              { base: 5,  label: "Weak Match" }; // 0/N matched
}

function scoreToLabel(score: number): string {
  if (score >= 80) return "Strong Match";
  if (score >= 65) return "Good Match";
  if (score >= 45) return "Moderate Match";
  return "Weak Match";
}

// ── Build a rich text haystack from all candidate profile fields ──────────────
// v3 FIX: reads from past_employers (correct CrustData field name)
// + includes summary, current title text for better skill detection
function buildCandidateHaystack(c: any): string {
  const parts: string[] = [];

  // Skills array
  if (Array.isArray(c.skills)) {
    parts.push(...c.skills.map((s: string) => s.toLowerCase()));
  }

  // Headline
  if (c.headline) parts.push(c.headline.toLowerCase());

  // Summary/bio
  if (c.summary) parts.push(c.summary.toLowerCase());

  // Current title
  const currentTitle = c.current_employers?.[0]?.title ?? "";
  if (currentTitle) parts.push(currentTitle.toLowerCase());

  // Past employers — job titles (v3 fix: was reading job_history_json which was always empty)
  const pastEmployers: any[] = Array.isArray(c.past_employers) ? c.past_employers : [];
  for (const job of pastEmployers) {
    if (job.title) parts.push(job.title.toLowerCase());
    if (job.description) parts.push(job.description.toLowerCase().slice(0, 200));
  }

  // Education (catches "CA", "CPA", "MBA Finance" etc.)
  const edu: any[] = Array.isArray(c.education_background) ? c.education_background : [];
  for (const e of edu) {
    if (e.degree) parts.push(e.degree.toLowerCase());
    if (e.field_of_study) parts.push(e.field_of_study.toLowerCase());
    if (e.school) parts.push(e.school.toLowerCase());
  }

  // Certifications
  const certs: any[] = Array.isArray(c.certifications) ? c.certifications : [];
  for (const cert of certs) {
    if (cert.name) parts.push(cert.name.toLowerCase());
  }

  return parts.join(" ");
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

  const searchDomain: DomainCluster =
    precomputedDomain ??
    detectDomainClusterFallback(
      searchIndustries,
      [...(searchFilters.titles ?? [])],
      requiredSkills,
    );

  const primaryTitleSet = primaryJobTitles.map(t => t.toLowerCase().trim());
  const allTargetTitles = [...(searchFilters.titles ?? [])].map(t => t.toLowerCase().trim());
  const hasJDSkills = requiredSkills.length > 0;

  const jdExpMin = searchFilters.experience_min ?? null;
  const jdExpMax = searchFilters.experience_max ?? null;

  // ── Determine Dynamic Max Points based on Priority Array ────────────
  const defaultPriority = ["titles", "skills", "experience", "location"];
  // We only use the explicitly passed ranking_priority if it contains all 4 criteria.
  const priorityArray = (searchFilters.ranking_priority?.length === 4) 
    ? searchFilters.ranking_priority 
    : defaultPriority;
    
  const pointDistribution = [40, 25, 15, 10];
  const maxPts: Record<string, number> = {
    titles: 25, skills: 20, experience: 10, location: 10
  };
  priorityArray.forEach((crit, i) => {
    maxPts[crit as string] = pointDistribution[i] || 10;
  });

  const scored = candidates.map((c: any) => {
    // ── Build rich haystack from ALL candidate text fields (v3 fix) ──────────
    const candidateHaystack = buildCandidateHaystack(c);

    const rawTitle = (c.current_employers?.[0]?.title ?? c.headline ?? "").toLowerCase();
    const cleanTitle = sanitizeTitle(rawTitle).toLowerCase();
    const rawLocation = (c.location_details?.city ?? "").toLowerCase();
    const rawCountry = (c.location_details?.country ?? "").toLowerCase();
    const candidateExp = c.years_of_experience_raw as number | null;
    const currentCompany = (c.current_employers?.[0]?.name ?? "").toLowerCase();
    const candidateHeadline = ((c.headline as string) ?? "").toLowerCase();

    const aiReasonParts: string[] = [];

    // ── 1. JD Skill Match — semantic, multi-surface (PRIMARY GATE) ────────────
    let jdMatchRatio = 0;
    let matchedJDSkills: string[] = [];

    if (hasJDSkills) {
      // Use expandedMatch for each JD skill against the rich haystack
      matchedJDSkills = requiredSkills.filter(skill =>
        expandedMatch(skill, candidateHaystack)
      );
      
      // REALITY FIX: Candidates rarely list 10+ granular skills on their profiles.
      // If the JD extracts 15+ micro-requirements, penalizing candidates for only mapping
      // to 5 of them results in everyone receiving a "Weak Fit" score.
      // We cap the denominator at 6. Matching 5 out of 6+ skills is a ~83% (Strong Match).
      const expectedSkillsCap = Math.min(requiredSkills.length, 6);
      jdMatchRatio = matchedJDSkills.length > 0 
        ? Math.min(1.0, matchedJDSkills.length / expectedSkillsCap)
        : 0;

      if (matchedJDSkills.length > 0) {
        aiReasonParts.push(`Skills: ${matchedJDSkills.slice(0, 3).join(", ")}`);
      }
    }

    // ── 2. Title Match ────────────────────────────────────────────────────────
    let titlePts = 0;
    if (allTargetTitles.length > 0) {
      const isPrimaryExact   = primaryTitleSet.some(t => cleanTitle === t);
      const isPrimaryPartial = primaryTitleSet.some(t => cleanTitle.includes(t) || t.includes(cleanTitle));
      const isAllExact       = allTargetTitles.some(t => cleanTitle === t);
      const isAllPartial     = allTargetTitles.some(t => cleanTitle.includes(t) || t.includes(cleanTitle));

      if (isPrimaryExact)        { titlePts = maxPts.titles; aiReasonParts.unshift("Exact Title"); }
      else if (isPrimaryPartial) { titlePts = maxPts.titles * 0.8; aiReasonParts.unshift("Primary Title"); }
      else if (isAllExact)       { titlePts = maxPts.titles * 0.6; aiReasonParts.unshift("Similar Title"); }
      else if (isAllPartial)     { titlePts = maxPts.titles * 0.4; }
      else                       { titlePts = maxPts.titles * 0.2; }
    }

    // ── 3. Domain / Industry Match ────────────────────────────────────────────
    const candidateProfileText = [cleanTitle, candidateHeadline, currentCompany].join(" ");
    const domainDelta   = getDomainPenalty(searchDomain, candidateProfileText);
    const domainPts     = domainDelta > 0 ? Math.min(15, domainDelta) : 0;
    const domainPenalty = domainDelta < 0 ? domainDelta : 0;
    if (domainPts > 0) aiReasonParts.push("Industry Match");

    // ── 4. Location Proximity ─────────────────────────────────────────────────
    let locPts = 0;
    const searchLoc = (searchFilters.region ?? "").toLowerCase();
    if (searchLoc) {
      const isIndiaSearch  = searchLoc.includes("india");
      const targetCountry  = isIndiaSearch ? "india" : "";
      const cityPart       = searchLoc.split(",")[0].trim();
      const isExactCity    = rawLocation.includes(cityPart) || cityPart.includes(rawLocation);
      const isCountryMatch = targetCountry && (
        rawCountry.includes(targetCountry) || targetCountry.includes(rawCountry) ||
        (targetCountry === "india" && (rawCountry === "in" || rawCountry.includes("india")))
      );

      if (isExactCity)                                                     locPts = maxPts.location;
      else if (targetCountry && rawCountry && !isCountryMatch)             locPts = -15;
      else if (isCountryMatch)                                             locPts = maxPts.location * 0.4;
      else if (searchLoc === "remote" || searchLoc.includes("pan india"))  locPts = maxPts.location * 0.8;
    }

    // ── 5. Experience Range Score/Penalty (v3: much stronger penalties) ───────
    let expPts = 0;
    let expPenalty = 0;
    if (candidateExp !== null) {
      if (jdExpMin !== null && jdExpMax !== null) {
        // JD specifies exact range (e.g. 7-12 years)
        if (candidateExp >= jdExpMin && candidateExp <= jdExpMax) {
          expPts = maxPts.experience; // Perfect range
          // Bonus: prefer candidates closer to mid-range
          const midRange = (jdExpMin + jdExpMax) / 2;
          const proximity = 1 - Math.abs(candidateExp - midRange) / (jdExpMax - jdExpMin + 1);
          expPts += Math.round(proximity * 3); // Up to +3 bonus
        } else if (candidateExp < jdExpMin) {
          const deficit = jdExpMin - candidateExp;
          if (deficit <= 1) expPts = maxPts.experience * 0.4;
          else if (deficit <= 2) expPenalty = -10;
          else expPenalty = -25;
        } else {
          // candidateExp > jdExpMax (over-qualified)
          const surplus = candidateExp - jdExpMax;
          if (surplus <= 3) expPts = maxPts.experience * 0.5;
          else expPenalty = -10;
        }
      } else if (jdExpMin !== null) {
        // JD only specifies minimum
        if (candidateExp >= jdExpMin)          expPts = maxPts.experience;
        else if (candidateExp >= jdExpMin - 1) expPts = maxPts.experience * 0.4;
        else {
          const deficit = jdExpMin - candidateExp;
          expPenalty = deficit > 2 ? -25 : -10;
        }
      } else {
        expPts = maxPts.experience * 0.5; // No exp requirement — neutral
      }
    } else {
      expPts = maxPts.experience * 0.3; // Unknown experience — slight uncertainty penalty
    }

    // ── 6. Company Boost ──────────────────────────────────────────────────────
    let companyBoostPts = 0;
    if (
      searchFilters.company_match_mode === "boost" &&
      (searchFilters.company_names ?? []).length > 0
    ) {
      const boostCompanies = searchFilters.company_names!.map(n => n.toLowerCase());
      if (boostCompanies.some(bc => currentCompany.includes(bc) || bc.includes(currentCompany))) {
        companyBoostPts = 8;
        aiReasonParts.push("Preferred Company");
      }
    }

    // ── 7. Stability ──────────────────────────────────────────────────────────
    const yearsInRole  = c.current_employers?.[0]?.years_at_company_raw || 2;
    const monthsInRole = yearsInRole * 12;
    const stabilityPts = monthsInRole >= 24 ? 2 : monthsInRole < 12 ? -2 : 0;

    // ── 8. Thin Profile Penalty (no-JD mode only) ─────────────────────────────
    let infoDensityPenalty = 0;
    if (!hasJDSkills) {
      const hasRichHistory = candidateHaystack.length > 50;
      if ((c.skills ?? []).length < 3 && !candidateHeadline && !hasRichHistory) {
        infoDensityPenalty = -20;
        aiReasonParts.push("Thin Profile");
      } else if ((c.skills ?? []).length === 0 && !hasRichHistory) {
        infoDensityPenalty = -10;
      }
    }

    // ── Compile final score ───────────────────────────────────────────────────
    let rawScore: number;
    let skillsPts = 0;

    if (hasJDSkills) {
      // Dynamic Weighting — no fixed Tier-gates! The UI priority determines what matters most.
      skillsPts = jdMatchRatio * maxPts.skills;
    } else {
      // ADDITIVE (no JD skills) — original string match logic, scaled to dynamic weight
      const { pts, matched: matchedSkills } = getSkillsScore(
        searchFilters.skills ?? [],
        (c.skills ?? []).map((s: string) => s.toLowerCase()),
        candidateHeadline,
      );
      // getSkillsScore normally tops around 20. Scale it.
      skillsPts = Math.min(1.0, pts / 20) * maxPts.skills;
      if (matchedSkills.length > 0) {
        aiReasonParts.push(`Skills: ${matchedSkills.slice(0, 2).join(", ")}`);
      }
    }

    rawScore =
      titlePts + skillsPts + domainPts + locPts + expPts + expPenalty +
      companyBoostPts + stabilityPts + domainPenalty + infoDensityPenalty;

    // Clamp 1–99
    const score = Math.min(99, Math.max(1, Math.round(rawScore)));
    const match_label = scoreToLabel(score);
    const ai_reason = aiReasonParts.slice(0, 3).join(" • ");

    // Tie-breaker signals stored on the object (used in sort below)
    const _expProximityScore = (() => {
      if (candidateExp === null) return 0;
      if (jdExpMin !== null && jdExpMax !== null) {
        const mid = (jdExpMin + jdExpMax) / 2;
        return -Math.abs(candidateExp - mid); // closer to mid = higher score
      }
      if (jdExpMin !== null) return candidateExp >= jdExpMin ? candidateExp - jdExpMin : -999;
      return 0;
    })();

    return {
      person_id:       String(c.person_id ?? ""),
      full_name:       c.name ?? "Unknown",
      headline:        c.headline ?? null,
      current_title:   c.current_employers?.[0]?.title ?? null,
      current_company: c.current_employers?.[0]?.name ?? null,
      location_city:   c.location_details?.city ?? null,
      location_state:  c.location_details?.state ?? null,
      location_country:c.location_details?.country ?? null,
      experience_years: candidateExp,
      skills:          c.skills ?? [],
      linkedin_url:    c.flagship_profile_url ?? c.linkedin_profile_url ?? null,
      estimated_notice_days: c.estimated_notice_days ?? null,
      notice_label:    c.notice_label ?? null,
      ai_score:        score,
      match_label,
      ai_reason,
      jd_match_ratio:     hasJDSkills ? jdMatchRatio : undefined,
      jd_skills_matched:  hasJDSkills ? matchedJDSkills : undefined,
      jd_skills_total:    hasJDSkills ? requiredSkills.length : undefined,
      score_breakdown: {
        title:      titlePts,
        skills:     0,
        domain:     domainPts + domainPenalty,
        location:   locPts,
        experience: expPts + expPenalty,
        penalty:    domainPenalty + infoDensityPenalty + expPenalty,
      },
      open_to_work:    !!c.open_to_cards?.length || !!c.recently_changed_jobs,
      is_revealed:     (c.is_revealed as boolean) ?? false,
      email:           (c.email as string) ?? null,
      phone:           (c.phone as string) ?? null,
      candidate_id:    (c.candidate_id as string) ?? null,
      is_shortlisted:  (c.is_shortlisted as boolean) ?? false,
      job_history_json: c.past_employers ?? [],
      raw_crustdata_json: c,
      // Store tie-breaker (not sent to UI, used for sort only)
      _expProximityScore,
    } as ScoredCandidate & { _expProximityScore: number };
  });

  // ── Sort: primary = score desc, tie-breakers = exp proximity, profile richness, open-to-work
  scored.sort((a: any, b: any) => {
    // 1. Score (primary)
    if (b.ai_score !== a.ai_score) return b.ai_score - a.ai_score;

    // 2. Experience proximity to JD mid-range
    const expA = a._expProximityScore ?? 0;
    const expB = b._expProximityScore ?? 0;
    if (expB !== expA) return expB - expA;

    // 3. Profile richness (more skills = better)
    const skillsA = (a.skills ?? []).length;
    const skillsB = (b.skills ?? []).length;
    if (skillsB !== skillsA) return skillsB - skillsA;

    // 4. Open to work candidates slightly preferred
    if (a.open_to_work !== b.open_to_work) return a.open_to_work ? -1 : 1;

    return 0;
  });

  return scored;
}

/**
 * Apply hard post-filters — used for fields CrustData can't filter server-side.
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
