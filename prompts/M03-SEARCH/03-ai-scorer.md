<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

M03 — TASK 03: AI SCORING ENGINE
Trae: Read CLAUDE.md first.
This runs AFTER Prospeo returns candidates — ranks them 0-100 against the JD.
Uses OpenAI (or falls back to rule-based scoring if no OpenAI key).
Score colors: green=good (70+), yellow=potential (40-69), red=no_match (<40)
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build a 2-mode scorer:

Rule-based scorer (always runs, O(1), no API call)

LLM-enhanced scorer (optional, uses OpenAI gpt-4o-mini, batched)
Both produce: { score: 0-100, label: good|potential|no_match, reasons: string[] }

FILE 1 — lib/ai/scorer.ts [CRITICAL — the brain of Nexire]
typescript
// nexire-app — lib/ai/scorer.ts
// AI scoring engine: ranks candidates against search criteria

import type { ProcessedCandidate } from "@/lib/prospeo/types";
import type { NexireSearchFilters } from "@/lib/prospeo/types";

export type MatchLabel = "good" | "potential" | "no_match";

export interface ScoredCandidate extends ProcessedCandidate {
  ai_score: number;           // 0-100
  match_label: MatchLabel;
  match_reasons: string[];    // ["Exact title match", "React + Node skills", ...]
  rank_position: number;
  // India-specific computed fields
  notice_filter_pass: boolean;
}

interface ScorerInput {
  candidates: ProcessedCandidate[];
  searchFilters: NexireSearchFilters;
  jdText?: string;             // from project JD
  projectNoticeMaxDays?: number; // from project settings
}

// ─── Main scorer entry point ──────────────────────────────────────
export function scoreAndRankCandidates(input: ScorerInput): ScoredCandidate[] {
  const { candidates, searchFilters, projectNoticeMaxDays } = input;

  const scored = candidates
    .map(c => scoreCandidate(c, searchFilters, projectNoticeMaxDays))
    .filter(c => c.match_label !== "no_match" || searchFilters.job_title?.length === 0);

  // Sort: good first, then potential, then no_match
  // Within same label: sort by score descending
  const ORDER: Record<MatchLabel, number> = { good: 0, potential: 1, no_match: 2 };
  scored.sort((a, b) => {
    if (ORDER[a.match_label] !== ORDER[b.match_label]) {
      return ORDER[a.match_label] - ORDER[b.match_label];
    }
    return b.ai_score - a.ai_score;
  });

  // Assign rank positions
  return scored.map((c, i) => ({ ...c, rank_position: i + 1 }));
}

// ─── Per-candidate rule-based scorer ─────────────────────────────
function scoreCandidate(
  candidate: ProcessedCandidate,
  filters: NexireSearchFilters,
  projectNoticeMaxDays?: number
): ScoredCandidate {
  let score = 50; // baseline
  const reasons: string[] = [];

  // ── 1. Title match (max +30 pts) ────────────────────────────────
  if (filters.job_title?.length && candidate.current_title) {
    const titleLower = candidate.current_title.toLowerCase();
    const titleMatch = filters.job_title.some(t => {
      const tl = t.toLowerCase();
      return titleLower.includes(tl) || tl.includes(titleLower.split(" "));
    });
    if (titleMatch) {
      score += 30;
      reasons.push(`Title matches: "${candidate.current_title}"`);
    } else {
      score -= 15;
    }
  }

  // ── 2. Skills match (max +25 pts) ───────────────────────────────
  if (filters.skills?.length && candidate.skills?.length) {
    const candidateSkillsLower = candidate.skills.map(s => s.toLowerCase());
    const matchedSkills = filters.skills.filter(s =>
      candidateSkillsLower.some(cs => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs))
    );
    const matchRatio = matchedSkills.length / filters.skills.length;
    const skillScore = Math.round(matchRatio * 25);
    score += skillScore;
    if (matchedSkills.length > 0) {
      reasons.push(`${matchedSkills.length}/${filters.skills.length} skills match: ${matchedSkills.slice(0, 3).join(", ")}`);
    }
  }

  // ── 3. Seniority match (+10 pts) ─────────────────────────────────
  if (filters.seniority?.length && candidate.experience_years !== null) {
    const yr = candidate.experience_years;
    const seniorityRanges: Record<string, [number, number]> = {
      entry:     [0,  2],
      junior:    [1,  4],
      mid:       [3,  7],
      senior:    [5,  15],
      director:  [10, 30],
      vp:        [12, 30],
      c_suite:   [15, 40],
    };
    const seniorityMatch = filters.seniority.some(s => {
      const range = seniorityRanges[s];
      return range && yr >= range && yr <= range;
    });
    if (seniorityMatch) {
      score += 10;
      reasons.push(`${yr} years experience fits ${filters.seniority.join("/")} level`);
    }
  }

  // ── 4. Experience range filter (hard filter — Nexire-specific) ───
  let experiencePass = true;
  if (candidate.experience_years !== null) {
    if (filters.min_experience_years && candidate.experience_years < filters.min_experience_years) {
      experiencePass = false;
      score -= 20;
    }
    if (filters.max_experience_years && candidate.experience_years > filters.max_experience_years) {
      experiencePass = false;
      score -= 10;
    }
  }

  // ── 5. Notice period filter (Nexire-specific, NOT from Prospeo) ─
  const noticeLimit = filters.notice_max_days ?? projectNoticeMaxDays;
  let noticePassed = true;
  if (noticeLimit && candidate.estimated_notice_days !== null) {
    if (candidate.estimated_notice_days > noticeLimit) {
      noticePassed = false;
      score -= 15;
      // Don't add to reasons — we show the estimate visually on card
    } else {
      score += 8;
      reasons.push(`Notice ~${candidate.estimated_notice_days}d fits ≤${noticeLimit}d requirement`);
    }
  }

  // ── 6. Company match (+5 pts) ────────────────────────────────────
  if (filters.company?.length && candidate.current_company) {
    const companyMatch = filters.company.some(c =>
      candidate.current_company!.toLowerCase().includes(c.toLowerCase())
    );
    if (companyMatch) {
      score += 5;
      reasons.push(`Currently at ${candidate.current_company}`);
    }
  }

  // ── 7. Clamp and label ────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));
  const match_label: MatchLabel =
    score >= 70 ? "good" :
    score >= 40 ? "potential" :
    "no_match";

  if (reasons.length === 0) {
    reasons.push("Partial match — review profile manually");
  }

  return {
    ...candidate,
    ai_score: score,
    match_label,
    match_reasons: reasons.slice(0, 4), // max 4 reasons shown on card
    rank_position: 0, // assigned after sort
    notice_filter_pass: noticePassed,
  };
}

// ─── Post-processing: apply Nexire-side hard filters ─────────────
// Call this AFTER scoring to remove candidates that fail hard filters
export function applyHardFilters(
  candidates: ScoredCandidate[],
  filters: NexireSearchFilters
): ScoredCandidate[] {
  return candidates.filter(c => {
    // Notice period hard filter
    if (filters.notice_max_days && c.estimated_notice_days !== null) {
      if (c.estimated_notice_days > filters.notice_max_days) return false;
    }
    // Experience hard filter
    if (filters.min_experience_years && c.experience_years !== null) {
      if (c.experience_years < filters.min_experience_years) return false;
    }
    return true;
  });
}
FILE 2 — lib/ai/search-parser.ts [NLP: text query → structured filters]
typescript
// nexire-app — lib/ai/search-parser.ts
// Converts natural language search into structured NexireSearchFilters
// Example: "Senior React dev in Bangalore 5+ years" → structured filters

import type { NexireSearchFilters } from "@/lib/prospeo/types";

// Common title synonyms for Indian market
const TITLE_SYNONYMS: Record<string, string[]> = {
  "frontend":    ["Frontend Developer", "Frontend Engineer", "UI Developer", "React Developer"],
  "backend":     ["Backend Developer", "Backend Engineer", "Node.js Developer", "Java Developer"],
  "fullstack":   ["Full Stack Developer", "Full Stack Engineer", "MEAN Developer", "MERN Developer"],
  "devops":      ["DevOps Engineer", "SRE", "Cloud Engineer", "Infrastructure Engineer"],
  "mobile":      ["Mobile Developer", "iOS Developer", "Android Developer", "React Native Developer"],
  "data":        ["Data Engineer", "Data Scientist", "ML Engineer", "Data Analyst"],
  "product":     ["Product Manager", "Product Owner", "PM", "Senior PM"],
  "designer":    ["UI/UX Designer", "Product Designer", "UX Designer", "UI Designer"],
  "qa":          ["QA Engineer", "SDET", "Test Engineer", "Quality Engineer"],
  "recruiter":   ["Technical Recruiter", "Talent Acquisition", "HR Manager", "Recruitment Manager"],
};

const SENIORITY_KEYWORDS: Record<string, string> = {
  "junior": "junior", "jr": "junior", "fresher": "entry", "entry": "entry",
  "senior": "senior", "sr": "senior", "lead": "senior", "principal": "senior",
  "director": "director", "vp": "vp", "head": "director",
  "mid": "mid", "experienced": "mid",
};

const INDIA_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Ahmedabad", "Noida", "Gurgaon", "Gurugram",
  "Kochi", "Chandigarh", "Indore", "Remote"
];

// Simple regex-based parser (no API call — instant)
export function parseSearchQuery(query: string): Partial<NexireSearchFilters> {
  const filters: Partial<NexireSearchFilters> = {};
  const lower = query.toLowerCase();
  const words = lower.split(/\s+/);

  // Detect experience years: "5+ years", "3-5 years", "10 years"
  const expMatch = query.match(/(\d+)\s*[+]?\s*(?:to|-)\s*(\d+)?\s*years?/i)
    ?? query.match(/(\d+)\+?\s*years?/i);
  if (expMatch) {
    const minYr = parseInt(expMatch);
    const maxYr = expMatch ? parseInt(expMatch) : undefined;
    filters.min_experience_years = minYr;
    if (maxYr) filters.max_experience_years = maxYr;
  }

  // Detect seniority
  for (const [kw, level] of Object.entries(SENIORITY_KEYWORDS)) {
    if (lower.includes(kw)) {
      filters.seniority = [level as any];
      break;
    }
  }

  // Detect location
  const city = INDIA_CITIES.find(c => lower.includes(c.toLowerCase()));
  if (city) filters.location = [city];

  // Detect role/title synonyms
  for (const [kw, titles] of Object.entries(TITLE_SYNONYMS)) {
    if (lower.includes(kw)) {
      filters.job_title = titles.slice(0, 3);
      break;
    }
  }

  // Extract skills (tech keywords)
  const SKILLS = [
    "react", "node", "python", "java", "golang", "typescript", "javascript",
    "aws", "azure", "gcp", "kubernetes", "docker", "sql", "mongodb", "redis",
    "flutter", "swift", "kotlin", "spring", "django", "fastapi", "nextjs",
    "postgres", "mysql", "graphql", "rest", "microservices", "kafka"
  ];
  const detectedSkills = SKILLS.filter(s => lower.includes(s));
  if (detectedSkills.length > 0) {
    filters.skills = detectedSkills.map(s =>
      s.charAt(0).toUpperCase() + s.slice(1)
    );
  }

  return filters;
}
FILE 3 — lib/ai/notice-estimator.ts [Standalone util used across app]
typescript
// nexire-app — lib/ai/notice-estimator.ts
// Used wherever we display notice period estimate in the UI

export type NoticeLabel = "~15d" | "~30d" | "~60d" | "~90d+";
export type NoticeBadgeColor = "green" | "yellow" | "orange" | "red";

export interface NoticeEstimate {
  days: number;
  label: string;
  badgeColor: NoticeBadgeColor;
  tooltip: string;
}

export function getNoticeEstimate(tenureMonths: number | null): NoticeEstimate | null {
  if (tenureMonths === null) return null;

  if (tenureMonths < 12) return {
    days: 15,
    label: "~15d",
    badgeColor: "green",
    tooltip: "Less than 1 year tenure — estimated 15-day notice (Indian norm)"
  };
  if (tenureMonths < 24) return {
    days: 30,
    label: "~30d",
    badgeColor: "yellow",
    tooltip: "1-2 years tenure — estimated 30-day notice"
  };
  if (tenureMonths < 48) return {
    days: 60,
    label: "~60d",
    badgeColor: "orange",
    tooltip: "2-4 years tenure — estimated 60-day notice"
  };
  return {
    days: 90,
    label: "~90d+",
    badgeColor: "red",
    tooltip: "4+ years tenure — estimated 90-day notice. Confirm with candidate."
  };
}

// Color classes for Tailwind
export const NOTICE_BADGE_CLASSES: Record<NoticeBadgeColor, string> = {
  green:  "bg-green-400/10 text-green-400",
  yellow: "bg-yellow-400/10 text-yellow-400",
  orange: "bg-orange-400/10 text-orange-400",
  red:    "bg-[#EF4444]/10 text-[#EF4444]",
};
COMPLETION CHECKLIST
 lib/ai/scorer.ts — scoreAndRankCandidates() with 7 scoring criteria

 lib/ai/scorer.ts — applyHardFilters() for notice + experience hard gates

 lib/ai/search-parser.ts — parseSearchQuery() converts text to structured filters

 lib/ai/notice-estimator.ts — getNoticeEstimate() with badge colors

 Scoring criteria: title(30) + skills(25) + seniority(10) + experience + notice + company

 Match labels: good=70+, potential=40-69, no_match=<40

 Score clamped 0-100

 Match reasons max 4 items shown per candidate

BUILD LOG ENTRY
M03-03 AI Scorer — [date]
Files: lib/ai/scorer.ts, lib/ai/search-parser.ts, lib/ai/notice-estimator.ts
Scoring: rule-based, 0-100, 3 match labels, 4 reasons per candidate
India-specific: notice estimator from tenure, experience range filters
Status: ✅ Complete