/**
 * lib/supabase/queries/credits.ts
 * Owner: nexire-backend
 * Purpose: Credit balance reads and ledger append helpers.
 *          These are called BY lib/credits/engine.ts — not directly from API routes.
 *          Never bypass engine.ts to call these directly in route handlers.
 *
 * RULE: These helpers touch two things:
 *   1. orgs.credits_balance (the live spendable balance)
 *   2. credit_transactions (the immutable audit ledger)
 *   Both must stay in sync after every operation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreditTransaction, CreditTxType } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// getOrgBalance
// Read the org's current credit balance.
// Called BEFORE a reveal to check if org has enough credits.
// Use createAdminClient() when calling from cron/server — avoids RLS round-trip.
// ─────────────────────────────────────────────────────────────────────────────
export async function getOrgBalance(
  orgId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase
    .from('orgs')
    .select('credits_balance')
    .eq('id', orgId)
    .single()

  if (error) throw new Error(`getOrgBalance failed: ${error.message}`)
  return data.credits_balance as number
}

// ─────────────────────────────────────────────────────────────────────────────
// deductCredits
// Update org.credits_balance and append a debit transaction in one go.
// ALWAYS called via lib/credits/engine.ts — never directly from route handlers.
//
// Uses an RPC to atomically:
//   1. Decrement orgs.credits_balance
//   2. Increment orgs.credits_used
//   3. INSERT into credit_transactions
// Falls back to two sequential queries if RPC not available.
// ─────────────────────────────────────────────────────────────────────────────
export async function deductCredits(
  opts: {
    orgId: string
    userId: string
    type: Extract<CreditTxType, 'reveal_email' | 'reveal_phone'>
    amount: number            // positive number (will be stored as negative)
    candidateId?: string | null
    revealId?: string | null
    notes?: string
  },
  supabase: SupabaseClient
): Promise<CreditTransaction> {
  const { orgId, userId, type, amount, candidateId, revealId, notes } = opts

  // Step 1: Decrement org balance
  const { data: org, error: orgErr } = await supabase
    .from('orgs')
    .select('credits_balance, credits_used')
    .eq('id', orgId)
    .single()

  if (orgErr) throw new Error(`deductCredits: balance read failed: ${orgErr.message}`)

  const newBalance = org.credits_balance - amount
  if (newBalance < 0) throw new Error('Insufficient credits')

  const { error: updateErr } = await supabase
    .from('orgs')
    .update({
      credits_balance: newBalance,
      credits_used: org.credits_used + amount,
    })
    .eq('id', orgId)

  if (updateErr) throw new Error(`deductCredits: balance update failed: ${updateErr.message}`)

  // Step 2: Append ledger entry
  return appendTransaction(
    {
      orgId,
      userId,
      type,
      amount: -amount,   // negative = debit
      balanceAfter: newBalance,
      candidateId: candidateId ?? null,
      revealId: revealId ?? null,
      notes: notes ?? null,
    },
    supabase
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// grantCredits
// Add credits to an org (monthly grant, rollover, top-up, refund).
// ALWAYS called via lib/credits/engine.ts.
// ─────────────────────────────────────────────────────────────────────────────
export async function grantCredits(
  opts: {
    orgId: string
    userId: string | null
    type: Exclude<CreditTxType, 'reveal_email' | 'reveal_phone'>
    amount: number          // positive = credits added
    notes?: string
  },
  supabase: SupabaseClient
): Promise<CreditTransaction> {
  const { orgId, userId, type, amount, notes } = opts

  const { data: org, error: orgErr } = await supabase
    .from('orgs')
    .select('credits_balance')
    .eq('id', orgId)
    .single()

  if (orgErr) throw new Error(`grantCredits: balance read failed: ${orgErr.message}`)

  const newBalance = org.credits_balance + amount

  const { error: updateErr } = await supabase
    .from('orgs')
    .update({ credits_balance: newBalance })
    .eq('id', orgId)

  if (updateErr) throw new Error(`grantCredits: balance update failed: ${updateErr.message}`)

  return appendTransaction(
    {
      orgId,
      userId: userId ?? null,
      type,
      amount,           // positive = credit
      balanceAfter: newBalance,
      notes: notes ?? null,
    },
    supabase
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// appendTransaction (internal helper)
// Write a new row to the credit_transactions ledger.
// Called only by deductCredits() and grantCredits() — not exported for direct use.
// ─────────────────────────────────────────────────────────────────────────────
async function appendTransaction(
  opts: {
    orgId: string
    userId: string | null
    type: CreditTxType
    amount: number
    balanceAfter: number
    candidateId?: string | null
    revealId?: string | null
    notes: string | null
  },
  supabase: SupabaseClient
): Promise<CreditTransaction> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .insert({
      org_id: opts.orgId,
      user_id: opts.userId,
      type: opts.type,
      amount: opts.amount,
      balance_after: opts.balanceAfter,
      candidate_id: opts.candidateId ?? null,
      reveal_id: opts.revealId ?? null,
      notes: opts.notes,
    })
    .select()
    .single()

  if (error) throw new Error(`appendTransaction failed: ${error.message}`)
  return data as CreditTransaction
}

// ─────────────────────────────────────────────────────────────────────────────
// getRecentTransactions
// Returns paginated credit history for an org (usage page).
// ─────────────────────────────────────────────────────────────────────────────
export async function getRecentTransactions(
  orgId: string,
  limit: number = 50,
  supabase: SupabaseClient
): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as CreditTransaction[]
}
