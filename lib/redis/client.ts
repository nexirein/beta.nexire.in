// nexire-app — lib/redis/client.ts
// Redis client. Returns null if Upstash keys aren't set.
// Uses raw fetch to avoid requiring @upstash/redis package.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstashCommand(...args: string[]): Promise<unknown> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;

  const res = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.result;
}

export const redis = {
  async get(key: string): Promise<string | null> {
    if (!UPSTASH_URL) return null;
    const result = await upstashCommand("GET", key);
    return (result as string) ?? null;
  },

  async set(key: string, value: string, opts?: { ex?: number }): Promise<void> {
    if (!UPSTASH_URL) return;
    if (opts?.ex) {
      await upstashCommand("SET", key, value, "EX", String(opts.ex));
    } else {
      await upstashCommand("SET", key, value);
    }
  },

  async incr(key: string): Promise<number> {
    if (!UPSTASH_URL) return 1;
    const result = await upstashCommand("INCR", key);
    return (result as number) ?? 1;
  },

  async expire(key: string, seconds: number): Promise<void> {
    if (!UPSTASH_URL) return;
    await upstashCommand("EXPIRE", key, String(seconds));
  },

  async ttl(key: string): Promise<number> {
    if (!UPSTASH_URL) return 60;
    const result = await upstashCommand("TTL", key);
    return (result as number) ?? 60;
  },

  async del(key: string): Promise<void> {
    if (!UPSTASH_URL) return;
    await upstashCommand("DEL", key);
  },

  get isAvailable(): boolean {
    return !!UPSTASH_URL && !!UPSTASH_TOKEN;
  },
};
