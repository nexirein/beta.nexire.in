/**
 * lib/supabase/queries/candidates.ts
 * Owner: nexire-backend
 * Purpose: Intelligence DB operations — upsert from Prospeo search results,
 *          lookup by person_id, bulk insert search→candidate joins.
 *
 * CRITICAL FUNCTION: upsertCandidate()
 *   Uses INSERT ... ON CONFLICT (org_id, person_id) DO UPDATE SET ...
 *   This is the core mechanism that makes candidates a persistent Intel DB.
 *   Later searches ENRICH the row — they never duplicate it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of a single Prospeo search result person */
export interface ProspeoPerson {
  person_id: string
  full_name?: string
  headline?: string
  current_title?: string
  current_company?: string
  location?: string
  skills?: string[]
  linkedin_url?: string
  profile_pic_url?: string
  tenure_months?: number
  [key: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertCandidate
// THE INTELLIGENCE DB WRITE PATH.
// Called from: POST /api/search after Prospeo returns results.
//
// Behaviour:
//   - If (org_id, person_id) does NOT exist → INSERT new row
//   - If (org_id, person_id) ALREADY exists → UPDATE enrichable fields
//     (name, headline, skills, etc. may have improved in later Prospeo calls)
//   - estimated_notice_days is GENERATED — never set it here
//   - ai_score is set by the AI layer separately (pass null here)
// ─────────────────────────────────────────────────────────────────────────────
export async function upsertCandidate(
  orgId: string,
  person: ProspeoPerson,
  aiScore: number | null,
  supabase: SupabaseClient
): Promise<Candidate> {
  const { data, error } = await supabase
    .from('candidates')
    .upsert(
      {
        org_id: orgId,
        person_id: person.person_id,
        full_name: person.full_name ?? null,
        headline: person.headline ?? null,
        current_title: person.current_title ?? null,
        current_company: person.current_company ?? null,
        location: person.location ?? null,
        skills_json: person.skills ?? null,
        linkedin_url: person.linkedin_url ?? null,
        profile_pic_url: person.profile_pic_url ?? null,
        tenure_months: person.tenure_months ?? null,
        ai_score: aiScore,
        raw_json: person,
        last_enriched_at: new Date().toISOString(),
      },
      {
        onConflict: 'org_id,person_id',
        ignoreDuplicates: false,   // DO UPDATE (enrich), not DO NOTHING
      }
    )
    .select()
    .single()

  if (error) throw new Error(`upsertCandidate failed: ${error.message}`)
  return data as Candidate
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertCandidateBatch
// Batch version — used after a full Prospeo search page returns 25 results.
// Returns all upserted candidates (including newly created AND updated rows).
// ─────────────────────────────────────────────────────────────────────────────
export async function upsertCandidateBatch(
  orgId: string,
  persons: ProspeoPerson[],
  aiScores: Map<string, number>,   // person_id → score
  supabase: SupabaseClient
): Promise<Candidate[]> {
  const rows = persons.map((person) => ({
    org_id: orgId,
    person_id: person.person_id,
    full_name: person.full_name ?? null,
    headline: person.headline ?? null,
    current_title: person.current_title ?? null,
    current_company: person.current_company ?? null,
    location: person.location ?? null,
    skills_json: person.skills ?? null,
    linkedin_url: person.linkedin_url ?? null,
    profile_pic_url: person.profile_pic_url ?? null,
    tenure_months: person.tenure_months ?? null,
    ai_score: aiScores.get(person.person_id) ?? null,
    raw_json: person,
    last_enriched_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('candidates')
    .upsert(rows, {
      onConflict: 'org_id,person_id',
      ignoreDuplicates: false,
    })
    .select()

  if (error) throw new Error(`upsertCandidateBatch failed: ${error.message}`)
  return (data ?? []) as Candidate[]
}

// ─────────────────────────────────────────────────────────────────────────────
// getCandidateByPersonId
// Check if a candidate already exists in the Intelligence DB.
// Used BEFORE calling Prospeo (to skip redundant API calls).
// ─────────────────────────────────────────────────────────────────────────────
export async function getCandidateByPersonId(
  orgId: string,
  personId: string,
  supabase: SupabaseClient
): Promise<Candidate | null> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('org_id', orgId)
    .eq('person_id', personId)
    .single()

  if (error?.code === 'PGRST116') return null  // not found — not an error
  if (error) throw new Error(error.message)
  return data as Candidate
}

// ─────────────────────────────────────────────────────────────────────────────
// linkCandidatesToSearch
// Insert rows into search_candidates (which candidates appeared in which search).
// ─────────────────────────────────────────────────────────────────────────────
export async function linkCandidatesToSearch(
  searchId: string,
  candidateIds: string[],
  supabase: SupabaseClient
): Promise<void> {
  if (candidateIds.length === 0) return

  const rows = candidateIds.map((candidateId, index) => ({
    search_id: searchId,
    candidate_id: candidateId,
    position: index + 1,
  }))

  const { error } = await supabase
    .from('search_candidates')
    .insert(rows)

  if (error) throw new Error(`linkCandidatesToSearch failed: ${error.message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// updateCandidateScore
// Update ai_score on an existing candidate (called by AI scoring layer).
// ─────────────────────────────────────────────────────────────────────────────
export async function updateCandidateScore(
  candidateId: string,
  aiScore: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('candidates')
    .update({ ai_score: aiScore })
    .eq('id', candidateId)

  if (error) throw new Error(`updateCandidateScore failed: ${error.message}`)
}
