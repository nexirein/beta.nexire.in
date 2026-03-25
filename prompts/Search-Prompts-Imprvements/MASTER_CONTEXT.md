

highest priority after the changes you made after finishiing the codes from now in doc section you have to make everythings that you are building there flow logic all the things how its working . 


# MASTER CONTEXT — Always include this at the top of every prompt session

## Project: Nexire
**What we are building:** Juicebox for India — an AI-powered recruitment platform where HR professionals
type requirements in plain English and get perfectly filtered candidate results.

**Tech Stack (do not change unless explicitly told):**
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Backend: Node.js / Next.js API routes + Python microservice (FastAPI) for AI pipeline
- Database: PostgreSQL (primary), Redis (cache/rate-limiting)
- ORM: Prisma
- AI/ML: OpenAI gpt-4o-mini (LLM extraction), sentence-transformers all-MiniLM-L6-v2 (FAISS embeddings)
- Vector Store: FAISS (local, in-memory, IndexFlatIP)
- External API: Prospeo (https://api.prospeo.io) — candidate search database

## Design Language
- **Theme:** Deep black background (#0A0A0A), like Ruixen AI (image reference: Screenshot-2026-03-07-at-11.02.02-AM.jpg)
- **Accent:** Electric purple/violet (#7C3AED to #A855F7 gradient range)
- **Text:** Pure white (#FFFFFF) primary, zinc-400 secondary
- **Cards/Surfaces:** #111111 with #1A1A1A borders (subtle 1px)
- **Font:** Inter (clean, well-defined typography — similar to Ruixen AI)
- **Glow effects:** Subtle purple radial glows on hero elements (like Ruixen AI landing)
- **Sidebar:** Dark #0D0D0D, active items with purple highlight
- **Inspiration references:** Ruixen AI (chat interface + layout), Juicebox (project/search UX), Cluely (typography clarity)

## Prospeo API — Key Facts
- Base URL: https://api.prospeo.io
- Auth: X-KEY header
- Search endpoint: POST /search-person
- Suggestions endpoint: GET /search-suggestions (for location_search and job_title_search only)
- Rate limit: 15 requests/second per API key
- Results: 25 per page, max 1000 pages
- Credits: 1 credit per search request that returns results
- Max technologies in one filter: 20 include + 20 exclude

## Key Enum Sizes (memorize these)
- person_seniority: 10 values (C-Suite, Director, Entry, Founder/Owner, Head, Intern, Manager, Partner, Senior, Vice President)
- company_headcount_range: 11 values (1-10 through 10000+)
- company_type: 4 values (Private, Public, Non Profit, Other)
- company_funding.stage: 23 values
- person_department: 14 values
- company_industry: 256 values → use FAISS resolver
- company_technology: 4,946 values → use FAISS resolver
- company_email_provider: 107 values
- Revenue ranges: 14 string values (<100K through 10B+)

## AI Pipeline Architecture (non-negotiable)
1. HR types plain text → gpt-4o-mini extracts raw JSON (no enum values in output)
2. raw_tech[] → FAISS cosine search → Prospeo exact technology values
3. raw_industry[] → FAISS cosine search → Prospeo exact industry values
4. raw_location → Prospeo Search Suggestions API
5. raw_job_title → Prospeo Search Suggestions API
6. raw_seniority/headcount/funding → direct enum lookup table
7. All resolvers run in parallel → assemble final Prospeo filter JSON
8. HR reviews auto-filled filters in UI → clicks Search

## Naming Conventions
- Project ID format: `proj_[nanoid]`
- Search ID format: `srch_[nanoid]` (inspired by Juicebox pattern)
- Contact ID format: `cont_[nanoid]`
- API keys in DB: encrypted with AES-256

## Folder Structure (maintain this)
```
nexire/
├── app/                    # Next.js App Router
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── projects/
│   │   └── admin/
│   └── api/
├── components/
│   ├── ui/                 # shadcn base components
│   ├── search/             # Search modal, filter modal, results
│   ├── projects/           # Project sidebar, cards
│   └── profile/            # Candidate profile panel
├── lib/
│   ├── prospeo/            # Prospeo API client
│   ├── ai/                 # LLM extraction, FAISS resolver
│   └── db/                 # Prisma client
├── python-service/         # FastAPI — FAISS + embedding pipeline
│   ├── main.py
│   ├── faiss_index/
│   └── embeddings/
└── prompts/                # This folder
```

highest priority after the changes you made after finishiing the codes from now in doc section you have to make everythings that you are building there flow logic all the things how its working and store all of them in / docs>/Documentation-of-Dev folder