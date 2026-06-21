import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TTL_SECONDS = 60 * 60 * 24; // 24 hours
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour
const RATE_LIMIT_MAX = 5;

export function cacheKey(url: string, strategy: string): string {
  const encoded = Buffer.from(url).toString("base64url");
  return `analysis:${strategy}:${encoded}`;
}

export function rateLimitKey(ip: string): string {
  return `ratelimit:${ip}`;
}

export async function getCached(key: string): Promise<unknown | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function setCached(key: string, value: unknown): Promise<void> {
  try {
    await redis.set(key, value, { ex: TTL_SECONDS });
  } catch {
    // cache write failure is non-fatal
  }
}

export async function checkRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  try {
    const key = rateLimitKey(ip);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }
    const ttl = await redis.ttl(key);
    return {
      allowed: count <= RATE_LIMIT_MAX,
      remaining: Math.max(0, RATE_LIMIT_MAX - count),
      retryAfter: ttl,
    };
  } catch {
    // if Redis is down, allow the request
    return { allowed: true, remaining: RATE_LIMIT_MAX, retryAfter: 0 };
  }
}
