# Redis Caching Architecture — Nexire

## Overview

Nexire uses **Upstash Redis** (HTTP-based, serverless) as a distributed caching and rate-limiting layer between the Next.js API routes and Supabase. The goal is to absorb high traffic at scale without hammering the database on every request.

Redis is configured to **fail gracefully** — if Upstash is unavailable, every route falls through to Supabase without error.

---

## Core Files

| File | Purpose |
|---|---|
| `lib/redis/client.ts` | Raw Upstash REST client via native `fetch`. No NPM package required. |
| `lib/redis/keys.ts` | **Centralized key patterns + TTL constants.** Never hardcode a Redis key. |
| `lib/redis/rate-limiter.ts` | Generic sliding-window rate limiter using `INCR + EXPIRE`. |
| `lib/redis/search-cache.ts` | Legacy hash-based search cache helper (still used by `POST /api/search` flow). |

---

## Integration Points

### 1. Search Page Cache — `GET /api/searches/[searchId]/results`
**Key:** `SEARCH_CACHE:{searchId}:page:{N}` **TTL: 24 hours**

The most expensive route. Previously required:
1. Auth check (Supabase)
2. Meta fetch from `search_results`
3. JOIN query from `search_result_items` + `people`
4. Reveals lookup from `reveals`
5. Count query for pagination

Now: on the second request for any page, the **entire assembled response** is returned from Redis in ~5ms. Cache is **flushed automatically** when `POST /api/searches/[searchId]/results` is called (new search saved). This ensures re-searches always show fresh data.

---

### 2. Credits Balance Cache — `GET /api/credits/balance`
**Key:** `ACCOUNT_CREDITS:{orgId}` **TTL: 5 minutes**

The topbar polls this route every ~30s. Previously = 2 Supabase queries per call. With 1000 concurrent users:
- **Before:** ~2000 DB reads/min
- **After:** ~1 DB read per 5 min per org = **99.9% reduction**

---

### 3. User Profile Cache — `GET /api/profile`
**Key:** `PROFILE:{userId}` **TTL: 10 minutes**

Caches the full profile + org row. Flushed on `PATCH /api/profile` by setting the key to expire in 1 second.

---

### 4. Suggestions Cache — `GET /api/suggestions`
**Key:** `suggest:crust:{field}:{q}` **TTL: 30 minutes**

Caches CrustData field suggestion results (titles, regions, skills etc). Built directly into the existing route.

---

### 5. CrustData Autocomplete — `POST /api/crustdata/autocomplete`
**Key:** `CRUSTDATA_AUTOCOMPLETE:{type}:{query}` **TTL: 7 days**

Autocomplete data from CrustData's API is essentially static reference data. Cached for 7 days. Every unique query typed by any user is globally cached — so the 1,000th person to type "React" gets an instant response.

---

### 6. Logo Search Cache — `GET /api/logo/search`
**Key:** `logo:inst:{name}` **TTL: 30 days**

Caches logo.dev API results per institute name. Missing logos (no domain found) are cached as the sentinel value `"NONE"` to prevent repeated API calls. 

---

## Rate Limiting — `POST /api/search`
**Limit: 5 searches per user per minute**

Uses `INCR + EXPIRE` sliding window. Exceeding the limit returns:
```json
HTTP 429 Too Many Requests
Retry-After: {seconds}
{ "error": "RATE_LIMITED", "message": "Too many searches. Please wait a moment." }
```

---

## Failure Mode
Every Redis call is wrapped in `try/catch`. If Upstash is down or rate-limited itself, all routes transparently fall through to Supabase. Users never see errors from Redis failures.

---

## Cache Invalidation Strategy

| Event | Action |
|---|---|
| New results saved for a search | Flush pages 1-10 for that `searchId` |
| User updates profile | Set `PROFILE:{userId}` TTL → 1s |
| Billing/reveal event (future) | Flush `ACCOUNT_CREDITS:{orgId}` |

---

## Production Scaling Notes

- **Upstash Free Tier:** 10,000 commands/day. For 100 paid users this should be comfortable for initial launch.
- **Upstash Pay-as-you-go:** ~$0.2 per 100,000 commands. A 1,000-user scale system would cost approximately **$2-5/day** in Redis reads — orders of magnitude cheaper than the same load on Supabase compute.
- **Cold start:** The first user to view any search page for any given 24h window will trigger a Supabase query. All subsequent users get Redis. This is acceptable.
