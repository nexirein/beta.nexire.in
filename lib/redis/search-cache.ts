// nexire-app — lib/redis/search-cache.ts
// Search result caching. Skips if Redis unavailable.

import { redis } from "./client";
import crypto from "crypto";

const CACHE_TTL = 3600; // 1 hour

export function buildCacheKey(filters: Record<string, unknown>, offset: number, passLevel: number = 1): string {
  const normalized = JSON.stringify({
    ...filters,
    _offset: offset,
    _pass: passLevel,   // CRITICAL: each broaden pass gets its own cache slot
  });
  return `nexire:search:${crypto.createHash("md5").update(normalized).digest("hex")}`;
}

export async function getCachedSearch(key: string): Promise<unknown | null> {
  if (!redis.isAvailable) return null;

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    return null;
  } catch {
    return null;
  }
}

export async function setCachedSearch(key: string, data: unknown): Promise<void> {
  if (!redis.isAvailable) return;

  try {
    await redis.set(key, JSON.stringify(data), { ex: CACHE_TTL });
  } catch {
    // Cache write failure is non-fatal
  }
}
