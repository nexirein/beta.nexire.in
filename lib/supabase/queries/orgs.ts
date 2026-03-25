/**
 * lib/supabase/queries/orgs.ts
 * Owner: nexire-backend
 * Purpose: Core identity queries — profile lookup, org context retrieval.
 *          These functions are called at the TOP of every API route handler.
 *
 * PATTERN: Every API route starts with:
 *   const profile = await getProfile(user.id, supabase)
 *   if (!profile) return 401
 *   const { org_id } = profile
 *   // now use org_id for ALL subsequent queries
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile, ProfileWithOrg } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// getProfile
// Get the caller's profile. Returns null if not found (unfinished onboarding).
// ─────────────────────────────────────────────────────────────────────────────
export async function getProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data as Profile
}

// ─────────────────────────────────────────────────────────────────────────────
// getProfileWithOrg
// Get profile AND org in a single query (for auth context + plan check).
// Used in: settings pages, billing checks, credit balance reads.
// ─────────────────────────────────────────────────────────────────────────────
export async function getProfileWithOrg(
  userId: string,
  supabase: SupabaseClient
): Promise<ProfileWithOrg | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      org:orgs(*)
    `)
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data as ProfileWithOrg
}

// ─────────────────────────────────────────────────────────────────────────────
// requireOrgId
// One-liner helper for API routes: get org_id or throw.
// Usage:
//   const { org_id } = await requireOrgId(user.id, supabase)
// ─────────────────────────────────────────────────────────────────────────────
export async function requireOrgId(
  userId: string,
  supabase: SupabaseClient
): Promise<{ org_id: string; member_role: Profile['member_role'] }> {
  const profile = await getProfile(userId, supabase)
  if (!profile) throw new Error('Profile not found. User may not have completed onboarding.')
  return { org_id: profile.org_id, member_role: profile.member_role }
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrgTeam
// List all profiles in an org (for team management page).
// ─────────────────────────────────────────────────────────────────────────────
export async function getOrgTeam(
  orgId: string,
  supabase: SupabaseClient
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}
