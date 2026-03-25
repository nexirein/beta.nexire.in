// nexire-app — app/api/credits/balance/route.ts
// GET /api/credits/balance
// Returns current credit balance for the authenticated user's org.
// Redis-cached for 5 minutes to prevent hammering the DB on every topbar render.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis/client";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/redis/keys";

function getAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() { },
        remove() { },
      },
    }
  );
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  void req;
  const supabase = getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();

  // ── Step 1: Get org_id (always needed for the cache key scope) ───────────
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // ── Step 2: Try Redis cache ───────────────────────────────────────────────
  const cacheKey = REDIS_KEYS.accountCredits(profile.org_id);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json({ ...JSON.parse(cached), fromCache: true });
    }
  } catch { /* Redis unavailable — fall through */ }

  // ── Step 3: Hit Supabase, cache the result ───────────────────────────────
  const { data: org } = await admin
    .from("orgs")
    .select("credits_balance, credits_monthly, plan")
    .eq("id", profile.org_id)
    .single();

  const payload = {
    balance: org?.credits_balance ?? 0,
    monthly: org?.credits_monthly ?? 50,
    plan: org?.plan ?? "free",
  };

  redis.set(cacheKey, JSON.stringify(payload), { ex: REDIS_TTL.ACCOUNT_CREDITS }).catch(() => {});

  return NextResponse.json(payload);
}
