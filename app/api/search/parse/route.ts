// nexire-app — app/api/search/parse/route.ts
// Uses Gemini to parse natural language into Prospeo Filters without executing the search yet.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateProspeoFilters } from "@/lib/ai/gemini-filter";
import { checkRateLimit } from "@/lib/redis/rate-limiter";

export async function POST(req: NextRequest) {
  // Auth check
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; }, set() { }, remove() { } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limiting — generous for parsing (50/hr)
  // checkRateLimit(userId, action, maxRequests, windowSeconds)
  const rl = await checkRateLimit(user.id, "parse", 50, 3600);
  if (!rl.allowed) {
    // Return empty filters so the modal still opens and user can set manually
    return NextResponse.json({
      filters: {},
      reasoning: "Rate limit hit. Please set filters manually.",
      rate_limited: true,
    });
  }

  let body: { query?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const query = body.query?.trim() || "";
  if (!query) {
    return NextResponse.json({ filters: {} });
  }

  try {
    const result = await generateProspeoFilters(query, {});
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Search Parse API] Failed:", error?.message ?? error);

    // If Gemini quota is exhausted, return empty filters gracefully
    // The FilterPanel will open anyway and the user can set filters manually
    if (error?.message?.includes("429") || error?.message?.includes("quota") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      return NextResponse.json({
        filters: {},
        reasoning: "AI quota exceeded. Please upgrade Gemini API key or set filters manually.",
        gemini_exhausted: true,
      });
    }

    return NextResponse.json({ error: "Failed to parse query" }, { status: 500 });
  }
}
