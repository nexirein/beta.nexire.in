// nexire-app — lib/prospeo/client.ts
// ALL Prospeo API calls go here. Never import this in client components.
// Endpoint: POST https://api.prospeo.io/search-person
// Docs: https://prospeo.io/api-docs/search-person

import type {
  ProspeoFilters,
  ProspeoSearchResponse,
  ProspeoPersonObject,
  ProcessedCandidate,
} from "./types";

const PROSPEO_BASE = "https://api.prospeo.io";

// ─── Core fetch wrapper ────────────────────────────────────────────────────────
async function prospeoFetch<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) throw new Error("PROSPEO_API_KEY not set");

  const res = await fetch(`${PROSPEO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": key,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Prospeo ${path} error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── 1. Search People (1 credit if at least 1 result, 25 per page) ────────────
// All calls go through searchWithRetry for automatic 429 backoff.
export async function prospeoSearchPeople(
  filters: ProspeoFilters,
  page: number = 1
): Promise<ProspeoSearchResponse> {
  return searchWithRetry(filters, page);
}

/**
 * Exponential-backoff retry wrapper for Prospeo rate-limit errors (429).
 * Fires: attempt 1 immediately → wait 1.5s → attempt 2 → wait 3s → attempt 3 → throw.
 */
async function searchWithRetry(
  filters: ProspeoFilters,
  page: number,
  attempt: number = 1
): Promise<ProspeoSearchResponse> {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) throw new Error("PROSPEO_API_KEY not set");

  const res = await fetch(`${PROSPEO_BASE}/search-person`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-KEY": key },
    body: JSON.stringify({ filters, page }),
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data: unknown = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (res.status === 429 && attempt < 3) {
    // Rate limit — wait then retry
    const waitMs = attempt * 1500; // 1.5s, then 3s
    console.warn(`[Prospeo] Rate limited (429). Retry ${attempt}/3 after ${waitMs}ms.`);
    await new Promise(r => setTimeout(r, waitMs));
    return searchWithRetry(filters, page, attempt + 1);
  }

  if (!res.ok) {
    const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
    const error_code =
      typeof obj?.error_code === "string" ? obj.error_code :
        res.status === 429 ? "RATE_LIMITED" : `HTTP_${res.status}`;
    const message =
      typeof obj?.message === "string" ? obj.message :
        typeof data === "string" ? data : `Prospeo /search-person error ${res.status}`;
    const filter_error = typeof obj?.filter_error === "string" ? obj.filter_error : undefined;
    return { error: true, error_code, message, filter_error } as ProspeoSearchResponse;
  }

  return (data ?? { error: true, error_code: "EMPTY_RESPONSE", message: "Empty Prospeo response" }) as ProspeoSearchResponse;
}

// ─── 2. Email Reveal (1 credit) ───────────────────────────────────────────────
export async function prospeoRevealEmail(
  linkedinUrl: string
): Promise<{ error: boolean; data?: { email: string; status: string } }> {
  return prospeoFetch("/email-finder", {
    url: linkedinUrl,
  });
}

// ─── 3. Search Suggestions (Free endpoint, 15 req/sec) ────────────────────────
export async function prospeoSearchSuggestions(
  type: "job_title_search" | "location_search",
  query: string
): Promise<{ error: boolean; suggestions?: string[] }> {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) throw new Error("PROSPEO_API_KEY not set");

  const res = await fetch(`${PROSPEO_BASE}/search-suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": key,
    },
    body: JSON.stringify({ [type]: query }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return { error: true, suggestions: [] };
  }

  if (type === "job_title_search") {
    const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    const suggestions = Array.isArray(obj.job_title_suggestions) ? (obj.job_title_suggestions as string[]) : [];
    return { error: false, suggestions };
  }

  const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const locs = Array.isArray(obj.location_suggestions) ? (obj.location_suggestions as unknown[]) : [];
  return {
    error: false,
    suggestions: locs
      .map((l) => (typeof l === "object" && l !== null ? (l as Record<string, unknown>).name : null))
      .filter((n): n is string => typeof n === "string" && n.length > 0),
  };
}

// ─── 3. Phone + Email Reveal (8 Nexire credits = 10 Prospeo credits) ─────────
export async function prospeoRevealPhone(
  linkedinUrl: string
): Promise<{
  error: boolean;
  data?: { mobile: string; mobile_status: string; email?: string; email_status?: string };
}> {
  return prospeoFetch("/mobile-finder", {
    url: linkedinUrl,
  });
}

// ─── 4. Process Prospeo Person → Nexire ProcessedCandidate ───────────────────
export function processProspeoProfile(
  person: ProspeoPersonObject
): ProcessedCandidate {
  const currentJob = person.job_history?.find((j) => j.current);
  const allHistory = person.job_history ?? [];

  // Total experience: sum all job durations
  const totalMonths = allHistory.reduce(
    (sum, j) => sum + (j.duration_in_months ?? 0),
    0
  );
  const experience_years = totalMonths > 0 ? Math.round(totalMonths / 12) : null;

  // Notice period: based on months in current role
  const currentRoleMonths = currentJob?.duration_in_months ?? null;
  const { days: estimated_notice_days, label: notice_label } =
    estimateNoticePeriod(currentRoleMonths);

  return {
    person_id: person.person_id,
    full_name: person.full_name,
    headline: person.headline ?? null,
    current_title: person.current_job_title ?? currentJob?.title ?? null,
    current_company: currentJob?.company_name ?? null,
    location_city: person.location?.city ?? null,
    location_state: person.location?.state ?? null,
    location_country: person.location?.country ?? null,
    experience_years,
    skills: person.skills ?? [],
    linkedin_url: person.linkedin_url ?? null,
    job_history_json: allHistory,
    estimated_notice_days,
    notice_label,
    email: person.email?.revealed ? (person.email.email ?? null) : null,
    phone: person.mobile?.revealed ? (person.mobile.mobile ?? null) : null,
  };
}

// ─── 5. Notice Period Estimator ───────────────────────────────────────────────
// Indian white-collar norms: <1yr=15d, 1-2yr=30d, 2-4yr=60d, 4yr+=90d
export function estimateNoticePeriod(tenureMonths: number | null): {
  days: number | null;
  label: string | null;
} {
  if (tenureMonths === null || tenureMonths === undefined) {
    return { days: null, label: null };
  }
  if (tenureMonths < 12) return { days: 15, label: "~15d (est.)" };
  if (tenureMonths < 24) return { days: 30, label: "~30d (est.)" };
  if (tenureMonths < 48) return { days: 60, label: "~60d (est.)" };
  return { days: 90, label: "~90d+ (est.)" };
}

// ─── 6. WhatsApp Link Generator (India-specific) ─────────────────────────────
export function generateWhatsAppJobLink(
  phone: string,
  jobTitle: string,
  recruiterName: string,
  companyName?: string
): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
  const message = encodeURIComponent(
    `Hi, I'm ${recruiterName}.\n\nI came across your profile and wanted to reach out about an exciting ${jobTitle} opportunity${companyName ? " at " + companyName : ""}.\n\nWould you be open to a quick chat?\n\n— Sent via Nexire`
  );
  return `https://wa.me/${intlPhone}?text=${message}`;
}
