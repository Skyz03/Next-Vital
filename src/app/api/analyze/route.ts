import { type NextRequest, NextResponse } from "next/server";
import { UrlSchema, isBlockedUrl } from "@/lib/validate";
import { runPSI, shapePSIResponse } from "@/lib/psi";
import { getFixesForAudits, getPassingChecks } from "@/lib/nextjs-fixes";
import { cacheKey, getCached, setCached, checkRateLimit, checkDailyCap } from "@/lib/cache";
import type { AnalysisResult, AnalysisError } from "@/types/analysis";

export const maxDuration = 60;

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
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

  const { url, strategy } = parsed.data;

  // 2. SSRF check
  if (isBlockedUrl(url)) {
    return errorResponse(
      { error: true, code: "SSRF_BLOCKED", message: "That URL points to a private or reserved address and cannot be analyzed." },
      400
    );
  }

  // 3. Cache check — cached hits bypass rate limiting entirely
  const key = cacheKey(url, strategy);
  const cached = await getCached(key);
  if (cached) {
    const result = cached as AnalysisResult;
    return NextResponse.json({ ...result, fromCache: true });
  }

  // 4. Rate limit (only on cache miss)
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

  // 5. Global daily PSI cap (protects against many-IP traffic spikes)
  const withinDailyCap = await checkDailyCap();
  if (!withinDailyCap) {
    return errorResponse(
      { error: true, code: "RATE_LIMITED", message: "Daily audit capacity reached. Try again tomorrow." },
      503
    );
  }

  // 6. Run PSI
  let psiData: Awaited<ReturnType<typeof runPSI>>;
  try {
    psiData = await runPSI(url, strategy);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort") || message.includes("timeout")) {
      return errorResponse(
        { error: true, code: "PSI_TIMEOUT", message: "The audit timed out. The target site may be slow or unreachable." },
        504
      );
    }
    return errorResponse(
      { error: true, code: "PSI_ERROR", message: `PageSpeed Insights returned an error: ${message}` },
      502
    );
  }

  // 7. Shape + enrich with Next.js fixes
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

  // 8. Cache + return
  await setCached(key, result);
  return NextResponse.json(result);
}
