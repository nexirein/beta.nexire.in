# NEXIRE — Authentication Flow
# Owner: nexire-docs + nexire-backend
# Last updated: 2026-03-06

---

## Auth Provider

Nexire uses **Supabase Auth** with two login methods:
1. **Google OAuth** — for most users
2. **Magic Link** (via Resend) — email-based passwordless login

---

## Auth Flow Diagram

```
User clicks "Sign in with Google"
        ↓
Supabase Auth initiates OAuth
        ↓
Google callback → Supabase creates / updates user in auth.users
        ↓
Supabase triggers DB trigger: create_profile_on_signup
        ↓
Row inserted in public.profiles + public.orgs (if new org)
        ↓
User redirected to /app/projects (default post-login page)
```

---

## Magic Link Flow

```
User enters email → POST /api/auth/magic-link
        ↓
Supabase sends magic link email via Resend
        ↓
User clicks link → Supabase validates token
        ↓
Session created → same profile/org setup as OAuth
```

---

## Session Handling

Every **API route** must validate the session server-side:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... rest of handler
}
```

> ⚠️ Never trust `user_id` from request body. Always use `supabase.auth.getUser()`.

---

## Org Creation on Signup

When a new user signs up, a Supabase DB function creates their org:

```sql
-- Trigger: on auth.users INSERT
-- Creates: public.orgs (plan: 'free', credits_balance: 50)
-- Creates: public.profiles (member_role: 'owner')
```

Migration file: `supabase/migrations/0001_create_profile_on_signup.sql`

---

## Team Invitations

1. Org owner sends invite → `POST /api/settings/team/invite`
2. Row created in `org_invitations` table with a secure token
3. Invite email sent via Resend
4. Invitee clicks link → `GET /api/auth/accept-invite?token=...`
5. Invitee signs in → their profile is linked to org with `member_role: 'member'`

---

## Role System

| Role | Permissions |
|---|---|
| `owner` | All permissions + billing + team management |
| `admin` | All permissions except billing |
| `member` | Search, reveal, shortlist, sequences (no team/billing) |

---

## Route Protection

Protected routes use Next.js middleware:

```typescript
// middleware.ts
// Checks for Supabase session cookie
// Redirects unauthenticated users to /login
// Routes that match: /app/**, /api/**
```

Public routes (no auth required):
- `/` (marketing)
- `/login`, `/signup`
- `/share/[token]` (client view — may have password protection)

---

## Environment Variables Used by Auth

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   ← server only — used for admin operations
RESEND_API_KEY              ← magic link emails
NEXT_PUBLIC_APP_URL         ← redirect URLs after login
```
