/**
 * lib/industry-expander.ts
 *
 * Maps a human/AI industry label to the full set of VALID Prospeo enum values.
 * IMPORTANT: Only values from Prospeo's official 256-item Industries enum are used here.
 * Passing invalid values like "Computer Software" causes silent zero results with no error.
 */

export const INDUSTRY_MAP: Record<string, string[]> = {
  software: [
    "Software Development",
    "IT Services and IT Consulting",
    "Technology, Information and Internet",
    "Computer and Network Security",
    "Data Infrastructure and Analytics",
  ],

  it: [
    "IT Services and IT Consulting",
    "Software Development",
    "Technology, Information and Internet",
    "Computer and Network Security",
    "Outsourcing and Offshoring Consulting",
    "Data Infrastructure and Analytics",
  ],

  ecommerce: [
    "Technology, Information and Internet",
    "Retail",
    "Online Audio and Video Media",
    "Retail Apparel and Fashion",
    "Consumer Goods",
    "Software Development",
  ],

  logistics: [
    "Transportation, Logistics, Supply Chain and Storage",
    "Truck Transportation",
    "Freight and Package Transportation",
    "Warehousing and Storage",
    "Ground Passenger Transportation",
    "Truck and Railroad Transportation",
    "Shipping",
  ],

  fintech: [
    "Financial Services",
    "Banking",
    "Investment Banking",
    "Insurance",
    "Venture Capital and Private Equity Principals",
    "Capital Markets",
    "Online Audio and Video Media",
  ],

  healthcare: [
    "Hospitals and Health Care",
    "Medical Practices",
    "Pharmaceutical Manufacturing",
    "Biotechnology Research",
    "Medical Equipment Manufacturing",
    "Mental Health Care",
    "Wellness and Fitness Services",
  ],

  manufacturing: [
    "Manufacturing",
    "Industrial Machinery Manufacturing",
    "Machinery Manufacturing",
    "Fabricated Metal Products",
    "Plastics Manufacturing",
    "Chemical Manufacturing",
  ],

  education: [
    "Education Administration Programs",
    "Higher Education",
    "E-Learning Providers",
    "Primary and Secondary Education",
    "Professional Training and Coaching",
    "Research Services",
  ],

  retail: [
    "Retail",
    "Retail Apparel and Fashion",
    "Retail Groceries",
    "Consumer Goods",
    "Online Audio and Video Media",
  ],

  media: [
    "Entertainment Providers",
    "Online Audio and Video Media",
    "Broadcast Media Production and Distribution",
    "Advertising Services",
    "Public Relations and Communications Services",
  ],

  realestate: [
    "Real Estate",
    "Real Estate Agents and Brokers",
    "Leasing Real Property",
  ],

  consulting: [
    "Business Consulting and Services",
    "Outsourcing and Offshoring Consulting",
    "Management Consulting",
    "IT Services and IT Consulting",
    "Strategic Management Services",
  ],

  // ── Infrastructure / Railway / Civil Engineering ─────────────────────────
  railway: [
    "Construction",
    "Civil Engineering",
    "Engineering Services",
    "Truck and Railroad Transportation",
    "Transportation, Logistics, Supply Chain and Storage",
    "Government Administration",
  ],

  construction: [
    "Construction",
    "Civil Engineering",
    "Engineering Services",
    "Architecture and Planning",
    "Real Estate",
  ],

  infrastructure: [
    "Construction",
    "Civil Engineering",
    "Engineering Services",
    "Utilities",
    "Government Administration",
    "Truck and Railroad Transportation",
  ],

  civil: [
    "Civil Engineering",
    "Construction",
    "Engineering Services",
    "Architecture and Planning",
  ],

  earthwork: [
    "Construction",
    "Civil Engineering",
    "Engineering Services",
  ],

  // ── Automobile / Auto ─────────────────────────────────────────────────────
  automobile: [
    "Motor Vehicle Manufacturing",
    "Truck Transportation",
    "Automotive",
    "Transportation Equipment Manufacturing",
    "Machinery Manufacturing",
  ],

  autoparts: [
    "Motor Vehicle Parts Manufacturing",
    "Motor Vehicle Manufacturing",
    "Automotive",
    "Industrial Machinery Manufacturing",
  ],

  // ── Steel / Metals / Mining ───────────────────────────────────────────────
  steel: [
    "Metal Manufacturing",
    "Mining",
    "Wholesale Metals and Minerals",
    "Industrial Machinery Manufacturing",
  ],

  mining: [
    "Mining",
    "Oil and Gas",
    "Metal Manufacturing",
    "Environmental Services",
  ],

  // ── Oil & Gas / Energy ────────────────────────────────────────────────────
  energy: [
    "Oil and Gas",
    "Utilities",
    "Renewable Energy Semiconductor Manufacturing",
    "Electric Power Generation",
  ],

  oilandgas: [
    "Oil and Gas",
    "Utilities",
    "Environmental Services",
  ],
};

/**
 * Expands a raw industry string (from the AI or user) into a full set of valid
 * Prospeo enum values. Falls back to the original string if no match is found.
 *
 * Usage:
 *   expandIndustry("Software & IT Services") → ["Software Development", "IT Services...", ...]
 *   expandIndustry("Unknown Niche") → ["Unknown Niche"]
 */
export function expandIndustry(detected: string): string[] {
  const key = detected.toLowerCase().replace(/[&]/g, "and").replace(/\s+/g, " ");

  // Direct key match in INDUSTRY_MAP
  for (const [vertical, values] of Object.entries(INDUSTRY_MAP)) {
    if (key.includes(vertical)) return values;
  }

  // ── Tech / Software ───────────────────────────────────────────────────────
  if (key.includes("tech")) return INDUSTRY_MAP.software;
  if (key.includes("saas")) return INDUSTRY_MAP.software;
  if (key.includes("information technology")) return INDUSTRY_MAP.it;

  // ── Railways / Infrastructure / Civil ────────────────────────────────────
  if (key.includes("rail") || key.includes("metro") || key.includes("transit")) return INDUSTRY_MAP.railway;
  if (key.includes("infra")) return INDUSTRY_MAP.infrastructure;
  if (key.includes("civil") || key.includes("earthwork") || key.includes("embankment")) return INDUSTRY_MAP.civil;
  if (key.includes("build") || key.includes("road") || key.includes("highway") || key.includes("bridge")) return INDUSTRY_MAP.construction;

  // ── Logistics / Transport ─────────────────────────────────────────────────
  if (key.includes("supply chain") || key.includes("transport") || key.includes("logistics")) return INDUSTRY_MAP.logistics;
  if (key.includes("freight") || key.includes("ftl") || key.includes("ltl") || key.includes("trucking")) return INDUSTRY_MAP.logistics;

  // ── Automobile ────────────────────────────────────────────────────────────
  if (key.includes("auto") || key.includes("car") || key.includes("automotive") || key.includes("vehicle")) return INDUSTRY_MAP.automobile;
  if (key.includes("truck") || key.includes("trailer") || key.includes("flatbed")) return INDUSTRY_MAP.automobile;

  // ── Steel / Metals / Mining ───────────────────────────────────────────────
  if (key.includes("steel") || key.includes("metal") || key.includes("aluminium") || key.includes("copper")) return INDUSTRY_MAP.steel;
  if (key.includes("mining") || key.includes("quarry")) return INDUSTRY_MAP.mining;

  // ── Healthcare / Pharma ───────────────────────────────────────────────────
  if (key.includes("hospital") || key.includes("health") || key.includes("pharma") || key.includes("clinical")) return INDUSTRY_MAP.healthcare;

  // ── Finance / Banking ─────────────────────────────────────────────────────
  if (key.includes("bank") || key.includes("finance") || key.includes("insurance") || key.includes("fintech")) return INDUSTRY_MAP.fintech;

  // ── Energy / Utilities ────────────────────────────────────────────────────
  if (key.includes("energy") || key.includes("power") || key.includes("utilities") || key.includes("solar") || key.includes("wind")) return INDUSTRY_MAP.energy;
  if (key.includes("oil") || key.includes("gas") || key.includes("petroleum")) return INDUSTRY_MAP.oilandgas;

  // ── Other ─────────────────────────────────────────────────────────────────
  if (key.includes("e-commerce") || key.includes("ecommerce") || key.includes("online retail")) return INDUSTRY_MAP.ecommerce;
  if (key.includes("media") || key.includes("entertainment")) return INDUSTRY_MAP.media;
  if (key.includes("real estate") || key.includes("realty") || key.includes("property")) return INDUSTRY_MAP.realestate;
  if (key.includes("consulting") || key.includes("advisory")) return INDUSTRY_MAP.consulting;

  // No match → pass through unchanged
  return [detected];
}


/**
 * Expands an array of industry strings, deduplicates, and returns the final set.
 */
export function expandIndustries(industries: string[]): string[] {
  const expanded = industries.flatMap(expandIndustry);
  return Array.from(new Set(expanded));
}
