# CLAUDE.md — NEXIRE MASTER CONTEXT
# Trae / Claude Code: Read this file FIRST on every session.
# After this file, always read @_meta/HLD-COMPACT.md for architecture.

---

## WHAT IS NEXIRE
AI-powered B2B recruitment search platform for Indian staffing agencies.
Recruiters search for candidates via Prospeo API, reveal contacts (credits),
shortlist candidates, and send email sequences — all in one app.

---

## HOW TO READ TASK FILES
Every task file in nexire-prompts/ starts with this header block.
Read ALL referenced files before writing any code.

```
@_meta/HLD-COMPACT.md        ← full architecture, rules, DB schema, API conventions
@CLAUDE.md                   ← this file (rules + project context)
@docs/DATABASE.md            ← Supabase schema with 17 tables
@docs/api/[module].md        ← API contract for the specific module
```

---

## ABSOLUTE RULES (never violate these)

1. Credit logic → ONLY in lib/credits/engine.ts
2. Prospeo calls → ONLY via lib/prospeo/client.ts (never direct fetch)
3. Every API route → Zod validation + Supabase JWT check (first two lines)
4. Every DB query → scoped by org_id from server-side profile lookup
5. Secrets → SERVER only (SUPABASE_SERVICE_ROLE_KEY, PROSPEO_API_KEY never in client)
6. Rate limits → check Redis limiter BEFORE business logic, AFTER auth
7. Design → dark theme only, use design tokens from HLD-COMPACT §3
8. Error format → always { error: string } never expose raw errors

---

## FILE NAMING CONVENTIONS
  API routes:         app/api/[module]/route.ts
  Page (RSC):         app/(app)/[feature]/page.tsx
  Client component:   app/(app)/[feature]/[Name]Client.tsx
  Shared component:   components/[domain]/[Name].tsx
  DB queries:         lib/supabase/queries/[table].ts
  Types:              types/[domain].ts

---

## AFTER EVERY TASK
Append a BUILD-LOG entry to _meta/BUILD-LOG.md:
  ## [Module]-[Task] [Feature Name] — [date]
  ### Files created: [list]
  ### Status: ✅ Complete

---

## CURRENT BUILD STATUS
See _meta/BUILD-LOG.md for completed modules.
See nexire-prompts/ folder structure for all task files.

M11-SETTINGS — ✅ Complete (01-profile · 02-mailbox · 03-team · 04-usage)
All other modules — see BUILD-LOG
