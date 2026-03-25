/**
 * app/api/searches/[searchId]/results/route.ts
 * GET  — load persisted search results using person_ids from search_results, joined with global people table + reveals
 * POST — save person_ids + metadata for a search conversation
 *
 * Redis: Pages are cached per search+page key for 24h.
 *        POST flushes pages 1-7 to invalidate stale cache on re-search.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis/client";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/redis/keys";

type Params = { params: { searchId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 15;

  // ── Redis cache read (short-circuit entire route for cached pages) ────────
  const pageCacheKey = REDIS_KEYS.searchPage(params.searchId, page);
  try {
    const cached = await redis.get(pageCacheKey);
    if (cached) {
      console.log(`[Search Results] Cache HIT: ${params.searchId} p${page}`);
      return NextResponse.json({ ...JSON.parse(cached), fromCache: true });
    }
  } catch { /* Redis unavailable — fall through */ }

  // 1. Verify user owns the search + get org_id for reveal lookup
  const { data: conversation } = await supabase
    .from("search_conversations")
    .select("id")
    .eq("id", params.searchId)
    .eq("user_id", user.id)
    .single();

  if (!conversation) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  // 2. Fetch total known results count and metadata (including legacy arrays)
  const { data: resultsMeta, error: metaError } = await admin
    .from("search_results")
    .select("person_ids, results_json, total_count, filters_json, updated_at")
    .eq("search_id", params.searchId)
    .single();

  if (metaError || !resultsMeta) {
    return NextResponse.json({ results: [], total: 0, hasResults: false });
  }

  // 3. Fetch paginated result items using JOIN for maximum scalability
  let { data: items, error: itemsError } = await admin
    .from("search_result_items")
    .select(`
      rank,
      ai_score,
      people:people (*)
    `)
    .eq("search_id", params.searchId)
    .order("rank", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  if (itemsError || !items || items.length === 0) {
    // Lazy migration for legacy searches: if `search_result_items` is empty but `person_ids` exists, 
    // migrate the array to the new SQL table on-the-fly and retry.
    if (resultsMeta.person_ids && resultsMeta.person_ids.length > 0) {
      const legacyIds = resultsMeta.person_ids as string[];
      const legacyJson = resultsMeta.results_json || [];
      const junctionRows = legacyIds.map((id, idx) => ({
        search_id: params.searchId,
        person_id: id,
        rank: idx,
        ai_score: legacyJson[idx]?.ai_score || 0
      }));

      await admin.from("search_result_items").upsert(junctionRows, {
        onConflict: "search_id, person_id",
        ignoreDuplicates: true
      });

      // Retry the JOIN query after migration
      const { data: migratedItems } = await admin
        .from("search_result_items")
        .select(`
          rank,
          ai_score,
          people:people (*)
        `)
        .eq("search_id", params.searchId)
        .order("rank", { ascending: true })
        .range((page - 1) * limit, page * limit - 1);

      if (migratedItems && migratedItems.length > 0) {
        if (!items) items = [];
        items.push(...migratedItems);
      }
    }
  }

  if (!items || items.length === 0) {
    // Still empty (genuinely 0 results or legacy json-only fallback without person DB entries)
    const fallbackResults = (resultsMeta.results_json || []).slice((page - 1) * limit, page * limit);
    return NextResponse.json({ 
      results: fallbackResults, 
      total: resultsMeta.total_count, 
      hasResults: !!(fallbackResults && fallbackResults.length > 0),
      page: page,
      total_pages: Math.ceil((resultsMeta.total_count || 1) / limit),
      filters: resultsMeta.filters_json
    });
  }

  // 4. Extract person IDs for reveal lookup
  const pagedIds = items.map(item => {
    // PostgREST might return an array for the joined table if it doesn't recognize the 1:1 relation
    const p = Array.isArray(item.people) ? item.people[0] : item.people;
    return p.person_id;
  });

  // Fetch reveals for this org to determine contact info
  const { data: reveals } = profile?.org_id ? await admin
    .from("reveals")
    .select("person_id, type, email, phone")
    .eq("org_id", profile.org_id)
    .in("person_id", pagedIds) : { data: [] };

  // Group reveals by person_id
  const revealMap = new Map<string, { email: string | null; phone: string | null; is_revealed: boolean }>();
  for (const r of (reveals || [])) {
    const existing = revealMap.get(r.person_id) || { email: null, phone: null, is_revealed: false };
    if (r.type === "email" && r.email) {
      existing.email = r.email;
      existing.is_revealed = true;
    }
    if (r.type === "phone" && r.phone) {
      existing.phone = r.phone;
      existing.is_revealed = true;
    }
    revealMap.set(r.person_id, existing);
  }

  // 5. Reconstruct ScoredCandidate format using joined data
  const finalResults = items.map(item => {
    const p = Array.isArray(item.people) ? item.people[0] : item.people;
    const r = revealMap.get(p.person_id) || { email: null, phone: null, is_revealed: false };

    let match_label = "Good match";
    if (p.ai_score >= 80) match_label = "Excellent match";
    else if (p.ai_score >= 65) match_label = "Strong match";

    return {
      person_id:          p.person_id,
      full_name:          p.full_name,
      headline:           p.headline,
      current_title:      p.current_title,
      current_company:    p.current_company,
      location_city:      p.location_city,
      location_state:     p.location_state,
      location_country:   p.location_country,
      experience_years:   p.experience_years,
      skills:             p.skills_json || [],
      linkedin_url:       p.flagship_profile_url || p.linkedin_url,
      job_history_json:   p.all_employers_json || [],

      // AI scoring (using either global or search-specific snapshot)
      ai_score:           Number(item.ai_score || p.ai_score || 50),
      match_label,
      score_breakdown:    p.score_breakdown_json,

      // Reveals (org-scoped)
      is_revealed:        r.is_revealed,
      email:              r.email,
      phone:              r.phone,

      // Full CrustData payload — used by CandidateProfilePanel
      raw_crustdata_json: p.raw_crustdata_json || null,
    };
  });

  const { count: totalLocalCached } = await admin
    .from("search_result_items")
    .select('id', { count: 'exact', head: true })
    .eq("search_id", params.searchId);
  
  const totalPages = Math.ceil((totalLocalCached || 0) / limit);

  const responsePayload = {
    results: finalResults,
    total: resultsMeta.total_count,
    page: page,
    total_pages: totalPages,
    filters: resultsMeta.filters_json,
    updatedAt: resultsMeta.updated_at,
    hasResults: finalResults.length > 0,
  };

  // ── Redis cache write (fire-and-forget) ──────────────────────────────────
  redis.set(pageCacheKey, JSON.stringify(responsePayload), { ex: REDIS_TTL.SEARCH_CACHE }).catch(() => {});

  return NextResponse.json(responsePayload);
}

// POST /api/searches/[searchId]/results
// Syncs candidates into the global 'people' table and links them to the search
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation } = await supabase
    .from("search_conversations")
    .select("id")
    .eq("id", params.searchId)
    .eq("user_id", user.id)
    .single();

  if (!conversation) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  // ── Flush all Redis cached pages for this search on new result save ──────
  // This ensures users always see the freshest re-searched results.
  const PAGE_FLUSH_COUNT = 10;
  const flushOps = Array.from({ length: PAGE_FLUSH_COUNT }, (_, i) =>
    redis.set(REDIS_KEYS.searchPage(params.searchId, i + 1), "", { ex: 1 }).catch(() => {})
  );
  await Promise.allSettled(flushOps);

  const body = await req.json().catch(() => ({}));
  const { results, total_count, filters_json } = body;

  const admin = createAdminClient();

  try {
    // 1. Sink people into the global table — full CrustData field mapping
    if (Array.isArray(results) && results.length > 0) {
      const peopleToSync = results.map((r: any) => {
        // raw_crustdata_json is the full CrustData API response object
        const raw = r.raw_crustdata_json || {};
        const loc = raw.location_details || {};

        // Primary employer for quick-access columns
        const primaryEmployer = (raw.current_employers || [])[0] || {};

        return {
          // ── Identity ───────────────────────────────────────────────────
          person_id:                   String(r.person_id),
          full_name:                   raw.name || r.full_name,
          first_name:                  raw.first_name || null,
          last_name:                   raw.last_name || null,
          headline:                    raw.headline || r.headline,
          current_title:               primaryEmployer.title || r.current_title,
          current_company:             primaryEmployer.name  || r.current_company,

          // ── Location ───────────────────────────────────────────────────
          region:                      raw.region || null,
          region_address_components:   raw.region_address_components || [],
          location_city:               loc.city  || r.location_city  || null,
          location_state:              loc.state || r.location_state || null,
          location_country:            loc.country || r.location_country || null,
          location_continent:          loc.continent || null,
          location_details_json:       Object.keys(loc).length > 0 ? loc : null,

          // ── Profile media ──────────────────────────────────────────────
          profile_picture_url:         raw.profile_picture_url || null,
          profile_picture_permalink:   raw.profile_picture_permalink || null,

          // ── Social ─────────────────────────────────────────────────────
          linkedin_url:                raw.flagship_profile_url || raw.linkedin_profile_url || r.linkedin_url,
          flagship_profile_url:        raw.flagship_profile_url || null,
          linkedin_profile_url_raw:    raw.linkedin_profile_url || null,
          twitter_handle:              raw.twitter_handle || null,
          num_of_connections:          raw.num_of_connections || null,
          profile_language:            raw.profile_language || null,

          // ── Bio & status ───────────────────────────────────────────────
          summary:                     raw.summary || null,
          experience_years:            raw.years_of_experience_raw ?? r.experience_years ?? null,
          years_of_experience_label:   raw.years_of_experience || null,
          recently_changed_jobs:       raw.recently_changed_jobs ?? false,
          open_to_cards_json:          raw.open_to_cards || [],
          is_open_to_work:             (raw.open_to_cards || []).length > 0 || !!raw.recently_changed_jobs,

          // ── Professional ───────────────────────────────────────────────
          skills_json:                 raw.skills || r.skills || [],
          languages_json:              raw.languages || [],
          current_employers_json:      raw.current_employers || [],
          past_employers_json:         raw.past_employers || [],
          all_employers_json:          raw.all_employers || [],
          // Map work_history_json to all_employers_json to match DB schema
          // work_history_json:           raw.all_employers || r.job_history_json || [],

          // ── Education / certs / honors ─────────────────────────────────
          education_background_json:   raw.education_background || [],
          certifications_json:         raw.certifications || [],
          honors_json:                 raw.honors || [],

          // ── AI scoring ─────────────────────────────────────────────────
          ai_score:                    r.ai_score || 0,
          score_breakdown_json:        r.score_breakdown || r._score_breakdown || {},

          // ── Raw payload ────────────────────────────────────────────────
          raw_crustdata_json:          raw,

          // ── Metadata ───────────────────────────────────────────────────
          crustdata_last_updated:      raw.last_updated || null,
          last_enriched_at:            new Date().toISOString(),
          last_seen_at:                new Date().toISOString(),
          search_count:                1, // DB will increment via upsert merge below
        };
      });

      // Batch upsert into people table (Optimized: Diff-based insertion)
      const personIdsToSync = peopleToSync.map(p => String(p.person_id));
      const { data: existingPeople } = await admin
        .from("people")
        .select("person_id")
        .in("person_id", personIdsToSync);

      const existingSet = new Set(existingPeople?.map(p => p.person_id) || []);
      const newCandidates = peopleToSync.filter(p => !existingSet.has(String(p.person_id)));

      if (newCandidates.length > 0) {
        const { error: syncError } = await admin
          .from("people")
          .upsert(newCandidates, {
            onConflict: "person_id",
            ignoreDuplicates: false,
          });

        if (syncError) console.error("Sync to people table failed:", syncError);
      }
    }

    // 2. Update search_result_items (junction table)
    const personIds: string[] = Array.isArray(results) ? results.map((r: any) => String(r.person_id)) : [];
    const junctionRows = personIds.map((id: string, idx: number) => ({
      search_id: params.searchId,
      person_id: id,
      rank: idx,
      ai_score: results[idx]?.ai_score || 0
    }));

    await admin.from("search_result_items").upsert(junctionRows, {
      onConflict: "search_id, person_id",
      ignoreDuplicates: false
    });

    // 3. Update the search_results mapping (metadata)
    const { data: existing } = await admin
      .from("search_results")
      .select("id")
      .eq("search_id", params.searchId)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("search_results")
        .update({
          person_ids: personIds,
          total_count: total_count ?? 0,
          filters_json: filters_json ?? {},
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("search_results")
        .insert({
          search_id: params.searchId,
          person_ids: personIds,
          total_count: total_count ?? 0,
          filters_json: filters_json ?? {},
        });
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Save results failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
