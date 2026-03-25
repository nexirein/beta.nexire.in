/**
 * lib/supabase/server.ts
 * Owner: nexire-backend
 * Purpose: Server-side Supabase client factories for Next.js App Router.
 *          Uses @supabase/ssr for cookie-based session handling.
 *
 * TWO CLIENTS:
 *   createServerClient() — for API routes; uses user's JWT (respects RLS)
 *   createAdminClient()  — for cron jobs / admin ops; uses SERVICE_ROLE_KEY (bypasses RLS)
 *
 * USAGE IN API ROUTES:
 *   const supabase = createServerClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 *
 * USAGE IN CRON / ADMIN:
 *   const supabase = createAdminClient()
 *   // no session needed — service role bypasses RLS
 */

import { createServerClient as createSSRClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// ─────────────────────────────────────────────────────────────────────────────
// ENV GUARD
// Called at module load time — will throw early if misconfigured.
// ─────────────────────────────────────────────────────────────────────────────
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

// ─────────────────────────────────────────────────────────────────────────────
// USER CLIENT — cookie-based, respects RLS
// Use in: API route handlers (app/api/**/route.ts)
// ─────────────────────────────────────────────────────────────────────────────
export function createServerClient() {
  const cookieStore = cookies()

  return createSSRClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // set() throws in Server Components — safe to ignore in Route Handlers
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // same as above
          }
        },
      },
    }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CLIENT — service role key, bypasses RLS
// Use in: cron jobs, webhook handlers, server-to-server admin ops
// NEVER return this client to a user-facing API route directly.
// ─────────────────────────────────────────────────────────────────────────────
export function createAdminClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
