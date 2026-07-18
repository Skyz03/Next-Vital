import { type NextRequest, NextResponse } from "next/server";
import { UrlSchema, isBlockedUrl, normalizeUrl } from "@/lib/validate";
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
  isInflightLocked,
} from "@/lib/cache";
import type { AnalysisResult, AnalysisError } from "@/types/analysis";

export const maxDuration = 60;

// On Vercel, x-real-ip is the authoritative client IP set by the platform and
// cannot be spoofed by the client. x-forwarded-for is also set by Vercel but
// clients can prepend values — take the last entry (the platform-injected hop)
// only as a last resort.
function getIP(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // Last entry is the most recently added (platform-injected), not client-controlled
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}

function errorResponse(err: AnalysisError, status: number, headers?: Record<string, string>) {
  return NextResponse.json(err, { status, headers });
}

export async function POST(req: NextRequest) {
  // 1. Parse + validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ error: true, code: "INVALID_URL", message: "Invalid request body." }, 400);
  }

  const parsed = UrlSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      { error: true, code: "INVALID_URL", message: parsed.error.issues[0].message },
      400
    );
  }

  const { url: rawUrl, strategy } = parsed.data;
  const url = normalizeUrl(rawUrl);

  // 2. SSRF check
  if (isBlockedUrl(url)) {
    return errorResponse(
      { error: true, code: "SSRF_BLOCKED", message: "That URL points to a private or reserved address and cannot be analyzed." },
      400
    );
  }

  // 3. Cache check — cached hits bypass rate limiting and quota entirely
  const key = cacheKey(url, strategy);
  const cached = await getCached(key);
  if (cached) {
    const result = cached as AnalysisResult;
    return NextResponse.json({ ...result, fromCache: true });
  }

  // 4. Global daily PSI cap — check before per-IP rate limit so users don't burn
  //    their hourly quota when the service itself is at capacity
  const withinDailyCap = await checkDailyCap();
  if (!withinDailyCap) {
    return errorResponse(
      { error: true, code: "RATE_LIMITED", message: "Daily audit capacity reached. Try again tomorrow." },
      503
    );
  }

  // 5. Per-IP rate limit
  const ip = getIP(req);
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return errorResponse(
      {
        error: true,
        code: "RATE_LIMITED",
        message: `You've used your 5 free audits for this hour. Try again in ${Math.ceil(rateLimit.retryAfter / 60)} minutes.`,
        retryAfter: rateLimit.retryAfter,
      },
      429,
      { "Retry-After": String(rateLimit.retryAfter) }
    );
  }

  // 6. In-flight lock — prevent two concurrent requests for the same URL from
  //    both hitting PSI (cache stampede). Second caller gets a 409 and can retry
  //    in a few seconds once the first request has populated the cache.
  if (await isInflightLocked(key)) {
    return errorResponse(
      { error: true, code: "PSI_ERROR", message: "An audit for this URL is already in progress. Please retry in a few seconds." },
      409
    );
  }

  const lockAcquired = await acquireInflightLock(key);
  if (!lockAcquired) {
    return errorResponse(
      { error: true, code: "PSI_ERROR", message: "An audit for this URL is already in progress. Please retry in a few seconds." },
      409
    );
  }

  // 7. Run PSI
  let psiData: Awaited<ReturnType<typeof runPSI>>;
  try {
    psiData = await runPSI(url, strategy);
  } catch (err) {
    await releaseInflightLock(key);
    if (err instanceof Error && err.name === "AbortError") {
      return errorResponse(
        { error: true, code: "PSI_TIMEOUT", message: "The audit timed out. The target site may be slow or unreachable." },
        504
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(
      { error: true, code: "PSI_ERROR", message: `PageSpeed Insights returned an error: ${message}` },
      502
    );
  }

  // 8. Shape + enrich with Next.js fixes
  const shaped = shapePSIResponse(psiData.raw as Record<string, unknown>, url, strategy, psiData.fetchTimeMs);
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

  // 9. Cache, release lock, return
  await setCached(key, result);
  await releaseInflightLock(key);
  return NextResponse.json(result);
}
