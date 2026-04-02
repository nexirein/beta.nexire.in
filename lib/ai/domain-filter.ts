/**
 * lib/ai/domain-filter.ts
 *
 * Domain cluster detection + semantic skill matching.
 *
 * v3 changes:
 *   - Added SKILL_ALIASES: domain-aware synonym expansion so "CA" matches
 *     "Chartered Accountant", "ERP" matches "SAP/Oracle/Tally", etc.
 *   - getSkillsScore() now expands both JD skills AND candidate skills
 *     through the alias map before matching — preventing "None identified"
 *     on every finance/domain-specific search.
 *   - expandedMatch() helper exposed for scorer to reuse.
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

// ── Semantic Skill Alias Map ──────────────────────────────────────────────────
// Key = canonical JD skill (lowercased)
// Value = list of strings that indicate this skill on a candidate's profile
//
// Rules:
//  1. Lowercase everything — matching is always case-insensitive
//  2. Short aliases are fine — "mis" will match "mis reports" in a headline
//  3. Add domain-specific abbreviations (CA, CPA, GST, etc.)
//  4. If a skill has no special aliases, it falls through to exact matching
//
export const SKILL_ALIASES: Record<string, string[]> = {
  // ── Finance/Accounting ───────────────────────────────────────────────────
  "chartered accountant":       ["ca", "c.a.", "icai", "fca", "aca"],
  "ca":                         ["chartered accountant", "c.a.", "icai", "fca", "aca"],
  "cpa":                        ["certified public accountant", "us cpa"],
  "cfa":                        ["chartered financial analyst"],
  "financial reporting":        ["financial statements", "mis", "mis reports", "management reporting", "p&l", "profit and loss", "balance sheet", "income statement", "ifrs", "ind as", "gaap"],
  "financial analysis":         ["financial modelling", "financial modeling", "ratio analysis", "variance analysis", "financial planning", "fp&a"],
  "fp&a":                       ["financial planning", "financial analysis", "budget", "forecasting", "financial planning and analysis"],
  "accounting":                 ["accounts", "bookkeeping", "ledger", "journal entries", "general ledger", "gl"],
  "accounts payable":           ["ap", "payables", "vendor payments", "creditors"],
  "accounts receivable":        ["ar", "receivables", "debtors", "collections"],
  "account reconciliation":     ["bank reconciliation", "reconciliation", "ledger reconciliation"],
  "general ledger":             ["gl", "chart of accounts", "ledger maintenance"],
  "ms excel":                   ["excel", "microsoft excel", "advanced excel", "spreadsheet", "pivot table", "vlookup", "xlookup"],
  "excel":                      ["ms excel", "microsoft excel", "advanced excel", "spreadsheet"],
  "erp":                        ["sap", "oracle financials", "tally", "zoho books", "netsuite", "dynamics 365", "oracle erp", "sage", "quickbooks", "busy", "marg"],
  "sap":                        ["sap fico", "sap fi", "sap s/4hana", "sap s4hana", "sap erp"],
  "sap fico":                   ["sap fi", "sap co", "sap finance"],
  "tally":                      ["tally erp", "tally prime", "tally.erp9"],
  "zoho books":                 ["zoho finance", "zoho"],
  "taxation":                   ["tax", "direct tax", "indirect tax", "income tax", "gst", "tds", "vat", "customs duty", "tax compliance"],
  "gst":                        ["goods and services tax", "indirect tax", "gst compliance", "gst filing"],
  "tds":                        ["tax deducted at source", "withholding tax"],
  "statutory compliance":       ["compliance", "regulatory compliance", "statutory audit", "secretarial compliance", "roc filing"],
  "internal audit":             ["audit", "internal controls", "ica", "sox audit", "process audit"],
  "external audit":             ["audit", "statutory audit", "external auditor"],
  "audit":                      ["internal audit", "statutory audit", "external audit", "audit management", "auditing"],
  "treasury":                   ["cash management", "liquidity management", "forex", "foreign exchange", "hedging", "working capital"],
  "working capital":            ["cash flow", "debtors management", "creditors management", "inventory management"],
  "cash flow":                  ["cash flow management", "cash forecasting", "liquidity"],
  "mis":                        ["mis reports", "management information system", "reporting", "management reporting", "dashboard"],
  "forecasting":                ["financial forecasting", "budget planning", "projections", "forecast"],
  "budgeting":                  ["budget", "annual budget", "operating budget", "capex budget"],
  "cost accounting":            ["costing", "cost analysis", "cost control", "standard costing", "abc costing"],
  "team management":            ["team leadership", "people management", "staff management", "managing team", "team lead"],
  "leadership":                 ["team management", "people management", "mentoring", "coaching"],
  "strategic planning":         ["strategy", "strategic management", "business planning"],
  "process improvement":        ["process optimization", "automation", "lean", "six sigma", "workflow improvement"],
  "financial controller":       ["controller", "finance controller", "finance head", "deputy cfo", "vp finance"],
  "cfo":                        ["chief financial officer", "finance director", "head of finance"],

  // ── HR / Talent ──────────────────────────────────────────────────────────
  "talent acquisition":         ["recruiting", "recruitment", "headhunting", "sourcing", "hiring"],
  "hrbp":                       ["hr business partner", "hr bp", "human resources business partner"],
  "payroll":                    ["payroll processing", "salary processing", "payroll management"],
  "performance management":     ["appraisal", "pms", "kra", "kpi", "goal setting"],
  "employee relations":         ["er", "grievance handling", "ir", "industrial relations"],

  // ── Sales / Marketing ────────────────────────────────────────────────────
  "b2b sales":                  ["enterprise sales", "corporate sales", "institutional sales", "business development"],
  "b2c sales":                  ["retail sales", "consumer sales", "direct sales"],
  "crm":                        ["salesforce", "zoho crm", "hubspot", "microsoft crm", "customer relationship management"],
  "digital marketing":          ["seo", "sem", "ppc", "google ads", "social media marketing", "content marketing"],
  "p&l management":             ["p&l", "profit and loss", "revenue management", "pl responsibility"],

  // ── Tech ────────────────────────────────────────────────────────────────
  "javascript":                 ["js", "node.js", "nodejs", "react", "vue", "angular", "typescript", "ts"],
  "python":                     ["django", "flask", "fastapi", "pytorch", "tensorflow", "data science", "ml"],
  "java":                       ["spring boot", "j2ee", "jvm", "kotlin", "springboot"],
  "cloud":                      ["aws", "azure", "gcp", "google cloud", "cloud computing", "devops"],
  "sql":                        ["mysql", "postgresql", "postgres", "mssql", "oracle db", "database", "rdbms"],
  "machine learning":           ["ml", "ai", "deep learning", "nlp", "computer vision", "data science"],
  "data science":               ["machine learning", "ml", "data analyst", "analytics", "statistics"],

  // ── Logistics / Supply Chain ─────────────────────────────────────────────
  "supply chain":               ["scm", "procurement", "sourcing", "vendor management", "logistics"],
  "procurement":                ["purchasing", "vendor management", "sourcing", "supply chain"],
  "warehouse management":       ["wms", "warehouse operations", "inventory management", "inbound", "outbound"],

  // ── Engineering ──────────────────────────────────────────────────────────
  "autocad":                    ["cad", "drafting", "2d cad", "3d cad", "solidworks", "catia", "revit"],
  "project management":         ["pmp", "prince2", "agile", "scrum", "project planning", "project execution"],
};

// ── Expand a skill term through aliases ───────────────────────────────────────
/**
 * Returns all aliases for a given skill term (including the term itself).
 * Used to expand both JD requirements and candidate profile text before matching.
 */
function expandSkill(skill: string): string[] {
  const lower = skill.toLowerCase().trim();
  const aliases = SKILL_ALIASES[lower] ?? [];
  return [lower, ...aliases];
}

/**
 * Checks if a candidate text haystack contains a given skill,
 * using semantic alias expansion on both sides.
 */
export function expandedMatch(requiredSkill: string, haystack: string): boolean {
  const skillVariants = expandSkill(requiredSkill);
  return skillVariants.some(v => haystack.includes(v));
}

// ── Domain Cluster Detection ──────────────────────────────────────────────────
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
  if (has("bank", "finance", "insurance", "fintech", "investment", "revenue", "accounting", "chartered accountant", "ca ", "fica", "audit")) return "finance";
  if (has("oil", "gas", "energy", "power plant", "solar", "wind", "utilities", "petroleum")) return "energy";
  if (has("education", "school", "training", "coaching", "university", "e-learning")) return "education";
  if (has("sales", "marketing", "advertising", "pr", "public relations", "growth", "seo")) return "sales_marketing";

  return "other";
}

// ── Domain Exclusion Map ──────────────────────────────────────────────────────
const DOMAIN_EXCLUSION_MAP: Record<DomainCluster, DomainCluster[]> = {
  mechanical:     ["food", "education", "software", "civil", "finance", "medical", "sales_marketing"],
  civil:          ["food", "education", "software", "finance", "mechanical", "medical", "sales_marketing"],
  software:       ["food", "education", "civil", "mechanical", "logistics", "auto"],
  logistics:      ["food", "education", "software", "finance", "medical"],
  auto:           ["food", "education", "software", "finance", "medical", "sales_marketing"],
  food:           ["software", "civil", "mechanical", "finance", "energy", "auto"],
  medical:        ["food", "education", "civil", "mechanical", "auto"],
  finance:        ["food", "civil", "mechanical", "logistics", "medical", "auto"],
  energy:         ["food", "education", "software", "medical"],
  education:      ["mechanical", "civil", "logistics", "energy", "auto", "medical"],
  sales_marketing:["civil", "mechanical", "medical"],
  other:          [],
};

export function getDomainPenalty(
  searchDomain: DomainCluster,
  candidateText: string,
): number {
  if (searchDomain === "other") return 0;
  const excluded = DOMAIN_EXCLUSION_MAP[searchDomain];
  const candidateDomain = detectDomainClusterFallback([], [], [candidateText]);
  if (candidateDomain === "other") return 0;
  if (excluded.includes(candidateDomain)) return -30;
  if (candidateDomain === searchDomain) return 15;
  return 0;
}

/**
 * Returns skills match score using SEMANTIC ALIAS EXPANSION.
 * Now correctly identifies:
 *   "CA" ↔ "Chartered Accountant"
 *   "MS Excel" ↔ "Microsoft Excel" / "Advanced Excel"
 *   "ERP" ↔ "SAP" / "Tally" / "Zoho Books"
 *   etc.
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

  // For each required skill, check via alias expansion
  const matched = requiredSkills.filter(skill =>
    expandedMatch(skill, haystack)
  );

  if (matched.length === 0) return { pts: 0, matched: [] };

  // Score: first match = 15pts, each additional = 10pts, capped at 35
  const pts = Math.min(35, 15 + (matched.length - 1) * 10);
  return { pts, matched };
}
