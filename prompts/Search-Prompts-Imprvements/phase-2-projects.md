# Phase 2 — Projects, Search IDs, Routing & URL Architecture
> Prepend MASTER_CONTEXT.md before running this prompt.
> Reference: Juicebox URL pattern: /project/{projectId}/search?search_id={searchId}&contact={contactId}

## Goal
Build the routing architecture, search creation flow, search listing per project,
URL-driven state management, and the database read/write layer for searches.

---

## 2.1 — URL Structure

Implement these exact routes in Next.js App Router:

```
/projects                                           → All projects dashboard
/projects/[projectId]                               → Redirect to /projects/[projectId]/searches
/projects/[projectId]/searches                      → Searches list for project
/projects/[projectId]/searches/[searchId]           → Search results page
/projects/[projectId]/searches/[searchId]?contact=[contactId]  → Results + profile panel open
/projects/[projectId]/shortlist                     → Shortlisted candidates
/projects/[projectId]/contacts                      → All contacts
/projects/[projectId]/analytics                     → Analytics (Phase 8)
/admin                                              → Admin panel (Phase 6)
```

The URL must be the single source of truth:
- Opening a profile: push `?contact=cont_xxx` to URL → profile panel opens
- Closing profile: remove `?contact` param → panel closes
- Navigating pages: push `?page=2` → load page 2 results
- This enables shareable links exactly like Juicebox

---

## 2.2 — API Routes for Projects

Create these Next.js API routes:

### GET /api/projects
Returns all projects for current workspace (sorted by updatedAt desc).
Response: `{ projects: Project[] }`

### POST /api/projects
Body: `{ name: string, description?: string }`
Creates new project with `id: proj_${nanoid(12)}`.
Response: `{ project: Project }`

### GET /api/projects/[projectId]
Returns single project with recent searches (last 5).
Response: `{ project: Project, recentSearches: Search[] }`

### PATCH /api/projects/[projectId]
Body: `{ name?, description?, status? }`
Update project. Only project creator or ADMIN can update.

### DELETE /api/projects/[projectId]
Soft delete (set status: ARCHIVED). Never hard delete.

---

## 2.3 — API Routes for Searches

### GET /api/projects/[projectId]/searches
Returns all searches for a project, sorted by createdAt desc.
Each search: id, name, type, totalResults, createdAt, filtersApplied (summary only — first 3 filter keys)
Response: `{ searches: Search[] }`

### POST /api/projects/[projectId]/searches
Body: `{ name?: string, type: 'FILTER_SEARCH' | 'JD_SEARCH', filters: ProspeoFilters, inputText?: string, aiExtractedRaw?: object }`
Actions:
1. Generate `id: srch_${nanoid(12)}`
2. Select best available ApiAccount via AccountManager
3. Call Prospeo search-person API (page 1)
4. Store SearchResult records for all 25 results in DB (upsert by prospeoPersonId+searchId)
5. Cache results in Redis: `SEARCH_CACHE:{searchId}:page:1` TTL 24h
6. Store full Search record with totalResults, totalPages from Prospeo pagination
7. Return: `{ search: Search, results: SearchResult[], pagination: object }`

### GET /api/projects/[projectId]/searches/[searchId]
Returns search metadata + results for a given page.
Query params: `?page=1`
Logic:
1. Check Redis cache first: `SEARCH_CACHE:{searchId}:page:{page}` → return if hit
2. If cache miss → call Prospeo API again → store in DB + cache → return
Response: `{ search: Search, results: SearchResult[], pagination: object }`

### PATCH /api/projects/[projectId]/searches/[searchId]
Body: `{ name? }` — only name can be updated post-creation.

---

## 2.4 — Search Result Actions

### POST /api/searches/[searchId]/results/[resultId]/shortlist
Adds candidate to shortlist (creates Contact record if not exists, sets isShortlisted=true).

### POST /api/searches/[searchId]/results/[resultId]/reveal-email
Calls Prospeo Enrich Person endpoint with person_id.
Stores revealed email in SearchResult.revealedEmail.
Returns email.
*Note: This consumes additional Prospeo credits — warn user before calling.*

### PATCH /api/searches/[searchId]/results/[resultId]/viewed
Sets isViewed=true on SearchResult. Called when profile panel opens.

---

## 2.5 — Searches List Page

Create `app/(dashboard)/projects/[projectId]/searches/page.tsx`:

Shows all searches in the project as a list:
- Each search card: search name, type badge (AI/JD or Manual Filter), total results count, date, filter summary tags
- Click → navigates to `/projects/[projectId]/searches/[searchId]`
- "+ New Search" button (top right) → triggers the Search Creation flow (Phase 3)
- Empty state: "No searches yet" with CTA

---

## 2.6 — Search Name Auto-generation

When creating a search without a name:
- Use the first 2 non-trivial filter values to generate name
- Examples: "Python · Bangalore", "B2B SaaS PM", "Senior Engineer · Series B"
- Format: `{primary_identifier} · {location_or_seniority}`
- Max 30 chars, truncate if needed

---

## Deliverable Checklist
- [ ] All URL routes registered and navigable
- [ ] URL state drives profile panel open/close
- [ ] All 5 Project API routes implemented
- [ ] All Search API routes implemented + Prospeo integration
- [ ] Search results stored in DB on every API call
- [ ] Redis caching for search results
- [ ] Reveal email route with credit warning
- [ ] Searches list page renders with real data
- [ ] Search name auto-generation working
- [ ] Account rotation fires on RATE_LIMITED or INSUFFICIENT_CREDITS errors
