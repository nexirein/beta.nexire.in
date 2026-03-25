<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

M03 — TASK 02: UPSTASH REDIS — RATE LIMITER + SEARCH CACHE
Trae: Read CLAUDE.md first.
Redis serves 2 purposes: (1) rate limit every API call, (2) cache Prospeo results
Free tier: 10,000 commands/day. Architecture ensures we stay under this.
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build 3 Redis utilities:

Client singleton (lib/redis/client.ts)

Rate limiter — 3 layers: per-IP (edge), per-user-hour, per-user-day

Search cache — 24h TTL, prevents duplicate Prospeo calls

FILE 1 — lib/redis/client.ts
typescript
// nexire-app — lib/redis/client.ts
import { Redis } from "@upstash/redis";

// Singleton — reused across requests in same worker
let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
    }
    redisInstance = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisInstance;
}
FILE 2 — lib/redis/rate-limiter.ts
typescript
// nexire-app — lib/redis/rate-limiter.ts
import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./client";

// Plan-based rate limits
const LIMITS = {
  search: {
    free:   { hourly: 20,  daily: 50  },
    solo:   { hourly: 80,  daily: 400 },
    growth: { hourly: 200, daily: 1000 },
    custom: { hourly: 500, daily: 3000 },
  },
  reveal: {
    free:   { hourly: 5,  daily: 10  },
    solo:   { hourly: 50, daily: 100 },
    growth: { hourly: 100, daily: 300 },
    custom: { hourly: 300, daily: 1000 },
  },
} as const;

export type RateLimitAction = "search" | "reveal";
export type PlanTier = "free" | "solo" | "growth" | "custom";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;        // Unix timestamp (ms)
  retryAfter?: number;  // seconds to wait
  limitType?: "hourly" | "daily";
}

// ─── Check rate limit for a user ─────────────────────────────────
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
  planTier: PlanTier = "free"
): Promise<RateLimitResult> {
  const redis = getRedis();
  const limits = LIMITS[action][planTier] ?? LIMITS[action].free;
  const now = Date.now();

  // Keys
  const hourKey = `rl:${action}:${userId}:h:${Math.floor(now / 3600000)}`;
  const dayKey  = `rl:${action}:${userId}:d:${new Date().toISOString().slice(0, 10)}`;

  // Atomic pipeline: increment both counters
  const pipeline = redis.pipeline();
  pipeline.incr(hourKey);
  pipeline.incr(dayKey);
  pipeline.expire(hourKey, 3600);
  pipeline.expire(dayKey, 86400);
  const [hourCount, dayCount] = await pipeline.exec() as number[];

  // Check hourly
  if (hourCount > limits.hourly) {
    const resetMs = (Math.floor(now / 3600000) + 1) * 3600000;
    return {
      allowed: false,
      remaining: 0,
      reset: resetMs,
      retryAfter: Math.ceil((resetMs - now) / 1000),
      limitType: "hourly",
    };
  }

  // Check daily
  if (dayCount > limits.daily) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return {
      allowed: false,
      remaining: 0,
      reset: tomorrow.getTime(),
      retryAfter: Math.ceil((tomorrow.getTime() - now) / 1000),
      limitType: "daily",
    };
  }

  return {
    allowed: true,
    remaining: Math.min(limits.hourly - hourCount, limits.daily - dayCount),
    reset: (Math.floor(now / 3600000) + 1) * 3600000,
  };
}

// ─── Rate limit middleware helper for API routes ──────────────────
export function rateLimitResponse(result: RateLimitResult) {
  if (result.allowed) return null;
  return {
    status: 429,
    body: {
      error: "RATE_LIMIT_EXCEEDED",
      message: result.limitType === "hourly"
        ? `Hourly search limit reached. Try again in ${Math.ceil(result.retryAfter! / 60)} minutes.`
        : `Daily search limit reached. Resets at midnight.`,
      retryAfter: result.retryAfter,
      reset: result.reset,
    },
    headers: {
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.reset),
      "Retry-After": String(result.retryAfter ?? 60),
    },
  };
}
FILE 3 — lib/redis/search-cache.ts
typescript
// nexire-app — lib/redis/search-cache.ts
// Caches Prospeo search results for 24h.
// Same query = free. Prevents wasting Prospeo credits on repeated searches.

import { getRedis } from "./client";
import { createHash } from "crypto";
import type { ProspeoSearchResponse } from "@/lib/prospeo/types";

const CACHE_TTL = 86400; // 24 hours in seconds
const CACHE_PREFIX = "sc:"; // search cache prefix

// Build a stable cache key from filters
export function buildCacheKey(
  filters: Record<string, any>,
  page: number
): string {
  const normalized = JSON.stringify({ ...filters, _page: page }, Object.keys({ ...filters, _page: page }).sort());
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `${CACHE_PREFIX}${hash}`;
}

// Get cached search result
export async function getCachedSearch(
  cacheKey: string
): Promise<ProspeoSearchResponse | null> {
  const redis = getRedis();
  try {
    const cached = await redis.get<ProspeoSearchResponse>(cacheKey);
    return cached ?? null;
  } catch {
    return null; // Cache miss on error — never block the request
  }
}

// Store search result in cache
export async function setCachedSearch(
  cacheKey: string,
  data: ProspeoSearchResponse
): Promise<void> {
  const redis = getRedis();
  try {
    await redis.set(cacheKey, data, { ex: CACHE_TTL });
  } catch {
    // Cache write failure is non-fatal — log but continue
    console.warn("[Redis] Cache write failed for key:", cacheKey);
  }
}

// Invalidate a specific cache entry (e.g. after data change)
export async function invalidateCacheKey(cacheKey: string): Promise<void> {
  const redis = getRedis();
  try {
    await redis.del(cacheKey);
  } catch {}
}

// Get remaining TTL for a key (for UI to show "cached result" badge)
export async function getCacheTTL(cacheKey: string): Promise<number> {
  const redis = getRedis();
  try {
    return await redis.ttl(cacheKey);
  } catch {
    return -1;
  }
}

// ─── Usage stats helper (for admin dashboard) ────────────────────
export async function getRedisCacheStats(userId: string) {
  const redis = getRedis();
  try {
    const [searchH, revealH, searchD, revealD] = await redis.mget<number[]>(
      `rl:search:${userId}:h:${Math.floor(Date.now() / 3600000)}`,
      `rl:reveal:${userId}:h:${Math.floor(Date.now() / 3600000)}`,
      `rl:search:${userId}:d:${new Date().toISOString().slice(0, 10)}`,
      `rl:reveal:${userId}:d:${new Date().toISOString().slice(0, 10)}`
    );
    return {
      searches_this_hour: searchH ?? 0,
      reveals_this_hour:  revealH ?? 0,
      searches_today:     searchD ?? 0,
      reveals_today:      revealD ?? 0,
    };
  } catch {
    return { searches_this_hour: 0, reveals_this_hour: 0, searches_today: 0, reveals_today: 0 };
  }
}
FILE 4 — Cloudflare Rate Limit Config (Manual Setup — not code)
Add these rules in Cloudflare Dashboard → Security → WAF → Rate Limiting:

Rule 1 — Search endpoint protection:
Expression: (http.request.uri.path eq "/api/search") and (http.request.method eq "POST")
Rate: 30 requests per minute per IP
Action: Block for 60 seconds

Rule 2 — Reveal endpoint protection:
Expression: (http.request.uri.path contains "/api/reveal")
Rate: 20 requests per minute per IP
Action: Block for 120 seconds

Rule 3 — Auth brute force:
Expression: (http.request.uri.path contains "/api/auth")
Rate: 10 requests per minute per IP
Action: Block for 300 seconds

This adds a free layer BEFORE Redis, saving Redis commands for legitimate users.

FILE 5 — lib/redis/index.ts [Re-export for clean imports]
typescript
export { getRedis } from "./client";
export { checkRateLimit, rateLimitResponse } from "./rate-limiter";
export {
  buildCacheKey, getCachedSearch, setCachedSearch,
  invalidateCacheKey, getCacheTTL, getRedisCacheStats
} from "./search-cache";
export type { RateLimitResult, RateLimitAction, PlanTier } from "./rate-limiter";
COMPLETION CHECKLIST
 lib/redis/client.ts — singleton Redis instance

 lib/redis/rate-limiter.ts — plan-based hourly + daily limits

 lib/redis/search-cache.ts — 24h cache with SHA256 key hashing

 lib/redis/index.ts — clean re-exports

 checkRateLimit() tested: free user blocked after 20 searches/hour

 buildCacheKey() produces consistent hash for same filters

 getCachedSearch() returns null gracefully on Redis error (non-blocking)

 Cloudflare rules documented for manual setup

BUILD LOG ENTRY
M03-02 Redis Rate Limiter + Cache — [date]
Files: lib/redis/client.ts, rate-limiter.ts, search-cache.ts, index.ts
Limits: free=20/hr, solo=80/hr, growth=200/hr + daily caps
Cache TTL: 24h — prevents duplicate Prospeo API calls
Status: ✅ Complete