// nexire-app — app/api/search/route.ts
// POST /api/search — master search orchestrator
// Flow: Auth → Rate limit → Filter build → Cache → CrustData waterfall → AI score
//       → Persist to search_results + candidates + global people → Respond
//
// CrustData pagination model:
//   - Fetch 100 profiles per waterfall call (3 credits)
//   - Show 20 per UI page → 5 pages for free from 1 API call
//   - Pass `cursor` from previous response to fetch next 100

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { redis } from "@/lib/redis/client";
import { REDIS_KEYS } from "@/lib/redis/keys";
import { checkRateLimit } from "@/lib/redis/rate-limiter";
import { buildCacheKey, getCachedSearch, setCachedSearch } from "@/lib/redis/search-cache";
import { executeWaterfallCrustData, paginateLocally, PAGE_SIZE } from "@/lib/waterfall-engine";
import { buildCrustDataFilters, buildRelaxedFilters, buildExpandedRadiusFilters, buildMinimalFilters } from "@/lib/crustdata/filter-builder";
import type { CrustDataFilterState, CrustDataPerson } from "@/lib/crustdata/types";
import { scoreAndRankCandidates } from "@/lib/ai/scorer";
import { checkCredits, deductCredits } from "@/lib/credits/engine";
import { crustdataCountSearchPeople } from "@/lib/crustdata/client";

const SearchRequestSchema = z.object({
  query: z.string().default(""),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  cursor: z.string().optional(),
  ui_page: z.number().int().min(1).max(5).default(1),
  debug: z.boolean().optional(),
  search_id: z.string().optional(),
  pass_level: z.number().int().min(1).max(4).optional().default(1),
  /** When true, server auto-tries passes 1→4 until MIN_RESULTS_THRESHOLD is met. */
  auto_broaden: z.boolean().optional().default(false),
  required_skills: z.array(z.string()).optional(),
  search_industries: z.array(z.string()).optional(),
  domain_cluster: z.string().optional(),
  crustdata_filters: z.record(z.string(), z.unknown()).optional(),
});

// ─── Supabase Client Helpers ─────────────────────────────────────────────────
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

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}


// ─── POST /api/search ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const reqId = crypto.randomUUID();
  console.log(`[Search API Entry ${reqId}] ${new Date().toISOString()} - Request started`);

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = getAuthClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Get profile + org ───────────────────────────────────────────────────
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id, member_role")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // ── 3. Rate limiting (5 searches/min per user) ────────────────────────────
  const rl = await checkRateLimit(user.id, "search", 5, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many searches. Please wait a moment.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // ── 4. Parse + validate request body ─────────────────────────────────────
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parseResult = SearchRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }
  const { query, filters: rawFilters, crustdata_filters, cursor, ui_page, debug, search_id, required_skills, search_industries, domain_cluster, pass_level, auto_broaden } = parseResult.data;
  const debugEnabled = debug === true && process.env.NODE_ENV !== "production";

  // ── 5. Build CrustData filter state ─────────────────────────────────────
  const filterState: CrustDataFilterState = (
    crustdata_filters && Object.keys(crustdata_filters).length > 0
      ? crustdata_filters
      : rawFilters
  ) as CrustDataFilterState;

  const crustDataFilterTree = buildCrustDataFilters(filterState);
  void crustDataFilterTree; // used in debug only

  // ── Profile quality gate ─────────────────────────────────────────────────
  // Filter out sparse profiles that match only on title with no employment detail.
  function passesProfileQualityGate(candidate: CrustDataPerson): boolean {
    // Must have at least one current employer with a non-trivial title OR a headline
    const employers = candidate.current_employers ?? [];
    const hasRealTitle = employers.some((e) => e.title && e.title.trim().length > 3);
    const hasHeadline = candidate.headline && candidate.headline.trim().length > 5;
    
    if (!hasRealTitle && !hasHeadline) return false;

    // We no longer strip candidates by skills here — let the AI Scorer penalize them instead.
    // This prevents "disappearing candidates" when the CrustData skills array is sparse.

    return true;
  }

  // ── What-was-relaxed labels for each waterfall pass ───────────────────────
  const RELAXED_LABELS: Record<number, string[]> = {
    2: ["Seniority filter", "Job function filter", "Keyword filter"],
    3: ["Seniority filter", "Job function filter", "Keyword filter", "Search radius expanded 5×"],
    4: ["Seniority filter", "Job function filter", "Keyword filter", "Industry filter", "Search radius expanded to 500 mi"],
  };
  const cacheKey = buildCacheKey({ ...filterState, _cursor: cursor ?? "" }, 0, pass_level);

  // ── 6. Cache check ──────────────────────────────────────────────────────
  let allCrustDataResults: Array<CrustDataPerson & { _tier: string }> = [];
  let scoredAll: any[] = [];
  let totalCount = 0;
  let creditsUsed = 0;
  let nextCursor: string | null = null;
  let passUsed: 1 | 2 | 3 | 4 = 1;
  let fromCache = false;
  /** Tracks which filters were dropped during auto-broadening. Hoisted here so accessible in final response. */
  let whatWasRelaxed: string[] = [];

  const cached = await getCachedSearch(cacheKey);
  if (cached && typeof cached === "object") {
    const cachedData = cached as { results: any[]; total: number; next_cursor: string | null };
    scoredAll = cachedData.results;
    totalCount = cachedData.total;
    nextCursor = cachedData.next_cursor;
    fromCache = true;
    creditsUsed = 0; // from cache, no credits
  } else {
    // Not cached — this will require CrustData API call costing 3 credits
    const creditCheck = await checkCredits(profile.org_id, "search");
    if (!creditCheck.ok) {
      return NextResponse.json(
        { error: "INSUFFICIENT_CREDITS", message: `You need 3 credits to perform a new search. Current balance: ${creditCheck.balance}` },
        { status: 402 }
      );
    }

    /** Tracks which filters were dropped during auto-broadening */
    // NOTE: whatWasRelaxed is hoisted to outer scope — do not redeclare
    /** The highest pass level actually used */
    let finalPassUsed: 1 | 2 | 3 | 4 = 1;
    const MIN_RESULTS = 15;

    try {
      // ── 1. Main Search Execution ──
      // Immediately spend 3 credits to do the actual data fetch.
      const wr = await executeWaterfallCrustData({ filterState, cursor: cursor ?? null, passLevel: pass_level });
      allCrustDataResults = wr.results as Array<CrustDataPerson & { _tier: string }>;
      totalCount = wr.total;
      creditsUsed = wr.credits_used;
      nextCursor = wr.next_cursor;
      passUsed = wr.pass_used;

      // ── 2. Handle Zero Results & Diagnostics ──
      if (allCrustDataResults.length === 0) {
        // Run cheap count queries stripped down to find the blocker (diagnostic only)
        const diagnostics: Record<string, number> = {};
        try {
          // A: Only titles
          const stateTitlesOnly = { titles: filterState.titles };
          diagnostics["title_only"] = await crustdataCountSearchPeople(buildCrustDataFilters(stateTitlesOnly));
          
          // B: Title + Location
          const stateTitleLoc = { titles: filterState.titles, regions: filterState.regions, radius_km: 50 };
          diagnostics["title_location"] = await crustdataCountSearchPeople(buildCrustDataFilters(stateTitleLoc));
        } catch (diagErr) {
          console.error("[Search Diagnostics] Failed:", diagErr);
        }

        const activeFilters = Object.entries(filterState as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && (!Array.isArray(v) || (v as unknown[]).length > 0))
          .map(([k]) => k);
          
        const zeroDiagnostic = {
          most_restrictive_filters: activeFilters.slice(0, 3),
          filter_contribution: diagnostics,
          suggestions: [
            ...(filterState.company_names?.length ? [{ action: "remove_filter", filter: "company_names", label: "Remove Include Companies filter", estimated_gain_label: "May unlock 50–200+ candidates" }] : []),
            ...(filterState.seniority?.length ? [{ action: "relax_filter", filter: "seniority", label: "Remove Seniority restriction", estimated_gain_label: "Typically adds 30–80% more results" }] : []),
            { action: "expand_radius", filter: "regions", label: "Expand search radius or add nearby cities", estimated_gain_label: "+20–100 candidates typically" },
          ],
        };

        return NextResponse.json({
          results: [], total: 0, ui_page, credits_used: 0, fromCache: false,
          pass_used: passUsed, what_was_relaxed: whatWasRelaxed, zero_result_reason: zeroDiagnostic,
          ...(debugEnabled ? { debug: { filterState, diagnostics } } : {}),
        });
      }

      // ── Profile quality gate ──────────────────────────────────────────────
      if (allCrustDataResults.length > 0) {
        const before = allCrustDataResults.length;
        allCrustDataResults = allCrustDataResults.filter(passesProfileQualityGate);
        if (debugEnabled) console.log(`[Search] Quality gate: ${before} → ${allCrustDataResults.length}`);
        
        // Final catch: If quality gate stripped all 100 profiles, report 0
        if (allCrustDataResults.length === 0) {
          return NextResponse.json({
            results: [], total: totalCount, ui_page, credits_used: 0, fromCache: false,
            pass_used: passUsed, what_was_relaxed: whatWasRelaxed,
            message: "All candidates filtered by quality rules.",
          });
        }
      }

      // ── 8. Score & rank ───────────────────────────────────────────────────
      scoredAll = scoreAndRankCandidates({
        candidates: allCrustDataResults.map(p => ({ ...p, raw_crustdata_json: p })) as unknown as Record<string, unknown>[],
        searchFilters: filterState,
        primaryJobTitles: filterState.titles ?? [],
        requiredSkills: required_skills ?? [],
        searchIndustries: search_industries ?? [],
        searchDomain: domain_cluster as any,
      });

      // Cache scored results
      await setCachedSearch(cacheKey, { results: scoredAll, total: totalCount, next_cursor: nextCursor });

      if (creditsUsed > 0 || passUsed > 0) {
        await deductCredits(profile.org_id, user.id, "search", `Search query: ${query || "Custom filters"}`);
        await redis.del(REDIS_KEYS.accountCredits(profile.org_id)).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown search error";
      console.error("[Search] CrustData waterfall error:", msg);
      return NextResponse.json(
        { error: "SEARCH_FAILED", message: "Search service temporarily unavailable. Please try again." },
        { status: 503 }
      );
    }
  }

  // ── 7. Paginate locally (15 per UI page, from 100 globally scored results) ────────
  const paginated = paginateLocally(scoredAll, ui_page ?? 1);
  let pageResults = paginated.results;

  // ── 9. Cross-reference reveals from org's DB ──────────────────────────────
  if (pageResults.length > 0) {
    const personIds = pageResults.map((c) => c.person_id);
    const { data: revealed } = await admin
      .from("reveals")
      .select("person_id, type, value")
      .eq("org_id", profile.org_id)
      .in("person_id", personIds);

    if (revealed?.length) {
      const revealMap = new Map<string, { email?: string; phone?: string }>();
      for (const r of revealed) {
        const existing = revealMap.get(r.person_id) ?? {};
        if (r.type === "email") existing.email = r.value;
        if (r.type === "phone") existing.phone = r.value;
        revealMap.set(r.person_id, existing);
      }
      pageResults = pageResults.map((c) => {
        const match = revealMap.get(String(c.person_id));
        if (!match) return c;
        return { ...c, is_revealed: true, email: match.email ?? null, phone: match.phone ?? null };
      });
    }
  }

  // ── 10. Persist candidates and search_results (fire and forget) ──────────────────────────────
  if (!fromCache && allCrustDataResults.length > 0) {
    const candidateRows = allCrustDataResults.map((c: CrustDataPerson) => {
      const loc = c.location_details || {};
      const primaryEmployer = (c.current_employers || [])[0] || {};
      
      return {
        // ── Identity ───────────────────────────────────────────────────
        person_id:                   String(c.person_id),
        full_name:                   c.name,
        first_name:                  c.first_name || null,
        last_name:                   c.last_name || null,
        headline:                    c.headline,
        current_title:               primaryEmployer.title || null,
        current_company:             primaryEmployer.name || null,

        // ── Location ───────────────────────────────────────────────────
        region:                      c.region || null,
        region_address_components:   c.region_address_components || [],
        location_city:               loc.city || null,
        location_state:              loc.state || null,
        location_country:            loc.country || null,
        location_continent:          loc.continent || null,
        location_details_json:       Object.keys(loc).length > 0 ? loc : null,

        // ── Profile media ──────────────────────────────────────────────
        profile_picture_url:         c.profile_picture_url || null,
        profile_picture_permalink:   c.profile_picture_permalink || null,

        // ── Social ─────────────────────────────────────────────────────
        linkedin_url:                c.flagship_profile_url || c.linkedin_profile_url,
        flagship_profile_url:        c.flagship_profile_url || null,
        linkedin_profile_url_raw:    c.linkedin_profile_url || null,
        twitter_handle:              c.twitter_handle || null,
        num_of_connections:          c.num_of_connections || null,
        profile_language:            c.profile_language || null,

        // ── Bio & status ───────────────────────────────────────────────
        summary:                     c.summary || null,
        experience_years:            c.years_of_experience_raw ?? null,
        years_of_experience_label:   c.years_of_experience || null,
        recently_changed_jobs:       c.recently_changed_jobs ?? false,
        open_to_cards_json:          c.open_to_cards || [],
        is_open_to_work:             (c.open_to_cards || []).length > 0 || !!c.recently_changed_jobs,

        // ── Professional ───────────────────────────────────────────────
        skills_json:                 c.skills || [],
        languages_json:              c.languages || [],
        current_employers_json:      c.current_employers || [],
        past_employers_json:         c.past_employers || [],
        all_employers_json:          c.all_employers || [],

        // ── Education / certs / honors ─────────────────────────────────
        education_background_json:   c.education_background || [],
        certifications_json:         c.certifications || [],
        honors_json:                 c.honors || [],

        // ── AI scoring ─────────────────────────────────────────────────
        // We sync the raw AI score corresponding to this candidate
        ai_score:                    scoredAll.find((s: any) => String(s.person_id) === String(c.person_id))?.ai_score || 0,
        score_breakdown_json:        scoredAll.find((s: any) => String(s.person_id) === String(c.person_id))?.score_breakdown || {},

        // ── Raw payload ────────────────────────────────────────────────
        raw_crustdata_json:          c as any,

        // ── Metadata ───────────────────────────────────────────────────
        crustdata_last_updated:      c.last_updated || null,
        last_enriched_at:            new Date().toISOString(),
        last_seen_at:                new Date().toISOString(),
        search_count:                1,
      };
    });

    const persistTask = async () => {
      try {
        // 1. Sync people to global DB (Optimized: Diff-based insertion)
        const personIdsToSync = candidateRows.map((c) => String(c.person_id));
        const { data: existingPeople } = await admin
          .from("people")
          .select("person_id")
          .in("person_id", personIdsToSync);

        const existingSet = new Set(existingPeople?.map((p: any) => p.person_id) || []);
        const newCandidates = candidateRows.filter((c) => !existingSet.has(String(c.person_id)));

        if (newCandidates.length > 0) {
          await admin.from("people").upsert(newCandidates, { onConflict: "person_id", ignoreDuplicates: false });
        }

        // 2. Sync to search_results + search_result_items if search_id provided
        if (search_id) {
          const personIdsArray = scoredAll.map((c) => String(c.person_id));

          // Fetch current max rank if appending
          let startRank = 0;
          if (cursor) {
            const { data: maxRankData } = await admin
              .from("search_result_items")
              .select("rank")
              .eq("search_id", search_id)
              .order("rank", { ascending: false })
              .limit(1)
              .maybeSingle();
            startRank = (maxRankData?.rank ?? -1) + 1;
          }

          // Prepare junction table rows
          const junctionRows = scoredAll.map((c: any, idx: number) => ({
            search_id: search_id,
            person_id: String(c.person_id),
            rank: startRank + idx,
            ai_score: c.ai_score || 0
          }));

          // Bulk upsert into junction table
          await admin.from("search_result_items").upsert(junctionRows, { 
            onConflict: "search_id, person_id",
            ignoreDuplicates: false 
          });

          // Also update search_results for backward compatibility/metadata
          const { data: existing } = await admin
            .from("search_results")
            .select("id, person_ids")
            .eq("search_id", search_id)
            .maybeSingle();

          let finalIds = personIdsArray;
          if (cursor && existing?.person_ids) {
            finalIds = [...existing.person_ids, ...personIdsArray];
            finalIds = Array.from(new Set(finalIds));
          }

          if (existing) {
            await admin.from("search_results").update({
              person_ids: finalIds,
              total_count: totalCount,
              filters_json: filterState,
            }).eq("id", existing.id);
          } else {
            await admin.from("search_results").insert({
              search_id: search_id,
              person_ids: finalIds,
              total_count: totalCount,
              filters_json: filterState,
            });
          }

          // 3. Update conversation title and status
          const firstTitle = (filterState.titles?.[0]) || "New Search";
          const firstLoc = (filterState.regions?.[0]) || "";
          const newTitle = firstLoc ? `${firstTitle} · ${firstLoc}` : firstTitle;

          await admin.from("search_conversations").update({
            title: newTitle,
            status: "CONFIRMING", // mark search as ran
            estimated_matches: totalCount,
            prospeo_filters: filterState // sync filters back
          }).eq("id", search_id);
        }
      } catch (err) {
        console.error("[Search] Global people/results sync error:", err);
      }
    };

    // run in background
    Promise.resolve(persistTask());
  }

  // ── 11. Log search ───────────────────────────────────────────────────────
  Promise.resolve(
    admin.from("searches").insert({
      org_id: profile.org_id,
      query_text: query || null,
      filters_json: filterState,
      result_count: scoredAll.length,
    })
  ).catch(() => { });

  // ── 12. Respond ──────────────────────────────────────────────────────────
  return NextResponse.json({
    results: pageResults,
    full_results: scoredAll, // Return full batch (100) for frontend multi-page caching
    total: totalCount,
    ui_page: ui_page ?? 1,
    total_pages: paginated.totalPages,
    next_cursor: nextCursor,
    pass_used: passUsed,
    what_was_relaxed: whatWasRelaxed, // Which filters were relaxed (populated only in auto_broaden mode)
    fromCache,
    credits_used: creditsUsed,
    ...(debugEnabled ? { debug: { filterState, crustDataFilterTree, passUsed } } : {}),
  });
}
