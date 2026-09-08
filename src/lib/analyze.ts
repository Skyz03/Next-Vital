import { isBlockedUrl, normalizeUrl } from "@/lib/validate";
import { runPSI, shapePSIResponse } from "@/lib/psi";
import { getFixesForAudits, getPassingChecks } from "@/lib/nextjs-fixes";
import {
  cacheKey,
  getCached,
  setCached,
  checkRateLimit,
  checkDailyCap,
  acquireInflightLock,
  releaseInflightLock,
} from "@/lib/cache";
import type { AnalysisResult, AnalysisError, Strategy } from "@/types/analysis";

export interface AnalyzeInput {
  url: string;      // already parsed as a valid URL by the caller (Zod, etc.)
  strategy: Strategy;
  ip: string;
}

export type AnalyzeOutcome =
  | { ok: true; result: AnalysisResult; headers?: Record<string, string> }
  | { ok: false; error: AnalysisError; status: number; headers?: Record<string, string> };

// Every entry point (POST /api/analyze, server-rendered /results, future
// tools) goes through this pipeline so the SSRF guard, rate limits, cache,
// in-flight lock, and daily cap can't be bypassed by adding a new caller.
export async function analyze(input: AnalyzeInput): Promise<AnalyzeOutcome> {
  const url = normalizeUrl(input.url);
  const { strategy, ip } = input;

  if (isBlockedUrl(url)) {
    return {
      ok: false,
      status: 400,
      error: {
        error: true,
        code: "SSRF_BLOCKED",
        message: "That URL points to a private or reserved address and cannot be analyzed.",
      },
    };
  }

  // Cache hits cost us nothing, so they neither spend the caller's hourly
  // quota nor count against the global daily PSI budget.
  const key = cacheKey(url, strategy);
  const cached = await getCached(key);
  if (cached) {
    const result = cached as AnalysisResult;
    return { ok: true, result: { ...result, fromCache: true } };
  }

  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return {
      ok: false,
      status: 429,
      error: {
        error: true,
        code: "RATE_LIMITED",
        message: `You've used your 5 free audits for this hour. Try again in ${Math.ceil(
          rateLimit.retryAfter / 60
        )} minutes.`,
        retryAfter: rateLimit.retryAfter,
      },
      headers: { "Retry-After": String(rateLimit.retryAfter), "X-RateLimit-Remaining": "0" },
    };
  }

  // SET NX is atomic — acquiring the lock *is* the check. Loser gets a 409
  // and can retry a few seconds later into a warm cache.
  if (!(await acquireInflightLock(key))) {
    return {
      ok: false,
      status: 409,
      error: {
        error: true,
        code: "PSI_ERROR",
        message: "An audit for this URL is already in progress. Please retry in a few seconds.",
      },
    };
  }

  try {
    // Daily budget is checked here, immediately before the only call that
    // spends it — counting earlier would let rejected requests burn quota.
    if (!(await checkDailyCap())) {
      return {
        ok: false,
        status: 503,
        error: {
          error: true,
          code: "RATE_LIMITED",
          message: "Daily audit capacity reached. Try again tomorrow.",
        },
      };
    }

    let psiData: Awaited<ReturnType<typeof runPSI>>;
    try {
      psiData = await runPSI(url, strategy);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          ok: false,
          status: 504,
          error: {
            error: true,
            code: "PSI_TIMEOUT",
            message: "The audit timed out. The target site may be slow or unreachable.",
          },
        };
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        ok: false,
        status: 502,
        error: {
          error: true,
          code: "PSI_ERROR",
          message: `PageSpeed Insights returned an error: ${message}`,
        },
      };
    }

    const shaped = shapePSIResponse(
      psiData.raw as Record<string, unknown>,
      url,
      strategy,
      psiData.fetchTimeMs
    );
    const fixes = getFixesForAudits(shaped.failedAuditIds, shaped.savingsMap, shaped.auditItemsMap);
    const passingChecks = getPassingChecks(shaped.passingAuditIds);

    const result: AnalysisResult = {
      url: shaped.url,
      strategy: shaped.strategy,
      performanceScore: shaped.performanceScore,
      seoScore: shaped.seoScore,
      accessibilityScore: shaped.accessibilityScore,
      metrics: shaped.metrics,
      fixes,
      passingChecks,
      cachedAt: shaped.cachedAt,
      fromCache: false,
      lighthouseVersion: shaped.lighthouseVersion,
      fetchTimeMs: shaped.fetchTimeMs,
    };

    await setCached(key, result);
    return {
      ok: true,
      result,
      headers: { "X-RateLimit-Remaining": String(rateLimit.remaining) },
    };
  } finally {
    // Every exit path releases the lock, including a throw from the shaping
    // layer. Leaking it would 409 every request for this URL for 65s.
    await releaseInflightLock(key);
  }
}
