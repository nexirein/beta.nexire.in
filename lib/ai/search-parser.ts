// nexire-app — lib/ai/search-parser.ts
// Parses natural language search queries into NexireSearchFilters.
// Pure regex/keyword extraction — no LLM.

import type { NexireSearchFilters } from "@/lib/prospeo/types";

const INDIA_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Noida", "Gurgaon", "Gurugram", "Kochi",
  "Chandigarh", "Ahmedabad", "Indore", "Remote",
];

const SENIORITY_KEYWORDS: Record<string, string> = {
  fresher: "entry",
  intern: "entry",
  junior: "junior",
  mid: "mid",
  "mid-level": "mid",
  senior: "senior",
  lead: "director",
  principal: "director",
  director: "director",
  vp: "vp",
  "vice president": "vp",
  head: "vp",
  cto: "c_suite",
  ceo: "c_suite",
  cfo: "c_suite",
  "c-suite": "c_suite",
};

const SKILLS_KEYWORDS = [
  "react", "node.js", "nodejs", "python", "java", "typescript", "javascript",
  "aws", "docker", "kubernetes", "k8s", "sql", "postgresql", "mongodb",
  "redis", "go", "golang", "flutter", "swift", "spring boot", "angular",
  "vue", "next.js", "nextjs", "graphql", "rust", "scala", "ruby",
  "django", "flask", "express", ".net", "c#", "c++", "php", "laravel",
  "terraform", "jenkins", "ci/cd", "kafka", "elasticsearch",
  "machine learning", "ml", "ai", "data science", "deep learning",
];

/**
 * Extract structured filters from a natural language search query.
 * Example: "Senior React developer in Bangalore with 5+ years"
 * → { job_title: ["React developer"], location: ["Bangalore"], seniority: ["senior"], min_experience_years: 5 }
 */
export function parseSearchQuery(query: string): Partial<NexireSearchFilters> {
  const filters: Partial<NexireSearchFilters> = {};
  const lower = query.toLowerCase();

  // ── Extract experience (e.g. "5+ years", "3-6 years", "5 yrs") ──
  const expMatch = lower.match(/(\d+)\s*\+\s*(?:years?|yrs?)/);
  const expRangeMatch = lower.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:years?|yrs?)/);
  if (expRangeMatch) {
    filters.min_experience_years = parseInt(expRangeMatch[1], 10);
    filters.max_experience_years = parseInt(expRangeMatch[2], 10);
  } else if (expMatch) {
    filters.min_experience_years = parseInt(expMatch[1], 10);
  }

  // ── Extract locations ──
  const locations: string[] = [];
  for (const city of INDIA_CITIES) {
    if (lower.includes(city.toLowerCase())) {
      // Normalize Bengaluru → Bangalore
      locations.push(city === "Bengaluru" ? "Bangalore" : city === "Gurugram" ? "Gurgaon" : city);
    }
  }
  if (locations.length > 0) filters.location = Array.from(new Set(locations));

  // ── Extract seniority ──
  const seniorities: string[] = [];
  for (const [keyword, value] of Object.entries(SENIORITY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      seniorities.push(value);
    }
  }
  if (seniorities.length > 0) filters.seniority = Array.from(new Set(seniorities));

  // ── Extract skills ──
  const skills: string[] = [];
  for (const skill of SKILLS_KEYWORDS) {
    if (lower.includes(skill)) {
      // Capitalize first letter for display
      skills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }
  if (skills.length > 0) filters.skills = Array.from(new Set(skills));

  // ── Extract notice period ──
  const noticeMatch = lower.match(/notice\s*(?:period\s*)?(?:under|within|max|<=?|≤)?\s*(\d+)\s*d/);
  if (noticeMatch) {
    const days = parseInt(noticeMatch[1], 10);
    if (days <= 15) filters.notice_max_days = 15;
    else if (days <= 30) filters.notice_max_days = 30;
    else if (days <= 60) filters.notice_max_days = 60;
    else filters.notice_max_days = 90;
  }

  // ── Extract job title (remainder after removing extracted parts) ──
  let titleStr = query;
  // Remove experience patterns
  titleStr = titleStr.replace(/\d+\s*[-–]\s*\d+\s*(?:years?|yrs?)/gi, "");
  titleStr = titleStr.replace(/\d+\s*\+\s*(?:years?|yrs?)/gi, "");
  // Remove cities
  for (const city of INDIA_CITIES) {
    titleStr = titleStr.replace(new RegExp(`\\b${city}\\b`, "gi"), "");
  }
  // Remove seniority keywords
  for (const keyword of Object.keys(SENIORITY_KEYWORDS)) {
    titleStr = titleStr.replace(new RegExp(`\\b${keyword}\\b`, "gi"), "");
  }
  // Remove common filler words
  titleStr = titleStr.replace(/\b(in|with|and|or|at|for|a|an|the|who|has|having|based|experience|yrs?|years?)\b/gi, "");
  // Remove notice pattern
  titleStr = titleStr.replace(/notice\s*(?:period\s*)?(?:under|within|max|<=?|≤)?\s*\d+\s*d(?:ays?)?/gi, "");

  // Clean up
  titleStr = titleStr.replace(/[,;:]+/g, " ").replace(/\s+/g, " ").trim();

  // Remove extracted skills from title
  for (const skill of skills) {
    titleStr = titleStr.replace(new RegExp(`\\b${skill}\\b`, "gi"), "");
  }
  titleStr = titleStr.replace(/\s+/g, " ").trim();

  if (titleStr.length > 2) {
    filters.job_title = [titleStr];
  }

  return filters;
}
