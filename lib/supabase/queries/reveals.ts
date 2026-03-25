/**
 * lib/supabase/queries/reveals.ts
 * Owner: nexire-backend
 * Purpose: Reveal read/write helpers.
 *          getExistingReveal() is the FREE RE-ENRICHMENT GATE:
 *          check this BEFORE calling Prospeo — if null, then call Prospeo + charge credits.
 *
 * FREE RE-ENRICHMENT RULE:
 *   1. Call getExistingReveal(orgId, personId, type)
 *   2. If result found → return it. No Prospeo call. No credit charge.
 *   3. If null → call Prospeo, charge 1 or 8 credits, then insertReveal()
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Reveal, RevealType } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// getExistingReveal
// THE FREE RE-ENRICHMENT GATE.
// Returns the cached reveal if already fetched for this org+person+type.
// Always call this BEFORE Prospeo. If not null, skip Prospeo entirely.
// ─────────────────────────────────────────────────────────────────────────────
export async function getExistingReveal(
  orgId: string,
  personId: string,
  type: RevealType,
  supabase: SupabaseClient
): Promise<Reveal | null> {
  const { data, error } = await supabase
    .from('reveals')
    .select('*')
    .eq('org_id', orgId)
    .eq('person_id', personId)
    .eq('type', type)
    .single()

  if (error?.code === 'PGRST116') return null  // PGRST116 = no rows (not an error)
  if (error) throw new Error(`getExistingReveal failed: ${error.message}`)
  return data as Reveal
}

// ─────────────────────────────────────────────────────────────────────────────
// insertReveal
// Write a new reveal after a successful Prospeo enrichment.
// Uses upsert with DO NOTHING on conflict — safe to call even if a race
// condition caused a duplicate insert attempt.
// ─────────────────────────────────────────────────────────────────────────────
export async function insertReveal(
  reveal: {
    org_id: string
    candidate_id: string | null
    person_id: string
    type: RevealType
    email?: string | null
    phone?: string | null
    status: Reveal['status']
    revealed_by: string
    credits_charged: number
  },
  supabase: SupabaseClient
): Promise<Reveal> {
  const { data, error } = await supabase
    .from('reveals')
    .upsert(reveal, {
      onConflict: 'org_id,person_id,type',
      ignoreDuplicates: true,   // if already exists, DO NOTHING (return existing)
    })
    .select()
    .single()

  if (error) throw new Error(`insertReveal failed: ${error.message}`)
  return data as Reveal
}

// ─────────────────────────────────────────────────────────────────────────────
// getRevealsByCandidateId
// Get all reveals for a candidate (for candidate detail card).
// ─────────────────────────────────────────────────────────────────────────────
export async function getRevealsByCandidateId(
  candidateId: string,
  supabase: SupabaseClient
): Promise<Reveal[]> {
  const { data, error } = await supabase
    .from('reveals')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Reveal[]
}
