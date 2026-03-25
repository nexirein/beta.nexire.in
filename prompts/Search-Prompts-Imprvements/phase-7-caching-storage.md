# Phase 7 — Search Result Caching, Storage Strategy & Database Growth
> Prepend MASTER_CONTEXT.md before running this prompt.

## Goal
Implement the complete data persistence layer: every search result stored in Postgres,
smart Redis caching, deduplication, and the foundation for Nexire's proprietary candidate database.

---

## 7.1 — Why Store Every Result

Every time Prospeo returns 25 candidates, we store them in our DB.
Long-term vision: After 10,000 searches, Nexire has its own enriched Indian candidate DB,
reducing dependency on Prospeo for repeat searches.

---

## 7.2 — Result Storage on Every Search

In `/api/projects/[projectId]/searches` (POST handler, built in Phase 2), after Prospeo returns:

```typescript
// For each of 25 results in the Prospeo response:
await prisma.searchResult.upsert({
  where: {
    searchId_prospeoPersonId: {
      searchId: newSearch.id,
      prospeoPersonId: result.person.id
    }
  },
  update: {
    personData: result.person,    // Always update with latest data
    companyData: result.company,
  },
  create: {
    id: `res_${nanoid(12)}`,
    searchId: newSearch.id,
    page: requestedPage,
    prospeoPersonId: result.person.id,
    personData: result.person,
    companyData: result.company,
    isShortlisted: false,
    isViewed: false,
  }
})
```

Additionally, maintain a global candidate index table:

### CandidateIndex table (add to Prisma schema):
```
id, prospeoPersonId (unique), linkedinUrl (unique nullable),
personDataLatest (JSON), companyDataLatest (JSON),
firstSeenAt (DateTime), lastSeenAt (DateTime), seenCount (int)
```

Upsert into CandidateIndex on every result:
```typescript
await prisma.candidateIndex.upsert({
  where: { prospeoPersonId: result.person.id },
  update: {
    personDataLatest: result.person,
    companyDataLatest: result.company,
    lastSeenAt: new Date(),
    seenCount: { increment: 1 }
  },
  create: {
    id: `cand_${nanoid(12)}`,
    prospeoPersonId: result.person.id,
    linkedinUrl: result.person.linkedin_url,
    personDataLatest: result.person,
    companyDataLatest: result.company,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    seenCount: 1
  }
})
```

*Index on: prospeoPersonId, linkedinUrl, lastSeenAt*
*This table is the foundation of Nexire's proprietary database.*

---

## 7.3 — Redis Caching Strategy

### Cache on write (when Prospeo API is called):
```typescript
// After storing in DB, cache in Redis:
await redis.setex(
  `SEARCH_CACHE:${searchId}:page:${page}`,
  86400,  // 24 hours TTL
  JSON.stringify({
    results: searchResults,
    pagination: paginationData,
    cachedAt: Date.now()
  })
)
```

### Cache on read (when page is loaded):
```typescript
async function getSearchResults(searchId: string, page: number) {
  // 1. Check Redis
  const cached = await redis.get(`SEARCH_CACHE:${searchId}:page:${page}`)
  if (cached) return JSON.parse(cached)

  // 2. Check Postgres (may have been stored from earlier)
  const dbResults = await prisma.searchResult.findMany({
    where: { searchId, page },
    orderBy: { createdAt: 'asc' }
  })
  if (dbResults.length > 0) {
    // Re-populate cache from DB
    await redis.setex(key, 86400, JSON.stringify({ results: dbResults, ... }))
    return dbResults
  }

  // 3. Fetch from Prospeo (cache miss + DB miss)
  const fresh = await prospeoClient.searchPerson(filters, page)
  // store in DB + cache then return
  return fresh
}
```

---

## 7.4 — Cache Invalidation Rules

- Search result cache: never invalidate (results are point-in-time, immutable)
- Suggestions cache (location): TTL 7 days (locations don't change often)
- Suggestions cache (job_title): TTL 1 day (job titles change more frequently)
- Account credits cache: TTL 5 minutes (sync job updates)
- Rate limit counters: TTL 1s (second) and 60s (minute) — inherently expire

---

## 7.5 — Search Results Retrieval Optimization

When user navigates to page 2, 3, etc.:
- Prefetch next page in background when user is on current page
- Store prefetched results in Redis cache proactively
- This gives instant page load for forward navigation

```typescript
// After returning page N results, fire-and-forget:
prefetchNextPage(searchId, filters, page + 1, apiAccount)
// This calls Prospeo, stores in DB+cache, returns void
```

---

## 7.6 — Deduplication Across Searches

When shortlisting a candidate, check if they exist in CandidateIndex and merge:
- If candidate appears in 3+ searches, show a "📊 Frequently matched" badge in profile panel
- Show which other searches they appeared in (within same workspace)

Create API route: `GET /api/candidates/[prospeoPersonId]/appearances`
Returns: list of search names + dates where this candidate appeared.

---

## 7.7 — Data Export (Foundation)

Create `app/api/projects/[projectId]/searches/[searchId]/export/route.ts`:
- Formats: CSV, JSON
- Exports all stored SearchResult records for a search (from DB, not Prospeo)
- CSV columns: Name, Current Title, Company, Location, LinkedIn URL, Email (if revealed), Experience Years, Shortlisted
- Respects workspace permissions (only members can export)
- Rate limit: max 5 exports per hour per workspace
- Future: Excel format with formatting

---

## Deliverable Checklist
- [ ] SearchResult upsert on every Prospeo response
- [ ] CandidateIndex table added to Prisma schema
- [ ] CandidateIndex upsert running on every result
- [ ] Redis cache write on every new search result
- [ ] Redis cache read before every Prospeo call
- [ ] DB fallback when Redis is empty
- [ ] Next-page prefetch firing in background
- [ ] Candidate appearances API route
- [ ] "Frequently matched" badge in profile panel
- [ ] CSV/JSON export route
- [ ] All database indexes created (prospeoPersonId, linkedinUrl, searchId+page)
