import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";
import type { AnalysisResult } from "@/types/analysis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TTL_SECONDS = 60 * 60 * 24; // 24 hours
const PERMALINK_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — shared links must outlive the analysis cache
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour
const RATE_LIMIT_MAX = 5;
const AI_RATE_LIMIT_WINDOW = 60 * 60; // 1 hour
const AI_RATE_LIMIT_MAX = 60;
const DAILY_PSI_CAP = 500;
const INFLIGHT_TTL = 65; // slightly longer than the 40s PSI timeout + route maxDuration buffer

export function cacheKey(url: string, strategy: string): string {
  const encoded = Buffer.from(url).toString("base64url");
  return `analysis:${strategy}:${encoded}`;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export function rateLimitKey(ip: string): string {
  return `ratelimit:${ip}`;
}

export function aiRateLimitKey(ip: string): string {
  return `ai:ratelimit:${ip}`;
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
async function incrementWindow(
  key: string,
  windowSeconds: number,
  max: number
): Promise<RateLimitResult> {
  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, windowSeconds, "NX");
    const results = await pipeline.exec();
    const count = results[0] as number;
    const ttl = await redis.ttl(key);
    return {
      allowed: count <= max,
      remaining: Math.max(0, max - count),
      retryAfter: ttl > 0 ? ttl : windowSeconds,
    };
  } catch {
    return { allowed: true, remaining: max, retryAfter: 0 };
  }
}

/** The PSI audit quota — each call spends a Google API request. */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  return incrementWindow(rateLimitKey(ip), RATE_LIMIT_WINDOW, RATE_LIMIT_MAX);
}

// A separate, much looser budget for the AI routes. These spend the *caller's*
// tokens, not ours, so the limit is not about cost — it exists so the proxy
// cannot be driven as a general-purpose LLM relay. Reusing the 5/hour PSI quota
// here would strand a user after their first chat exchange.
export async function checkAiRateLimit(ip: string): Promise<RateLimitResult> {
  return incrementWindow(aiRateLimitKey(ip), AI_RATE_LIMIT_WINDOW, AI_RATE_LIMIT_MAX);
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

// URL-safe 10-char ID from 8 random bytes → base64url. ~6e19 combinations —
// collision probability is negligible at any realistic permalink volume.
export function generatePermalinkId(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

export function permalinkKey(id: string): string {
  return `perma:${id}`;
}

export async function setPermalink(id: string, report: AnalysisResult): Promise<void> {
  try {
    await redis.set(permalinkKey(id), report, { ex: PERMALINK_TTL_SECONDS });
  } catch {
    // cache write failure is non-fatal
  }
}

export async function getPermalink(id: string): Promise<AnalysisResult | null> {
  try {
    const value = await redis.get(permalinkKey(id));
    return value ? (value as AnalysisResult) : null;
  } catch {
    return null;
  }
}

