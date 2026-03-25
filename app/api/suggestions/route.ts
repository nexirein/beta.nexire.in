/**
 * app/api/suggestions/route.ts
 * GET /api/suggestions?source=crustdata&field=title|region|skills|industries|companies|schools&q=
 * GET /api/suggestions?source=prospeo&type=location_search|job_title_search&q=   [legacy - contact unlock only]
 *
 * Primary source is now CrustData PersonDB autocomplete.
 * Prospeo kept as legacy source for contact-unlock related lookups only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis/client";
import {
  autocompleteTitles,
  autocompleteRegions,
  autocompleteSkills,
  autocompleteCompanies,
  autocompleteIndustries,
  autocompleteSchools,
} from "@/lib/crustdata/client";

// CrustData field types
type CrustDataField = "title" | "region" | "skills" | "industries" | "companies" | "schools";
const CRUSTDATA_FIELDS: CrustDataField[] = ["title", "region", "skills", "industries", "companies", "schools"];

// Legacy Prospeo type
const PROSPEO_URL = "https://api.prospeo.io/search-suggestions";
const PROSPEO_TYPES = ["location_search", "job_title_search"] as const;
type ProspeoType = (typeof PROSPEO_TYPES)[number];

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const source = req.nextUrl.searchParams.get("source") ?? "crustdata";

  if (!q || q.length < 2) return NextResponse.json({ suggestions: [] });

  // ── CrustData autocomplete (primary path) ───────────────────────────────
  if (source === "crustdata") {
    const field = req.nextUrl.searchParams.get("field") as CrustDataField | null;
    if (!field || !CRUSTDATA_FIELDS.includes(field)) {
      return NextResponse.json({ error: "Invalid field. Must be one of: " + CRUSTDATA_FIELDS.join(", ") }, { status: 400 });
    }

    const cacheKey = `suggest:crust:${field}:${q.toLowerCase().slice(0, 30)}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return NextResponse.json({ suggestions: JSON.parse(cached), fromCache: true });
    } catch { /* skip */ }

    let suggestions: string[] = [];
    switch (field) {
      case "title":      suggestions = await autocompleteTitles(q); break;
      case "region":     suggestions = await autocompleteRegions(q); break;
      case "skills":     suggestions = await autocompleteSkills(q, 20); break;
      case "industries": suggestions = await autocompleteIndustries(q, 20); break;
      case "companies":  suggestions = await autocompleteCompanies(q); break;
      case "schools":    suggestions = await autocompleteSchools(q); break;
    }

    // Cache for 30 minutes
    await redis.set(cacheKey, JSON.stringify(suggestions), { ex: 1800 }).catch(() => {});
    return NextResponse.json({ suggestions });
  }

  return NextResponse.json({ error: "Invalid source. Only 'crustdata' is supported now." }, { status: 400 });
}
