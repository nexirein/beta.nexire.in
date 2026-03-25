// nexire-app — lib/prospeo/account-manager.ts
// Multi-account Prospeo API key rotation service.
// Queries Supabase api_accounts table to pick least-used, non-blocked account.
// Uses Redis for transient rate-limit block flags.

import { createAdminClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis/client";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/redis/keys";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface ApiAccount {
  id: string;
  org_id: string;
  label: string;
  encrypted_api_key: string;
  is_active: boolean;
  priority: number;
  credits_remaining: number;
  daily_request_count: number;
  last_used_at: string | null;
}

export class NoAccountAvailableError extends Error {
  constructor(orgId: string) {
    super(`No Prospeo API account available for org: ${orgId}`);
    this.name = "NoAccountAvailableError";
  }
}

export class AccountManager {
  /**
   * Returns the best available API account for a workspace/org.
   * Skips blocked (rate-limited) accounts.
   * Prefers accounts with lower priority number, then by least recently used.
   */
  static async getAvailableAccount(orgId: string): Promise<ApiAccount> {
    const supabase = createAdminClient();

    const { data: accounts, error } = await supabase
      .from("api_accounts")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    if (error) throw new Error(`Failed to fetch API accounts: ${error.message}`);
    if (!accounts || accounts.length === 0) throw new NoAccountAvailableError(orgId);

    // Filter out accounts that are blocked in Redis
    for (const account of accounts) {
      const blockedKey = REDIS_KEYS.rateLimitBlocked(account.id);
      const isBlocked = await redis.get(blockedKey);
      if (!isBlocked) {
        return account as ApiAccount;
      }
    }

    throw new NoAccountAvailableError(orgId);
  }

  /**
   * Increments the daily request counter and updates lastUsedAt.
   * Call this after every successful Prospeo API call.
   */
  static async markAccountUsed(accountId: string): Promise<void> {
    const supabase = createAdminClient();

    // Update last_used_at
    await supabase
      .from("api_accounts")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", accountId);

    // Atomic increment via RPC (function created in migration)
    await supabase.rpc("increment_api_account_requests", { account_id: accountId });


    // Also update Redis credit cache key (will be fetched fresh next call)
    await redis.set(
      REDIS_KEYS.accountCredits(accountId),
      "0",  // stale marker — will be refreshed
      { ex: 1 }  // expire immediately so next lookup fetches fresh
    );
  }

  /**
   * Marks an account as rate-limited in Redis for 60 seconds.
   * The account will be skipped by getAvailableAccount during this period.
   */
  static async markAccountRateLimited(accountId: string): Promise<void> {
    const blockedKey = REDIS_KEYS.rateLimitBlocked(accountId);
    await redis.set(blockedKey, "1", { ex: REDIS_TTL.RATE_LIMIT_BLOCKED });
  }

  /**
   * Returns the next available account, excluding the currently used one.
   * Used when the current account hits an error mid-flow.
   */
  static async rotateToNextAccount(
    orgId: string,
    currentAccountId: string
  ): Promise<ApiAccount> {
    const supabase = createAdminClient();

    const { data: accounts, error } = await supabase
      .from("api_accounts")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .neq("id", currentAccountId)
      .order("priority", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    if (error) throw new Error(`Failed to fetch API accounts: ${error.message}`);
    if (!accounts || accounts.length === 0) throw new NoAccountAvailableError(orgId);

    for (const account of accounts) {
      const blockedKey = REDIS_KEYS.rateLimitBlocked(account.id);
      const isBlocked = await redis.get(blockedKey);
      if (!isBlocked) {
        return account as ApiAccount;
      }
    }

    throw new NoAccountAvailableError(orgId);
  }

  /**
   * Updates the credits_remaining in DB for an account.
   * Also caches in Redis for 5 minutes.
   */
  static async updateCredits(accountId: string, credits: number): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from("api_accounts")
      .update({ credits_remaining: credits })
      .eq("id", accountId);

    await redis.set(
      REDIS_KEYS.accountCredits(accountId),
      String(credits),
      { ex: REDIS_TTL.ACCOUNT_CREDITS }
    );
  }

  /**
   * Resets daily_request_count to 0 for all accounts in an org.
   * Should be called by a cron job at midnight.
   */
  static async resetDailyCounters(orgId: string): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from("api_accounts")
      .update({ daily_request_count: 0 })
      .eq("org_id", orgId);
  }
}
