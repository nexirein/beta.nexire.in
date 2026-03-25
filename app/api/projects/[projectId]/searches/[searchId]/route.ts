/**
 * app/api/projects/[projectId]/searches/[searchId]/route.ts
 * GET   — search metadata + results for a given page (Redis cache → Prospeo fallback)
 * PATCH — update search name
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prospeoSearchPeople, processProspeoProfile } from "@/lib/prospeo/client";
import { redis } from "@/lib/redis/client";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/redis/keys";

type Params = { params: { projectId: string; searchId: string } };

// ─── GET /api/projects/[projectId]/searches/[searchId] ────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1");

  // Fetch search metadata
  const { data: search, error: searchError } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("id", params.searchId)
    .eq("project_id", params.projectId)
    .single();

  if (searchError || !search) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  // ── 1. Try Redis cache ─────────────────────────────────────────────────────
  const cacheKey = REDIS_KEYS.searchCache(params.searchId, page);
  const cached = await redis.get(cacheKey);

  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return NextResponse.json({
        search,
        results: parsed.results,
        pagination: {
          page,
          totalResults: parsed.total,
          totalPages: Math.ceil(parsed.total / 25),
          hasMore: page < Math.ceil(parsed.total / 25),
        },
        fromCache: true,
      });
    } catch {
      // Cache corrupted — fall through to Prospeo
    }
  }

  // ── 2. Cache miss → Call Prospeo ───────────────────────────────────────────
  try {
    const filters = (search.filters_json ?? {}) as Record<string, unknown>;
    const prospeoRes = await prospeoSearchPeople(filters as never, page);

    if (prospeoRes.error) {
      return NextResponse.json(
        { error: "PROSPEO_ERROR", message: prospeoRes.message },
        { status: 503 }
      );
    }

    const resultItems = prospeoRes.results ?? [];
    const persons = resultItems.map((r) => r.person);
    const totalResults = prospeoRes.pagination?.total_count ?? prospeoRes.total ?? persons.length;
    const totalPages = Math.ceil(totalResults / 25);
    const results = persons.map(processProspeoProfile);

    // Cache for 24 hours
    await redis.set(cacheKey, JSON.stringify({ results, total: totalResults }), {
      ex: REDIS_TTL.SEARCH_CACHE,
    });

    // Upsert candidates (fire and forget)
    if (results.length > 0) {
      const { data: profile } = await admin
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        Promise.resolve(
          admin.from("candidates").upsert(
            results.map((c) => ({
              org_id: profile.org_id,
              person_id: c.person_id,
              full_name: c.full_name,
              headline: c.headline,
              current_title: c.current_title,
              current_company: c.current_company,
              location_city: c.location_city,
              location_country: c.location_country,
              experience_years: c.experience_years,
              skills_json: c.skills,
              linkedin_url: c.linkedin_url,
              work_history_json: c.job_history_json,
            })),
            { onConflict: "org_id,person_id" }
          )
        ).catch(() => { });
      }
    }

    return NextResponse.json({
      search,
      results,
      pagination: {
        page,
        totalResults,
        totalPages,
        hasMore: page < totalPages,
      },
      fromCache: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "SEARCH_FAILED", message: msg }, { status: 503 });
  }
}

// ─── PATCH /api/projects/[projectId]/searches/[searchId] ─────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: search, error } = await supabase
    .from("saved_searches")
    .update({ name: name.trim() })
    .eq("id", params.searchId)
    .eq("project_id", params.projectId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ search });
}
