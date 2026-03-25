import { NextResponse } from "next/server";
import { redis } from "@/lib/redis/client"; // Guessing based on `lib/redis/client.ts`

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Always: Clean names before search (remove commas, city names)
  // Simple heuristic for city names removal: we can just remove commas and text after them, or common suffixes.
  let cleanName = name.split(",")[0].trim();
  // Remove common university location suffixes like "at Austin", "- Madison", etc if needed, but commas are a good start.

  const cacheKey = `logo:inst:${cleanName.toLowerCase()}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null && typeof cached === 'string') {
      return NextResponse.json({ domain: cached === "NONE" ? null : cached, fromCache: true });
    }
  } catch (e) {
    // Ignore redis errors
  }

  try {
    const secret = process.env.LOGO_DEV_SECRET_KEY;
    if (!secret) {
      console.warn("LOGO_DEV_SECRET_KEY is not set.");
      return NextResponse.json({ error: "Configuration error" }, { status: 500 });
    }

    // Use strategy=match for accurate results
    const res = await fetch(`https://api.logo.dev/search?q=${encodeURIComponent(cleanName)}&strategy=match`, {
      headers: {
        "Authorization": `Bearer ${secret}`
      }
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Logo search failed" }, { status: res.status });
    }

    const data = await res.json();
    let domain = null;
    
    // Pick top result (data[0])
    if (Array.isArray(data) && data.length > 0 && data[0]?.domain) {
      domain = data[0].domain;
    }

    try {
      // Cache domains to reduce API cost (30 days)
      await redis.set(cacheKey, domain || "NONE", { ex: 30 * 24 * 60 * 60 });
    } catch (e) {
      // Ignore redis cache set errors
    }

    return NextResponse.json({ domain, fromCache: false });
  } catch (error) {
    console.error("Logo search API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
