import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TTL_SECONDS = 60 * 60 * 24; // 24 hours
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour
const RATE_LIMIT_MAX = 5;
const DAILY_PSI_CAP = 500;
const INFLIGHT_TTL = 65; // slightly longer than the 40s PSI timeout + route maxDuration buffer

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

export async function checkDailyCap(): Promise<boolean> {
  try {
    const key = `global:psi:${new Date().toISOString().slice(0, 10)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60 * 60 * 26); // 26h covers timezone edge cases
    return count <= DAILY_PSI_CAP;
  } catch {
    return true; // fail open
  }
}

// Atomic rate limiter: INCR + EXPIRE NX in a single pipeline round-trip.
// The NX option on EXPIRE sets the TTL only if the key has no expiry yet,
// which prevents resetting the window on every request and eliminates the
// INCR/EXPIRE race where a crash between the two calls leaves the key immortal.
export async function checkRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  try {
    const key = rateLimitKey(ip);
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, RATE_LIMIT_WINDOW, "NX");
    const results = await pipeline.exec();
    const count = results[0] as number;
    const ttl = await redis.ttl(key);
    return {
      allowed: count <= RATE_LIMIT_MAX,
      remaining: Math.max(0, RATE_LIMIT_MAX - count),
      retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW,
    };
  } catch {
    return { allowed: true, remaining: RATE_LIMIT_MAX, retryAfter: 0 };
  }
}

// In-flight lock: prevents two concurrent requests for the same URL from both
// hitting PSI. First caller acquires the lock; second gets a 409 immediately
// and can retry after a few seconds (the cache will be warm by then).
export async function acquireInflightLock(key: string): Promise<boolean> {
  try {
    const result = await redis.set(`inflight:${key}`, "1", { nx: true, ex: INFLIGHT_TTL });
    return result === "OK";
  } catch {
    return true; // fail open — better to double-call PSI than to block
  }
}

export async function releaseInflightLock(key: string): Promise<void> {
  try {
    await redis.del(`inflight:${key}`);
  } catch {
    // non-fatal; TTL will clean it up
  }
}

export async function isInflightLocked(key: string): Promise<boolean> {
  try {
    return (await redis.exists(`inflight:${key}`)) === 1;
  } catch {
    return false; // fail open
  }
}
