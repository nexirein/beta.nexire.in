# Phase 0 — Infrastructure, Database Schema & Project Setup
> Prepend MASTER_CONTEXT.md before running this prompt.

## Goal
Set up the complete foundational infrastructure: database schema, environment config,
Prisma models, Redis setup, and base Next.js project with all dependencies installed.

---

## 0.1 — Install Dependencies

Install the following packages (do not change versions unless conflict):
```
next@14, typescript, tailwindcss, @prisma/client, prisma, shadcn-ui,
nanoid, redis (ioredis), zod, openai, axios, react-hot-toast,
lucide-react, framer-motion, @tanstack/react-query, clsx, tailwind-merge
```
Python service (python-service/requirements.txt):
```
fastapi, uvicorn, sentence-transformers, faiss-cpu, numpy, pydantic, httpx, python-dotenv
```

---

## 0.2 — Environment Variables

Create `.env.local` with these keys (leave values empty for user to fill):
```
DATABASE_URL=
REDIS_URL=
OPENAI_API_KEY=
ENCRYPTION_SECRET=          # 32-char AES key for encrypting Prospeo API keys
NEXTAUTH_SECRET=
NEXTAUTH_URL=
PYTHON_SERVICE_URL=http://localhost:8001   # FastAPI microservice
```

---

## 0.3 — Prisma Schema

Create `prisma/schema.prisma` with the following models:

### User
```
id, email, name, passwordHash, role (ADMIN | USER), createdAt, updatedAt
workspaceId (FK → Workspace)
```

### Workspace
```
id, name, slug, createdAt
users[], projects[], apiAccounts[]
```

### ApiAccount
```
id (format: acc_nanoid), workspaceId (FK), label (e.g. "Account 1"),
encryptedApiKey (AES-256 encrypted), isActive (bool), priority (int, for round-robin),
creditsRemaining (int), dailyRequestCount (int), lastUsedAt (DateTime), createdAt
```
*This is the multi-account table — workspace can have multiple Prospeo API keys*

### Project
```
id (format: proj_nanoid), workspaceId (FK), name, description,
createdById (FK → User), status (ACTIVE | ARCHIVED),
createdAt, updatedAt
searches[], shortlistedContacts[]
```

### Search
```
id (format: srch_nanoid), projectId (FK), workspaceId (FK),
name (auto-generated like "B2B SaaS PM"),
type (FILTER_SEARCH | JD_SEARCH),
inputText (the original HR text / JD pasted),
filtersApplied (JSON — the exact Prospeo filter payload used),
aiExtractedRaw (JSON — what LLM extracted before FAISS resolution),
totalResults (int), totalPages (int),
apiAccountUsed (FK → ApiAccount),
createdById (FK → User), createdAt, updatedAt
results[] (→ SearchResult)
```

### SearchResult
```
id, searchId (FK), page (int),
prospeoPersonId (string — from Prospeo response),
personData (JSON — full person object from Prospeo),
companyData (JSON — full company object from Prospeo),
isShortlisted (bool default false),
isViewed (bool default false),
revealedEmail (string nullable),
createdAt
```
*Index on: searchId + page, prospeoPersonId, isShortlisted*

### Contact (shortlisted candidates)
```
id (format: cont_nanoid), workspaceId (FK), projectId (FK),
prospeoPersonId (string), personData (JSON), companyData (JSON),
notes (text), tags (string[]),
addedById (FK → User), createdAt, updatedAt
```

### AdminConfig
```
id, key (string unique), value (JSON), updatedAt
```
*Stores global config like: default_rate_limit, max_accounts_per_workspace, etc.*

---

## 0.4 — Redis Key Patterns

Define these Redis key patterns as constants in `lib/redis/keys.ts`:
```
RATE_LIMIT:account:{accountId}:minute    → counter, TTL 60s
RATE_LIMIT:account:{accountId}:second    → counter, TTL 1s
SEARCH_CACHE:{searchId}:page:{page}      → JSON string, TTL 24h
ACCOUNT_CREDITS:{accountId}             → int, sync every 5 min
SUGGESTIONS_CACHE:location:{query}       → JSON, TTL 7 days
SUGGESTIONS_CACHE:jobtitle:{query}       → JSON, TTL 1 day
```

---

## 0.5 — Prisma Migrations

After defining the schema:
1. Run `npx prisma generate`
2. Run `npx prisma migrate dev --name init`
3. Create a seed file `prisma/seed.ts` that creates:
   - 1 default workspace: `{ name: "Nexire Demo", slug: "nexire-demo" }`
   - 1 admin user: `{ email: "admin@nexire.in", role: "ADMIN" }`
   - 1 AdminConfig entry: `{ key: "rate_limit_per_second", value: 14 }`

---

## 0.6 — Prospeo API Client

Create `lib/prospeo/client.ts`:
- Class `ProspeoCient` with constructor taking `apiKey: string`
- Method `searchPerson(filters: ProspeoFilters, page: number)` → calls POST /search-person
- Method `getSearchSuggestions(type: 'location_search' | 'job_title_search', query: string)` → GET /search-suggestions
- All responses typed with Zod schemas matching Prospeo's exact response format
- Throw typed errors for: INSUFFICIENT_CREDITS, RATE_LIMITED, INVALID_FILTERS, INVALID_API_KEY
- Export type `ProspeoFilters` as a complete TypeScript interface matching ALL filters documented in MASTER_CONTEXT

---

## 0.7 — Account Rotation Service

Create `lib/prospeo/account-manager.ts`:
- `getAvailableAccount(workspaceId: string)`: queries DB for active ApiAccount with lowest request count, not rate-limited
- `markAccountUsed(accountId: string)`: increments daily counter, updates lastUsedAt
- `markAccountRateLimited(accountId: string)`: sets a Redis key `RATE_LIMIT:blocked:{accountId}` TTL 60s
- `rotateToNextAccount(workspaceId: string, currentAccountId: string)`: returns next available account by priority
- Logic: round-robin across accounts, skip blocked accounts, throw `NoAccountAvailableError` if all blocked

---

## Deliverable Checklist
- [ ] All npm/pip packages installed
- [ ] .env.local created with all keys
- [ ] Prisma schema complete with all 7 models
- [ ] Redis key constants defined
- [ ] Prisma migration runs without error
- [ ] Seed script works
- [ ] ProspeoCient class with full TypeScript types
- [ ] AccountManager service ready
