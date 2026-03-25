// nexire-app — lib/credits/engine.ts
// Credit management engine — atomic deductions via DB RPC.
// CRITICAL RULES:
//   1. Always check before deducting (checkCredits)
//   2. Use deductCredits which calls decrement_credits RPC for atomicity
//   3. Always write a credit_transactions ledger row after deduction
//   4. Never UPDATE or DELETE credit_transactions rows (append-only ledger)

import { createClient } from "@supabase/supabase-js";

export const CREDIT_COSTS = {
  reveal_email: 1,
  reveal_phone: 8,
  search: 3,
} as const;

export type CreditTxType = keyof typeof CREDIT_COSTS;

export interface CreditCheckResult {
  ok: boolean;
  balance: number;
  required: number;
  error?: "INSUFFICIENT_CREDITS" | "ORG_NOT_FOUND";
}

export interface CreditDeductResult {
  ok: boolean;
  newBalance: number;
  txId: string;
  error?: string;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Check if an org has enough credits.
 * Does NOT deduct — use deductCredits for the actual transaction.
 */
export async function checkCredits(
  orgId: string,
  type: CreditTxType
): Promise<CreditCheckResult> {
  const admin = adminClient();
  const required = CREDIT_COSTS[type];

  const { data: org, error } = await admin
    .from("orgs")
    .select("credits_balance")
    .eq("id", orgId)
    .single();

  if (error || !org) {
    return { ok: false, balance: 0, required, error: "ORG_NOT_FOUND" };
  }

  if (org.credits_balance < required) {
    return {
      ok: false,
      balance: org.credits_balance,
      required,
      error: "INSUFFICIENT_CREDITS",
    };
  }

  return { ok: true, balance: org.credits_balance, required };
}

/**
 * Atomically deduct credits using the decrement_credits DB RPC.
 * Then write an append-only ledger row in credit_transactions.
 *
 * @param orgId    - org to deduct from
 * @param userId   - profile.id of the user triggering the reveal
 * @param type     - 'reveal_email' | 'reveal_phone'
 * @param notes    - human-readable context (e.g. "Email reveal for John Doe")
 * @param context  - optional FK references for the ledger row
 */
export async function deductCredits(
  orgId: string,
  userId: string,
  type: CreditTxType,
  notes: string,
  context?: { candidateId?: string; revealId?: string }
): Promise<CreditDeductResult> {
  const admin = adminClient();
  const amount = CREDIT_COSTS[type]; // positive — RPC does the subtraction

  // Step 1: Atomic decrement via DB RPC (SELECT FOR UPDATE prevents race conditions)
  const { data: newBalance, error: rpcError } = await admin.rpc("decrement_credits", {
    p_org_id: orgId,
    p_amount: amount,
  });

  if (rpcError) {
    console.error("[Credits] decrement_credits RPC failed:", rpcError.message);
    return { ok: false, newBalance: 0, txId: "", error: rpcError.message };
  }

  const { data: tx, error: txError } = await admin
    .from("credit_transactions")
    .insert({
      org_id: orgId,
      user_id: userId,
      type: type === "search" ? "adjustment" : type,
      amount: -amount,            // negative = debit in ledger
      balance_after: newBalance,
      notes: type === "search" ? `Search Deduction: ${notes}` : notes,
      candidate_id: context?.candidateId ?? null,
      reveal_id: context?.revealId ?? null,
    })
    .select("id")
    .single();

  if (txError) {
    // Balance was deducted but ledger write failed — log alert
    console.error(
      "[Credits] ALERT: Balance deducted but ledger write failed! org=%s, amount=%d",
      orgId,
      amount,
      txError.message
    );
    return { ok: true, newBalance, txId: "", error: "LEDGER_WRITE_FAILED" };
  }

  return { ok: true, newBalance, txId: tx.id };
}

/**
 * Get current credit balance for an org.
 */
export async function getBalance(orgId: string): Promise<number | null> {
  const admin = adminClient();
  const { data } = await admin
    .from("orgs")
    .select("credits_balance")
    .eq("id", orgId)
    .single();
  return data?.credits_balance ?? null;
}
