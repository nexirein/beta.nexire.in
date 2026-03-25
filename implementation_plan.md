# Phase 3 — Scalable 3-Path Filter Resolution Architecture

## Problem Statement
The current pipeline sends user context directly to `extract-and-resolve`. We need a smarter flow:
1. **Chat accumulates context** → asks follow-up questions
2. **When ready**, context is sent to LLM for **precise structured extraction** (not guessing)
3. Three separate resolution paths run in parallel:
   - **Path A** (Prospeo Suggestions API): job_titles + locations → exact API-validated strings
   - **Path B** (Vector Similarity pgvector): technologies, industries, departments → exact enum matches from 6K+ records
   - **Path C** (Direct LLM Mapping): seniority, headcount_range, funding_stage, company_type → 100% exact from small whitelists

---

## Architecture Flow

```
User Chats → Chat API (COLLECTING)
                  ↓ when ready_for_search = true
         Chat Accumulated Context
                  ↓
         [NEW] /api/ai/context-to-filters
                  |
                  ├── Step 1: LLM Structured Extraction 
                  │   (gemini-2.5-flash, temp=0)
                  │   Input: raw collected context
                  │   Output: {
                  │     raw_job_titles[], raw_locations[],
                  │     raw_tech[], raw_industry[], raw_department[],
                  │     person_seniority[],       ← small whitelist, mapped exactly
                  │     company_headcount_range[], ← small whitelist, mapped exactly
                  │     company_funding_stage[],  ← small whitelist, mapped exactly
                  │     company_type, experience_min, experience_max, keywords[]
                  │   }
                  │
                  ├── Step 2: Run 5 resolvers in PARALLEL
                  │   A. Prospeo Suggestions API (title)  → string[]
                  │   A. Prospeo Suggestions API (loc)    → string[]
                  │   B. pgvector (technology)            → ResolvedMatch[]
                  │   B. pgvector (industry)              → ResolvedMatch[]
                  │   B. pgvector (department)            → ResolvedMatch[]
                  │
                  └── Step 3: filter-assembler
                      Stitches A+B+C into exact Prospeo filter JSON
```

---

## 3. What Changes

### 3.1 Improve Chat AI Prompt (`/api/ai/chat`)
**Problem**: The current prompt returns vague questions and the AI sometimes crashes (seen in screenshot).

**Fix**:
- Remove the all-in-one context extraction from the chat — the chat is ONLY for **conversation and collecting plain text info**.
- The chat prompt should produce ONLY `ai_message` + `suggested_questions` — NO context parsing in the chat API itself.
- Context accumulation happens purely from what the user says in plain English.
- Add better India-specific intelligence + fallback when the AI faces an error.

### 3.2 New: Dedicated LLM Extraction Step (`/api/ai/context-to-filters`)
**Why separate?**: The chat must be fast and conversational. The resolution step is a separate backend pipeline that runs silently. 

- **Input**: The raw accumulated messages as a single joined string.
- **Output**: Precisely typed [LLMExtractedFilters](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/extractor.ts#50-65) in Step 1.
- **LLM Prompt**: Much more powerful — includes the COMPLETE whitelist for seniority, headcount, and funding stages so the LLM can map them directly without guessing.

### 3.3 Upgrade [filter-assembler.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/filter-assembler.ts)
- Add missing Prospeo filters: `person_time_in_current_role`, `max_person_per_company`
- Fix `person_job_title` to use `match_only_exact_job_titles: false` for better recall on Prospeo
- Keep only **confident** vector matches (score >= 1.24)

### 3.4 Fix Chat UI Issues (from screenshot)
- **Job Description / Manual Filters chips**: Only show when `messages.length === 0` (disappear on first message)
- **Input bar**: Move to absolute bottom-of-screen with proper styling
- **Error handling**: Remove the "Sorry, I had trouble..." fallback — it confuses users. Replace with a retry mechanism.

---

## 4. Files to Modify/Create

| File | Action | Notes |
|---|---|---|
| [app/api/ai/chat/route.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/app/api/ai/chat/route.ts) | MODIFY | Simplify prompt — chat only for conversation, no context parsing |
| `app/api/ai/context-to-filters/route.ts` | NEW | Runs the full 3-path resolution pipeline |
| [lib/ai/extractor.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/extractor.ts) | MODIFY | Add company_type, person_time_in_current_role to schema |
| [lib/ai/filter-assembler.ts](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/lib/ai/filter-assembler.ts) | MODIFY | Add missing fields |
| [components/search/chat/SearchTerminal.tsx](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/components/search/chat/SearchTerminal.tsx) | MODIFY | Fix UI chips disappearing + input positioning |
| [supabase/migrations/0020_search_conversations.sql](file:///Users/bipulsikder16/Movies/Nexire.in/Client-APP%20/Test1%20exp/nexire-app2/supabase/migrations/0020_search_conversations.sql) | Already exists | Apply to DB via MCP |

---

## 5. Verification Plan
1. Test the chat with vague input and verify smart follow-up questions are generated
2. Test the resolution endpoint directly (`/api/ai/context-to-filters`) via Thunder Client with a sample accumulated context
3. Verify the vector similarity returns exact Prospeo enum strings for tech/industry
4. Verify the Prospeo Suggestions API returns structured location objects
