// nexire-app — lib/redis/keys.ts
// All Redis key patterns as constants. Use these everywhere — never hardcode.

export const REDIS_KEYS = {
  // ─── Rate Limiting ───────────────────────────────────────────────────────
  /** Per-account per-minute counter. TTL: 60s */
  rateLimitMinute: (accountId: string) =>
    `RATE_LIMIT:account:${accountId}:minute`,

  /** Per-account per-second counter. TTL: 1s */
  rateLimitSecond: (accountId: string) =>
    `RATE_LIMIT:account:${accountId}:second`,

  /** Account is blocked due to rate limit. TTL: 60s */
  rateLimitBlocked: (accountId: string) =>
    `RATE_LIMIT:blocked:${accountId}`,

  // ─── Search Cache ────────────────────────────────────────────────────────
  /** Cached search results for a given search + page. TTL: 24h */
  searchPage: (searchId: string, page: number) =>
    `SEARCH_CACHE:${searchId}:page:${page}`,

  /** Legacy key pattern (kept for backwards compatibility) */
  searchCache: (searchId: string, page: number) =>
    `SEARCH_CACHE:${searchId}:page:${page}`,

  // ─── Account Credits ─────────────────────────────────────────────────────
  /** Cached credits remaining for an account. Sync every 5 min. */
  accountCredits: (orgId: string) =>
    `ACCOUNT_CREDITS:${orgId}`,

  // ─── Profile Cache ────────────────────────────────────────────────────────
  /** Cached user profile + org. TTL: 10 min */
  userProfile: (userId: string) =>
    `PROFILE:${userId}`,

  // ─── Suggestions Cache ───────────────────────────────────────────────────
  /** Cached location suggestions from Prospeo. TTL: 7 days */
  suggestionsLocation: (query: string) =>
    `SUGGESTIONS_CACHE:location:${encodeURIComponent(query.toLowerCase())}`,

  /** Cached job title suggestions from Prospeo. TTL: 1 day */
  suggestionsJobTitle: (query: string) =>
    `SUGGESTIONS_CACHE:jobtitle:${encodeURIComponent(query.toLowerCase())}`,

  // ─── CrustData Autocomplete Cache ────────────────────────────────────────
  /** Cached CrustData autocomplete suggestions. TTL: 7 days */
  crustdataAutocomplete: (query: string) =>
    `CRUSTDATA_AUTOCOMPLETE:${encodeURIComponent(query.toLowerCase())}`,

  // ─── Logo Cache ──────────────────────────────────────────────────────────
  /** Cached logo URL for a given institute name. TTL: 7 days */
  logoSearch: (name: string) =>
    `LOGO_CACHE:${encodeURIComponent(name.toLowerCase().trim())}`,

} as const;

// ─── TTL Constants (in seconds) ────────────────────────────────────────────
export const REDIS_TTL = {
  RATE_LIMIT_MINUTE: 60,
  RATE_LIMIT_SECOND: 1,
  RATE_LIMIT_BLOCKED: 60,
  SEARCH_CACHE: 60 * 60 * 24,              // 24 hours
  ACCOUNT_CREDITS: 60 * 5,                 // 5 minutes
  USER_PROFILE: 60 * 10,                   // 10 minutes
  SUGGESTIONS_LOCATION: 60 * 60 * 24 * 7, // 7 days
  SUGGESTIONS_JOB_TITLE: 60 * 60 * 24,    // 1 day
  CRUSTDATA_AUTOCOMPLETE: 60 * 60 * 24 * 7, // 7 days
  LOGO_CACHE: 60 * 60 * 24 * 7,           // 7 days
} as const;
