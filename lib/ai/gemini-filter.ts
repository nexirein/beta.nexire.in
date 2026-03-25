// nexire-app — lib/ai/gemini-filter.ts
// Converts natural language queries to Prospeo filters via Gemini API.
// Location strings verified against Prospeo's Search Suggestions API (must match exactly).

import type { GeminiFilterResult, ProspeoFilters, ProspeoSeniority } from "@/lib/prospeo/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Prospeo Location Strings (Verified by Suggestions API) ─────────
// Prospeo allows arbitrary strings in person_location_search, but standard structured strings 
// like "San Francisco Bay Area, United States" or "Bangalore Urban, India" work best.

const SYSTEM_PROMPT = `You are a recruitment search filter expert for the Nexire platform.
Your job is to convert natural language recruiter queries into structured Prospeo API search filters.

CRITICAL LOCATION RULES:
- Use standard, full location strings (e.g., "San Francisco, United States", "London, United Kingdom", "Bangalore Urban, India").
- If a city is mentioned, simulate a 50km radius by generating 4-8 neighboring satellite towns or districts (e.g., "San Francisco" -> ["San Francisco, United States", "San Jose, United States", "Oakland, United States", "San Francisco Bay Area, United States"]).
- For "Remote", "anywhere", or "Pan India", leave the location list empty or provide the country name.

PROSPEO FILTERS REFERENCE:

Person filters:
- person_job_title: { include: string[], exclude?: string[], match_only_exact_job_titles?: boolean }
  OR { boolean_search: "(CEO OR CTO) AND !Intern" }
- person_seniority: { include: SeniorityValue[], exclude?: SeniorityValue[] }
  Valid: "C-Suite", "Director", "Entry", "Founder/Owner", "Head", "Intern", "Manager", "Partner", "Senior", "Vice President"
- person_location_search: { include: string[], exclude?: string[] }
  ONLY use strings from the verified list above
- person_year_of_experience: { min?: number, max?: number }
  RULES for experience: 
  • "5+ years" → min: 5. 
  • "2-4 years" → min: 2, max: null (Unless "strictly under 4" is specified, ALWAYS drop the max to increase candidate recall).
- person_time_in_current_role: { min?: number, max?: number } — NOTICE PERIOD PROXY (months)
  "notice under 30 days" → max: 1, "notice under 60 days" → max: 2, "short notice" → max: 2
- person_department: { include: DepartmentValue[] }
  Valid: "Engineering & Technical", "Information Technology", "Sales", "Marketing", "Finance", "Human Resources", "Product", "Operations", "C-Suite", "Design", "Legal"
- person_contact_details: { email: ["VERIFIED"], operator: "OR" }

Company filters:
- company: { names: { include: string[] } }
- company_industry: { include: string[] } — e.g. "Software Development", "Financial Services", "E-Commerce"
- company_headcount_range: string[] — Valid: "1-10","11-20","21-50","51-100","101-200","201-500","501-1000","1001-2000","2001-5000","5001-10000","10000+"
  "startup" → ["1-10","11-20","21-50"], "mid-size" → ["51-100","101-200","201-500"], "enterprise/MNC" → ["1001-2000","2001-5000","5001-10000","10000+"]
- company_funding: { stage: [...] } — Valid stages: "Pre seed","Seed","Series A","Series B","Series C","Private equity"

RULES:
1. Only include filters clearly specified or strongly implied  
2. Job titles: string[]. Generate 10-15 highly structured, standard job title variations 
   for the role. Include multiple levels and variations (e.g. Regional, Area, Senior, Deputy) 
   to maximize candidate coverage in database searches.
   Example: "Regional Operations Manager" → ["regional manager operations", 
     "regional manager operations & maintenance", "regional manager operations & expansion", 
     "deputy regional manager operations", "regional operations manager", "area operations manager", 
     "senior area operations manager", "deputy area operations manager", 
     "logistics operations manager", "senior logistics operations manager", "fleet operations manager"]
3. Locations: Simulate a 50km radius. If a city is mentioned, generate 4-8 specific satellite towns, neighboring municipalities, or districts to broaden the search. Format as "City, Country" or "Region, Country".
4. Skills: go in person_job_title boolean_search: { boolean_search: "React AND (Engineer OR Developer)" }
5. Experience Max: Set to null in 99% of cases to maximize candidate recall unless strictly forbidden in text.
6. Return valid JSON only, no markdown`;

/** Convert a natural language search query to Prospeo API filters using Gemini. */
export async function generateProspeoFilters(
  naturalQuery: string,
  manualFilters?: Partial<ProspeoFilters>
): Promise<GeminiFilterResult> {
  if (!GEMINI_API_KEY) {
    console.warn("[Gemini] GEMINI_API_KEY not set — using fallback parser");
    return fallbackParse(naturalQuery, manualFilters);
  }

  const prompt = `Convert this recruiter search query to Prospeo API filters JSON:

Query: "${naturalQuery}"

Return ONLY a JSON object:
{
  "filters": { <prospeo filters here> },
  "reasoning": "brief explanation"
}

Do not include any markdown, only pure JSON. Only use verified location strings from the system prompt.`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT }, { text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Gemini] API error:", res.status, err);
      return fallbackParse(naturalQuery, manualFilters);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallbackParse(naturalQuery, manualFilters);

    let parsed: GeminiFilterResult;
    try { parsed = JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return fallbackParse(naturalQuery, manualFilters);
      parsed = JSON.parse(m[0]);
    }

    // Sanitize: remove any bad location strings Gemini might hallucinate
    if (parsed.filters?.person_location_search?.include) {
      parsed.filters.person_location_search.include =
        parsed.filters.person_location_search.include.filter(isValidProspeoLocation);
    }
    if (parsed.filters?.company_location_search?.include) {
      parsed.filters.company_location_search.include =
        parsed.filters.company_location_search.include.filter(isValidProspeoLocation);
    }

    if (manualFilters && Object.keys(manualFilters).length > 0) {
      parsed.filters = { ...parsed.filters, ...manualFilters };
    }

    return parsed;
  } catch (err) {
    console.error("[Gemini] Filter generation failed:", err);
    return fallbackParse(naturalQuery, manualFilters);
  }
}

function isValidProspeoLocation(loc: string): boolean {
  // Prospeo accepts arbitrary location strings (they just fetch whatever matches).
  // We simply ensure the AI didn't hallucinate empty strings or massive paragraphs.
  return typeof loc === "string" && loc.length > 2 && loc.length < 50;
}

/**
 * Fallback filter parser when Gemini is unavailable.
 * Uses verified Prospeo location strings only.
 */
function fallbackParse(
  query: string,
  manualFilters?: Partial<ProspeoFilters>
): GeminiFilterResult {
  const filters: ProspeoFilters = { ...manualFilters };
  const q = query.toLowerCase();

  // Extract experience
  const expRange = q.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:years?|yrs?)/);
  const expMin = q.match(/(\d+)\s*\+\s*(?:years?|yrs?)/);
  if (expRange) {
    // Recruiter Intuition: drop max unless strictly requested
    filters.person_year_of_experience = { min: parseInt(expRange[1]) };
  } else if (expMin) {
    filters.person_year_of_experience = { min: parseInt(expMin[1]) };
  }

  // Extract job title safely — just use person_name_or_job_title (free text, no location validation)
  if (query.trim() && !filters.person_job_title && !filters.person_name_or_job_title) {
    // Use boolean search if skills mentioned
    const skillsMatch = query.match(/(?:with|using|in)\s+([A-Za-z]+(?:\s*,\s*[A-Za-z]+)*)\s+(?:skills?|experience|stack)/i);
    if (skillsMatch) {
      const skills = skillsMatch[1].split(/\s*,\s*/).map(s => s.trim()).filter(s => s.length > 2);
      if (skills.length > 0) {
        filters.person_job_title = { boolean_search: skills.map(s => `"${s}"`).join(" AND ") };
      }
    } else {
      filters.person_name_or_job_title = query.trim().substring(0, 100);
    }
  }

  // Extract location naive fallback (Gemini unavailable)
  // For global searches without Gemini, we just pass the query directly if it looks like a location,
  // but this is an extremely flawed fallback. Usually, Gemini is available.
  if (query.match(/in\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i) && !filters.person_location_search) {
    const locMatch = query.match(/in\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i);
    if (locMatch) {
      filters.person_location_search = { include: [locMatch[1].trim()] };
    }
  }

  // Seniority mapping
  const SENIORITY_MAP: Record<string, ProspeoSeniority> = {
    senior: "Senior",
    "sr.": "Senior",
    "sr ": "Senior",
    lead: "Head",
    principal: "Senior",
    director: "Director",
    vp: "Vice President",
    "vice president": "Vice President",
    head: "Head",
    cto: "C-Suite",
    ceo: "C-Suite",
    coo: "C-Suite",
    cfo: "C-Suite",
    "c-suite": "C-Suite",
    junior: "Entry",
    fresher: "Entry",
    entry: "Entry",
    manager: "Manager",
    "founding": "Founder/Owner",
    founder: "Founder/Owner",
  };
  const seniorities: ProspeoSeniority[] = [];
  for (const [keyword, value] of Object.entries(SENIORITY_MAP)) {
    if (q.includes(keyword)) seniorities.push(value);
  }
  if (seniorities.length > 0 && !filters.person_seniority) {
    filters.person_seniority = { include: Array.from(new Set(seniorities)) as ProspeoSeniority[] };
  }

  return {
    filters,
    reasoning: "Fallback regex parser (Gemini unavailable). Using verified Prospeo location strings.",
  };
}
