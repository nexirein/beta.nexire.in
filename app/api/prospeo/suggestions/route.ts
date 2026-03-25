// nexire-app — app/api/prospeo/suggestions/route.ts
// Proxy for Prospeo /search-suggestions API
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const PROSPEO_API_KEY = process.env.PROSPEO_API_KEY;

export async function POST(req: NextRequest) {
  // 1. Auth check
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; }, set() { }, remove() { } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!PROSPEO_API_KEY) {
    return NextResponse.json({ error: "Prospeo API key not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { location_search, job_title_search } = body;

    if (!location_search && !job_title_search) {
      return NextResponse.json({ error: "Must provide location_search or job_title_search" }, { status: 400 });
    }
    if (location_search && job_title_search) {
      return NextResponse.json({ error: "Must provide exactly one of location_search or job_title_search" }, { status: 400 });
    }

    const payload = location_search ? { location_search } : { job_title_search };

    const res = await fetch("https://api.prospeo.io/search-suggestions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": PROSPEO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.error_code || "Prospeo API Error" }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[Prospeo Suggestions API] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
