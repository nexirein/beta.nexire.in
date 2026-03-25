/**
 * app/api/crustdata/autocomplete/route.ts
 * Proxy to CrustData realtime autocomplete — called from CrustDataAutocompleteInput.
 * fieldType: "title" | "region" | "company" | "skill" | "school"
 * Redis-cached for 7 days — autocomplete suggestions are essentially static.
 */

import { NextResponse } from "next/server";
import { crustdataRealtimeAutocomplete, crustdataAutocomplete } from "@/lib/crustdata/client";
import { redis } from "@/lib/redis/client";
import { REDIS_KEYS, REDIS_TTL } from "@/lib/redis/keys";

export async function POST(req: Request) {
  try {
    const { query, fieldType } = await req.json();
    if (!query || query.length < 1) return NextResponse.json({ results: [] });

    // Validate the requested field
    const validType = (["title", "region", "company", "skill", "school", "industry"].includes(fieldType)
      ? fieldType
      : "title") as "title" | "region" | "company" | "skill" | "school" | "industry";

    // ── Redis read-through cache ────────────────────────────────────────────
    const cacheKey = REDIS_KEYS.crustdataAutocomplete(`${validType}:${query}`);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json({ results: JSON.parse(cached), fromCache: true });
      }
    } catch { /* Redis unavailable — fall through */ }

    let results: string[] = [];
    
    // Direct match with Realtime endpoints
    if (["title", "region", "industry", "school"].includes(validType)) {
      results = await crustdataRealtimeAutocomplete(validType as any, query, 8);
    } 
    // Fallback to general autocomplete for specific DB fields
    else if (validType === "company") {
      results = await crustdataAutocomplete({
          field: "current_employers.name",
          query,
          limit: 8
      });
    } else if (validType === "skill") {
      results = await crustdataAutocomplete({
          field: "skills",
          query,
          limit: 8
      });
    }

    // ── Cache result (7 days — autocomplete is essentially static data) ────
    redis.set(cacheKey, JSON.stringify(results), { ex: REDIS_TTL.CRUSTDATA_AUTOCOMPLETE }).catch(() => {});

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[CrustData Autocomplete]", err);
    return NextResponse.json({ results: [] });
  }
}
