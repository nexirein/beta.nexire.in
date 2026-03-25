// nexire-app — lib/redis/rate-limiter.ts
// Sliding window rate limiter. Skips if Redis unavailable.

import { redis } from "./client";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export async function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number = 30,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  if (!redis.isAvailable) {
    return { allowed: true, remaining: maxRequests, retryAfter: 0 };
  }

  const key = `rl:${action}:${userId}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, maxRequests - count);

    return {
      allowed: count <= maxRequests,
      remaining,
      retryAfter: count > maxRequests ? ttl : 0,
    };
  } catch (err) {
    console.error("[RateLimit] Redis error, allowing request:", err);
    return { allowed: true, remaining: maxRequests, retryAfter: 0 };
  }
}
