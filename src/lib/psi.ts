import type { AuditItem, CoreMetric, MetricRating } from "@/types/analysis";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

// Audit IDs we consider "opportunities" (have savings estimates)
const OPPORTUNITY_AUDIT_IDS = [
  "uses-optimized-images",
  "uses-text-compression",
  "render-blocking-resources",
  "unused-javascript",
  "unused-css-rules",
  "efficient-animated-content",
  "uses-long-cache-ttl",
  "largest-contentful-paint-element",
  "server-response-time",
  "dom-size",
  "uses-passive-event-listeners",
  "uses-rel-preconnect",
];

function scoreToRating(score: number): MetricRating {
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

export async function runPSI(
  url: string,
  strategy: "mobile" | "desktop"
): Promise<{ raw: unknown; fetchTimeMs: number }> {
  const apiKey = process.env.GOOGLE_PSI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PSI_API_KEY is not set");

  const params = new URLSearchParams({
    url,
    strategy: strategy.toUpperCase(),
    key: apiKey,
    category: "performance",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  const start = Date.now();
  try {
    const res = await fetch(`${PSI_ENDPOINT}?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PSI returned ${res.status}: ${body}`);
    }
    const raw = await res.json();
    return { raw, fetchTimeMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

export function shapePSIResponse(
  raw: Record<string, unknown>,
  url: string,
  strategy: "mobile" | "desktop",
  fetchTimeMs: number
) {
  const lhr = raw.lighthouseResult as Record<string, unknown>;
  const cats = lhr.categories as Record<string, unknown>;
  const perf = cats.performance as Record<string, unknown>;
  const audits = lhr.audits as Record<string, Record<string, unknown>>;

  const perfScore = Math.round((perf.score as number) * 100);

  // Core metrics
  const METRIC_MAP: Array<{
    id: CoreMetric["id"];
    auditId: string;
    label: string;
    description: string;
  }> = [
    { id: "lcp", auditId: "largest-contentful-paint", label: "LCP", description: "Time until the largest image or text block is rendered." },
    { id: "cls", auditId: "cumulative-layout-shift", label: "CLS", description: "How much the page layout shifts unexpectedly during load." },
    { id: "inp", auditId: "interaction-to-next-paint", label: "INP", description: "Responsiveness to user interactions across the page lifecycle." },
    { id: "fcp", auditId: "first-contentful-paint", label: "FCP", description: "Time until first text or image is painted." },
    { id: "ttfb", auditId: "server-response-time", label: "TTFB", description: "Time until the first byte is received from the server." },
    { id: "tbt", auditId: "total-blocking-time", label: "TBT", description: "Total time the main thread was blocked during load." },
  ];

  const metrics: CoreMetric[] = METRIC_MAP.map(({ id, auditId, label, description }) => {
    const audit = audits[auditId] ?? {};
    const score = audit.score != null ? Math.round((audit.score as number) * 100) : 0;
    return {
      id,
      label,
      value: (audit.numericValue as number) ?? 0,
      displayValue: (audit.displayValue as string) ?? "—",
      score,
      rating: scoreToRating(score),
      description,
    };
  });

  // Opportunities — failed audits with savings; passing audits for "what's good" section
  const savingsMap: Record<string, number> = {};
  const auditItemsMap: Record<string, AuditItem[]> = {};
  const failedAuditIds: string[] = [];
  const passingAuditIds: string[] = [];

  for (const auditId of OPPORTUNITY_AUDIT_IDS) {
    const audit = audits[auditId];
    if (!audit) continue;
    const score = (audit.score as number) ?? 1;

    if (score < 0.9) {
      failedAuditIds.push(auditId);
      const details = audit.details as Record<string, unknown> | undefined;
      if (details?.overallSavingsMs) {
        savingsMap[auditId] = Math.round(details.overallSavingsMs as number);
      }
      if (Array.isArray(details?.items)) {
        auditItemsMap[auditId] = (details.items as Array<Record<string, unknown>>)
          .slice(0, 5)
          .map((item): AuditItem => ({
            url: (item.url as string) || (item.label as string) || undefined,
            wastedBytes: item.wastedBytes as number | undefined,
            totalBytes: item.totalBytes as number | undefined,
            wastedMs: item.wastedMs as number | undefined,
          }))
          .filter((item) => item.url);
      }
    } else {
      passingAuditIds.push(auditId);
    }
  }

  return {
    url,
    strategy,
    performanceScore: perfScore,
    metrics,
    failedAuditIds,
    passingAuditIds,
    savingsMap,
    auditItemsMap,
    cachedAt: new Date().toISOString(),
    fromCache: false,
    lighthouseVersion: (lhr.lighthouseVersion as string) ?? "unknown",
    fetchTimeMs,
  };
}
