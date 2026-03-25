/**
 * app/api/profile/route.ts
 * GET  — get current user's profile + org (Redis-cached, 10min TTL)
 * PATCH — update profile fields and flush Redis cache
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis/client";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/redis/keys";

// GET /api/profile
export async function GET() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Redis cache read ────────────────────────────────────────────────────
  const cacheKey = REDIS_KEYS.userProfile(user.id);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json({ ...JSON.parse(cached), fromCache: true });
    }
  } catch { /* Redis unavailable — fall through to Supabase */ }

  const { data, error } = await supabase
    .from("profiles")
    .select("*, org:orgs(*)")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { org, ...profile } = data;
  const responsePayload = { profile, org };

  // ── Redis cache write ───────────────────────────────────────────────────
  redis.set(cacheKey, JSON.stringify(responsePayload), { ex: REDIS_TTL.USER_PROFILE }).catch(() => {});

  return NextResponse.json(responsePayload);
}

// PATCH /api/profile
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { full_name, job_title, timezone, avatar_url } = body;

  const updates: Record<string, unknown> = {};
  if (full_name !== undefined) updates.full_name = full_name?.trim();
  if (job_title !== undefined) updates.job_title = job_title?.trim();
  if (timezone !== undefined) updates.timezone = timezone;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Flush Redis cache on profile update ────────────────────────────────
  const admin = createAdminClient();
  void admin; // admin client available for future use if needed
  redis.set(REDIS_KEYS.userProfile(user.id), "", { ex: 1 }).catch(() => {});

  return NextResponse.json({ profile });
}
