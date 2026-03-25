/**
 * lib/seniority-mapper.ts
 * 
 * Maps human-readable seniority labels or AI-extracted terms to strict Prospeo enums.
 * This prevents the "INVALID_FILTERS" error when Prospeo rejects unknown seniority strings.
 */

// Valid Prospeo Seniority Enums (matching lib/prospeo/types.ts)
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

const VALID_PROSPEO_SENIORITIES: Set<string> = new Set([
  "C-Suite",
  "Director",
  "Entry",
  "Founder/Owner",
  "Head",
  "Intern",
  "Manager",
  "Partner",
  "Senior",
  "Vice President",
]);

/**
 * Maps an array of arbitrary strings to valid Prospeo Seniority enums.
 */
export function mapSeniorityToProspeo(inputs: string[]): ProspeoSeniority[] {
  if (!Array.isArray(inputs)) return [];

  const mapped = new Set<ProspeoSeniority>();

  for (const input of inputs) {
    if (!input) continue;

    // 1. Check for exact match (case-insensitive-ish)
    const exactMatch = Array.from(VALID_PROSPEO_SENIORITIES).find(
      (v) => v.toLowerCase() === input.toLowerCase()
    ) as ProspeoSeniority | undefined;

    if (exactMatch) {
      mapped.add(exactMatch);
      continue;
    }

    const l = input.toLowerCase();

    // 2. Keyword-based mapping
    if (l.includes("entry") || l.includes("junior") || l.includes("intern") || l.includes("fresher")) {
      if (l.includes("intern")) mapped.add("Intern");
      else mapped.add("Entry");
    }

    if (
      l.includes("senior") ||
      l.includes("lead") ||
      l.includes("staff") ||
      l.includes("principal") ||
      l.includes("mid") ||
      l.includes("associate") ||
      l.includes("executive")
    ) {
      mapped.add("Senior");
    }

    if (l.includes("manager") || l.includes("head")) {
      if (l.includes("head")) mapped.add("Head");
      else mapped.add("Manager");
    }

    if (l.includes("director")) {
      mapped.add("Director");
    }

    if (l.includes("vp") || l.includes("vice president")) {
      mapped.add("Vice President");
    }

    if (l.includes("c-level") || l.includes("cxo") || l.includes("chief") || l.includes("c-suite")) {
      mapped.add("C-Suite");
    }

    if (l.includes("partner")) {
      mapped.add("Partner");
    }

    if (l.includes("owner") || l.includes("founder")) {
      mapped.add("Founder/Owner");
    }
  }

  return Array.from(mapped);
}
