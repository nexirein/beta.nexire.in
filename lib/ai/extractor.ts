/**
 * lib/ai/extractor.ts
 * Phase 4 — LLM extraction of structured Prospeo filters from HR text.
 * Uses Gemini with json_object response format.
 *
 * DUAL-STRATEGY ARCHITECTURE:
 *   "include"  — DEFAULT. Extracts list of job titles for structured filtering.
 *               → Preferred for CrustData PersonDB (better recall with nested OR).
 *   "boolean" — ONLY for highly complex niche queries that cannot be expressed as a list of titles.
 */

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const INLINE_ENUMS = `
SENIORITY (use ONLY these exact values — pick the MOST specific match):
  Entry, Trainee, Intern (junior/fresh),
  Senior (experienced IC), Manager (people manager),
  Head (head of a function), Director (director level),
  VP (vice president), CXO (c-suite / C-level),
  Owner (founder/owner)
⚠️ Do NOT output "Senior Management" — use Director, Head, or CXO instead.
HEADCOUNT_RANGE (use ONLY these exact values): 1-10, 11-20, 21-50, 51-100, 101-200, 201-500, 501-1000, 1001-2000, 2001-5000, 5001-10000, 10000+
FUNDING_STAGE (use ONLY these exact values): Angel, Pre seed, Seed, Series A, Series B, Series C, Series D, Series E-J, Post IPO equity, Post IPO debt, Private equity, Undisclosed, Other event
`;

const SYSTEM_PROMPT = `You are a recruitment filter extractor for an Indian hiring platform (Nexire).
Extract structured data from HR job requirements or job descriptions for our CrustData-native search engine.
Return ONLY a valid JSON object — no explanation, no markdown, no code blocks.

${INLINE_ENUMS}

Output this exact JSON schema (use null for missing values, [] for empty arrays):
{
  "raw_job_titles": [],
  "similar_job_titles": [],
  "job_title_strategy": "include",
  "boolean_search_expression": null,
  "raw_location": null,
  "similar_locations": [],
  "raw_tech": [],
  "raw_industry": [],
  "similar_industries": [],
  "person_seniority": [],
  "raw_experience_min": null,
  "raw_experience_max": null,
  "company_headcount_range": [],
  "company_funding_stage": [],
  "raw_department": [],
  "raw_school": [],
  "raw_degree": [],
  "raw_field_of_study": [],
  "languages": [],
  "company_hq_location": [],
  "exclude_job_titles": [],
  "exclude_companies": [],
  "exclude_industries": [],
  "raw_company_type": null,
  "raw_keywords": [],
  "full_name": null,
  "raw_time_in_role_max_months": null,
  "raw_max_person_per_company": null,
  "company_websites": [],
  "time_in_current_role_min": null,
  "time_in_current_role_max": null,
  "time_in_current_company_min": null,
  "time_in_current_company_max": null
}

Rules:

━━ JOB TITLE STRATEGY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- job_title_strategy: ALWAYS prefer "include".
  Only use "boolean" if the request is a complex linguistic pattern that CANNOT be expressed as a list of 10-15 job titles.
  
- raw_job_titles: Extract the primary job title(s) mentioned verbatim.
- similar_job_titles: Generate 10-15 diverse, standard job title variations.
  This is the PRIMARY search driver. Be expansive.
  Example for "Regional Manager - Operations":
  ["Regional Operations Manager", "Zonal Operations Head", "Area Operations Manager", "Logistics Operations Manager", "Fleet Operations Head", "Transport Manager", "Senior Operations Manager", "City Logistics Head", "Hub Manager", "Cluster Manager"]

- boolean_search_expression: Only used if strategy="boolean".
  If used, it must be simple: "(Role) AND (Domain)".
  Avoid complex nested logic.

- raw_keywords: extract specific niche keywords or specialties (e.g. "Car Carrier", "OEM Client", "Vehicle Logistics").
  These are used for domain matching in headlines and summaries.

- similar_locations: simulate a 50km radius search. Generate 4-8 specific satellite towns or districts.
  Example for "Kolkata": ["Howrah", "Salt Lake City", "New Town", "Hooghly", "South 24 Parganas"]
- raw_tech, raw_industry, raw_department: extract exactly as mentioned.
- similar_industries: generate 2-5 similar/related industries.
- person_seniority: map to SENIORITY enum.
- company_headcount_range: map to HEADCOUNT_RANGE enum.
- company_funding_stage: map to FUNDING_STAGE enum.
- raw_location: single string (city, region, or country).
- raw_experience_min: integer years or null.
- raw_experience_max: Set to null in 99% of cases unless explicitly restricted.
- Return ONLY the JSON object, nothing else`;

export interface LLMExtractedFilters {
  raw_job_titles: string[];
  similar_job_titles: string[];
  /** "boolean" = skip Prospeo suggestions, use boolean_search_expression directly.
   *  "include"  = use Prospeo suggestions API + quality-filtered include list. */
  job_title_strategy: "include" | "boolean";
  /** Prospeo boolean_search syntax. Only set when job_title_strategy = "boolean". */
  boolean_search_expression: string | null;
  raw_location: string | null;
  similar_locations: string[];
  raw_tech: string[];
  raw_industry: string[];
  similar_industries: string[];
  person_seniority: string[];
  raw_experience_min: number | null;
  raw_experience_max: number | null;
  company_headcount_range: string[];
  company_funding_stage: string[];
  raw_department: string[];
  raw_company_type: string | null;
  skills_json?: string[];
  raw_keywords: string[];
  full_name: string | null;
  raw_time_in_role_max_months: number | null;
  raw_max_person_per_company: number | null;
  company_websites: string[];
  time_in_current_role_min: number | null;
  time_in_current_role_max: number | null;
  time_in_current_company_min: number | null;
  time_in_current_company_max: number | null;
  raw_school: string[];
  raw_degree: string[];
  raw_field_of_study: string[];
  languages: string[];
  company_hq_location: string[];
  exclude_job_titles: string[];
  exclude_companies: string[];
  exclude_industries: string[];
}

export async function extractFiltersFromText(
  text: string
): Promise<LLMExtractedFilters> {
  const completion = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "user", parts: [{ text: text.slice(0, 4000) }] },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const raw = completion.text;
  if (!raw) throw new Error("Empty LLM response");

  try {
    const parsed = JSON.parse(raw) as LLMExtractedFilters;
    // Defensive normalisation — if LLM forgot to set strategy, derive from expression
    if (!parsed.job_title_strategy) {
      parsed.job_title_strategy = parsed.boolean_search_expression ? "boolean" : "include";
    }
    return parsed;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
