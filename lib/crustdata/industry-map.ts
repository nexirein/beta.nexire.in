/**
 * lib/crustdata/industry-map.ts
 *
 * Maps Nexire domain cluster shorthand → valid CrustData `company_industries` values.
 * These are the actual values stored in CrustData's `current_employers.company_industries[]`.
 *
 * Source: CrustData PersonDB autocomplete for `current_employers.company_industries`
 */

export const CRUSTDATA_INDUSTRY_MAP: Record<string, string[]> = {
  // ── Software / IT ────────────────────────────────────────────────────────
  software: [
    "Software Development",
    "Technology, Information and Internet",
    "IT Services and IT Consulting",
  ],
  "it services": [
    "IT Services and IT Consulting",
    "Software Development",
    "Computer and Network Security",
  ],
  saas: [
    "Software Development",
    "Technology, Information and Internet",
  ],
  tech: [
    "Technology, Information and Internet",
    "Software Development",
    "IT Services and IT Consulting",
    "Data Infrastructure and Analytics",
  ],
  fintech: [
    "Financial Services",
    "Software Development",
    "Banking",
    "Capital Markets",
  ],
  edtech: [
    "E-Learning Providers",
    "Higher Education",
    "Education Administration Programs",
  ],
  healthtech: [
    "Hospitals and Health Care",
    "Software Development",
    "Medical Equipment Manufacturing",
  ],

  // ── Manufacturing / Engineering ──────────────────────────────────────────
  manufacturing: [
    "General Manufacturing",
    "Industrial Machinery Manufacturing",
    "Machinery Manufacturing",
    "Automation Machinery Manufacturing",
  ],
  mechanical: [
    "Mechanical or Industrial Engineering",
    "Industrial Machinery Manufacturing",
    "Machinery Manufacturing",
    "Automation Machinery Manufacturing",
  ],
  civil: [
    "Civil Engineering",
    "Construction",
    "Engineering Services",
  ],
  electrical: [
    "Appliances, Electrical, and Electronics Manufacturing",
    "Engineering Services",
  ],
  chemical: [
    "Chemical Manufacturing",
    "Pharmaceutical Manufacturing",
  ],
  automotive: [
    "Motor Vehicle Manufacturing",
    "Automotive",
    "Vehicle Repair and Maintenance",
  ],
  aerospace: [
    "Aviation and Aerospace Component Manufacturing",
    "Defense and Space Manufacturing",
    "Airlines and Aviation",
  ],
  textile: [
    "Textile Manufacturing",
    "Apparel Manufacturing",
  ],
  steel: [
    "Primary Metal Manufacturing",
    "Fabricated Metal Products",
  ],
  pharma: [
    "Pharmaceutical Manufacturing",
    "Biotechnology Research",
  ],

  // ── Finance & Banking ────────────────────────────────────────────────────
  finance: [
    "Financial Services",
    "Banking",
    "Insurance",
    "Investment Management",
    "Capital Markets",
  ],
  banking: [
    "Banking",
    "Financial Services",
    "Credit Intermediation",
  ],
  insurance: [
    "Insurance",
    "Financial Services",
  ],
  "private equity": [
    "Venture Capital and Private Equity Principals",
    "Investment, Funds and Trusts",
  ],

  // ── Logistics & Supply Chain ─────────────────────────────────────────────
  logistics: [
    "Transportation, Logistics, Supply Chain and Storage",
    "Truck and Railroad Transportation",
    "Warehousing and Storage",
    "Freight and Package Transportation",
  ],
  transport: [
    "Truck and Railroad Transportation",
    "Ground Passenger Transportation",
    "Maritime Transportation",
  ],
  ecommerce: [
    "Online and Mail Order Retail",
    "Internet Marketplace Platforms",
    "General Retail",
  ],

  // ── Healthcare ───────────────────────────────────────────────────────────
  healthcare: [
    "Hospitals and Health Care",
    "Medical Practices",
    "Medical Equipment Manufacturing",
    "Home Health Care Services",
  ],

  // ── Energy ───────────────────────────────────────────────────────────────
  energy: [
    "Electric Power Generation",
    "Renewable Energy",
    "Oil, Gas, and Mining",
    "Utilities",
  ],
  "renewable energy": [
    "Renewable Energy",
    "Electric Power Generation",
  ],

  // ── Real Estate / Construction ────────────────────────────────────────────
  "real estate": ["Real Estate"],
  construction: [
    "Construction",
    "Civil Engineering",
    "Specialty Trade Contractors",
  ],

  // ── Media / Marketing ─────────────────────────────────────────────────────
  marketing: [
    "Marketing Services",
    "Advertising Services",
    "Public Relations and Communications Services",
  ],
  media: [
    "Media Production and Publishing",
    "Entertainment Providers",
    "Broadcasting",
  ],

  // ── Consulting ────────────────────────────────────────────────────────────
  consulting: [
    "Business Consulting and Services",
    "Strategic Management Services",
    "Professional Services",
  ],

  // ── Staffing ──────────────────────────────────────────────────────────────
  staffing: [
    "Staffing and Recruiting",
    "Human Resources Services",
  ],

  // ── Retail ────────────────────────────────────────────────────────────────
  retail: [
    "General Retail",
    "Online and Mail Order Retail",
    "Retail Apparel and Fashion",
  ],

  // ── Education ────────────────────────────────────────────────────────────
  education: [
    "Higher Education",
    "Education Administration Programs",
    "Primary and Secondary Education",
    "E-Learning Providers",
  ],
};

/**
 * Resolve a list of raw industry strings to valid CrustData industry values.
 * Does case-insensitive key matching and also direct passthrough for exact matches.
 */
export function resolveCrustDataIndustries(rawIndustries: string[]): string[] {
  const result = new Set<string>();
  const validSet = new Set(ALL_CRUSTDATA_INDUSTRIES);

  for (const raw of rawIndustries) {
    const lower = raw.toLowerCase().trim();

    // Direct passthrough if it's a valid CrustData industry value
    if (validSet.has(raw)) {
      result.add(raw);
      continue;
    }

    // Check against our map keys (e.g. "software" -> ["Software Development", ...])
    for (const [key, values] of Object.entries(CRUSTDATA_INDUSTRY_MAP)) {
      if (lower.includes(key) || key.includes(lower)) {
        values.forEach((v) => result.add(v));
        break;
      }
    }

    // If no match found, don't pass through to avoid hallucinated strings.
    // This is the "Strict Taxonomy Enforcement" rule.
  }

  return Array.from(result);
}

/**
 * All unique CrustData industry values from our map (for UI dropdowns).
 */
export const ALL_CRUSTDATA_INDUSTRIES: string[] = Array.from(
  new Set(Object.values(CRUSTDATA_INDUSTRY_MAP).flat())
).sort();
