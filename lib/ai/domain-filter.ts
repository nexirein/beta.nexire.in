/**
 * lib/ai/domain-filter.ts
 *
 * Domain cluster detection and post-search domain filtering.
 *
 * The core problem Juicebox solved with "Company Industry: Mechanical/Industrial"
 * is that we need to exclude candidates from entirely wrong industries.
 *
 * This module:
 * 1. Detects the DOMAIN CLUSTER from extracted industry/role keywords
 * 2. Provides domain-match scores and exclusion penalties for the scorer
 */

// ── Domain Cluster Types ─────────────────────────────────────────────────────
export type DomainCluster =
  | "mechanical"
  | "civil"
  | "software"
  | "logistics"
  | "food"
  | "medical"
  | "finance"
  | "energy"
  | "auto"
  | "education"
  | "sales_marketing"
  | "other";

// ── Cluster Detection (Fallback if not provided by LLM) ──────────────────────
/**
 * Detects the domain cluster from a set of industry/title strings.
 * Returns the most specific match.
 */
export function detectDomainClusterFallback(
  industries: string[],
  jobTitles: string[],
  skills: string[],
): DomainCluster {
  const haystack = [...industries, ...jobTitles, ...skills]
    .join(" ")
    .toLowerCase();

  const has = (...terms: string[]) => terms.some(t => haystack.includes(t));

  if (has("vernier", "micrometer", "height gauge", "cnc", "lathe", "machining", "dimensional inspector", "precision machined", "metrology", "mechanical inspector", "qc inspector", "quality inspector")) return "mechanical";
  if (has("railway", "rail", "earthwork", "embankment", "subgrade", "metro rail", "formation", "compaction", "borrow area", "blanketing", "civil project manager", "earthwork supervisor")) return "civil";
  if (has("flatbed", "ftl", "ltl", "trucking", "freight", "car carrier", "automobile logistics", "logistics manager", "fleet manager", "transport operations")) return "logistics";
  if (has("automobile", "automotive", "oemclient", "car manufacturer", "car carrier fleet", "vehicle delivery")) return "auto";
  if (has("software", "backend", "frontend", "react", "node.js", "python", "java", "devops", "cloud", "aws", "kubernetes", "api", "developer", "programmer", "information technology")) return "software";
  if (has("food", "bakery", "fmcg", "beverage", "restaurant", "dairy", "agri", "stationery", "printing")) return "food";
  if (has("hospital", "clinical", "pharma", "healthcare", "nursing", "medical", "biotech")) return "medical";
  if (has("bank", "finance", "insurance", "fintech", "investment", "revenue", "accounting")) return "finance";
  if (has("oil", "gas", "energy", "power plant", "solar", "wind", "utilities", "petroleum")) return "energy";
  if (has("education", "school", "training", "coaching", "university", "e-learning")) return "education";
  if (has("sales", "marketing", "advertising", "pr", "public relations", "growth", "seo")) return "sales_marketing";

  return "other";
}

// ── Domain Exclusion: which clusters are PENALIZED for a given search domain ─
// The penalty logic: If the JD is looking for `searchDomain` (e.g. "civil"), 
// candidates whose profiles trigger `excluded` clusters (e.g. "software" / IT) get a -30 pt sledgehammer.
const DOMAIN_EXCLUSION_MAP: Record<DomainCluster, DomainCluster[]> = {
  mechanical: ["food", "education", "software", "civil", "finance", "medical", "sales_marketing"],
  civil: ["food", "education", "software", "finance", "mechanical", "medical", "sales_marketing"],
  software: ["food", "education", "civil", "mechanical", "logistics", "auto"],
  logistics: ["food", "education", "software", "finance", "medical"],
  auto: ["food", "education", "software", "finance", "medical", "sales_marketing"],
  food: ["software", "civil", "mechanical", "finance", "energy", "auto"],
  medical: ["food", "education", "civil", "mechanical", "auto"],
  finance: ["food", "civil", "mechanical", "logistics", "medical", "auto"],
  energy: ["food", "education", "software", "medical"],
  education: ["mechanical", "civil", "logistics", "energy", "auto", "medical"],
  sales_marketing: ["civil", "mechanical", "medical"],
  other: [],
};

/**
 * Returns penalty pts (negative) if the candidate's company/headline
 * belongs to a cluster that is excluded for this search domain.
 *
 * @param searchDomain - the searched domain cluster
 * @param candidateText - concatenated company name + headline + current_title
 * @returns penalty pts (-30 max)
 */
export function getDomainPenalty(
  searchDomain: DomainCluster,
  candidateText: string,
): number {
  if (searchDomain === "other") return 0;
  const excluded = DOMAIN_EXCLUSION_MAP[searchDomain];
  const candidateDomain = detectDomainClusterFallback([], [], [candidateText]);
  if (candidateDomain === "other") return 0;
  if (excluded.includes(candidateDomain)) {
    return -30;
  }
  if (candidateDomain === searchDomain) {
    return 15; // Domain match bonus
  }
  return 0;
}

/**
 * Returns skills match score (0–25).
 * Checks if the candidate's skills/headline/title contain any JD-specified tools/skills.
 */
export function getSkillsScore(
  requiredSkills: string[],
  candidateSkills: string[],
  candidateHeadline: string,
): { pts: number; matched: string[] } {
  if (requiredSkills.length === 0) return { pts: 0, matched: [] };

  const haystack = [
    ...candidateSkills.map(s => s.toLowerCase()),
    candidateHeadline.toLowerCase(),
  ].join(" ");

  const matched = requiredSkills.filter(skill =>
    haystack.includes(skill.toLowerCase())
  );

  if (matched.length === 0) return { pts: 0, matched: [] };

  // Score: first match = 15pts, each additional = 5pts, capped at 25
  const pts = Math.min(25, 15 + (matched.length - 1) * 5);
  return { pts, matched };
}
