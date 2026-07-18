import type { AuditItem, CoreMetric, MetricRating } from "@/types/analysis";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

const OPPORTUNITY_AUDIT_IDS = [
  // Performance
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
  "font-display",
  "preload-lcp-image",
  "third-party-summary",
  "bootup-time",
  // SEO
  "meta-description",
  "document-title",
  "html-has-lang",
  "canonical",
  "robots-txt",
  "link-text",
  "structured-data",
  // Accessibility
  "image-alt",
  "color-contrast",
];

// Informative audits have score=null; they are relevant when they have items,
// not when they fail a 0-1 score threshold.
const INFORMATIVE_AUDIT_IDS = new Set([
  "largest-contentful-paint-element",
  "third-party-summary",
]);

function scoreToRating(score: number): MetricRating {
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

function cruxCategoryToRating(category: string): MetricRating {
  if (category === "FAST") return "good";
  if (category === "AVERAGE") return "needs-improvement";
  return "poor";
}

// Read savings from Lighthouse 12+ metricSavings first, fall back to legacy overallSavingsMs.
// metricSavings values are per-metric ms estimates; take the max of the time-denominated ones.
function getSavingsMs(audit: Record<string, unknown>): number | undefined {
  const metricSavings = audit.metricSavings as Record<string, number> | undefined;
  if (metricSavings) {
    const candidates = [metricSavings.LCP, metricSavings.FCP, metricSavings.TBT, metricSavings.INP]
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (candidates.length > 0) return Math.round(Math.max(...candidates));
  }
  const details = audit.details as Record<string, unknown> | undefined;
  if (typeof details?.overallSavingsMs === "number") return Math.round(details.overallSavingsMs as number);
  return undefined;
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
  });
  params.append("category", "performance");
  params.append("category", "seo");
  params.append("category", "accessibility");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);

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
  const cats = lhr.categories as Record<string, Record<string, unknown>>;
  const audits = lhr.audits as Record<string, Record<string, unknown>>;

  const perfScore = Math.round((cats.performance.score as number) * 100);
  const seoScore = cats.seo?.score != null ? Math.round((cats.seo.score as number) * 100) : undefined;
  const accessibilityScore = cats.accessibility?.score != null ? Math.round((cats.accessibility.score as number) * 100) : undefined;

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
    const rawScore = audit.score as number | null | undefined;
    // Null score = no lab data for this metric (common for INP)
    const hasLabData = rawScore != null;
    const score = hasLabData ? Math.round(rawScore * 100) : 0;
    return {
      id,
      label,
      value: (audit.numericValue as number) ?? 0,
      displayValue: (audit.displayValue as string) ?? "—",
      score,
      rating: hasLabData ? scoreToRating(score) : "good", // placeholder; overwritten below if no data
      hasData: hasLabData,
      source: hasLabData ? "lab" as const : undefined,
      description,
    };
  });

  // For INP: Lighthouse lab runs rarely produce a score. Fall back to CrUX field data.
  const inpMetric = metrics.find((m) => m.id === "inp");
  if (inpMetric && !inpMetric.hasData) {
    const le = raw.loadingExperience as Record<string, unknown> | undefined;
    const cruxMetrics = le?.metrics as Record<string, Record<string, unknown>> | undefined;
    const cruxInp = cruxMetrics?.INTERACTION_TO_NEXT_PAINT;
    if (cruxInp) {
      const percentile = cruxInp.percentile as number;
      const category = cruxInp.category as string;
      inpMetric.hasData = true;
      inpMetric.source = "field";
      inpMetric.value = percentile;
      inpMetric.displayValue = `${percentile} ms`;
      inpMetric.rating = cruxCategoryToRating(category);
      inpMetric.score = inpMetric.rating === "good" ? 90 : inpMetric.rating === "needs-improvement" ? 70 : 20;
    }
  }

  // Opportunities and passing checks
  const savingsMap: Record<string, number> = {};
  const auditItemsMap: Record<string, AuditItem[]> = {};
  const failedAuditIds: string[] = [];
  const passingAuditIds: string[] = [];

  for (const auditId of OPPORTUNITY_AUDIT_IDS) {
    const audit = audits[auditId];
    if (!audit) continue;
    const score = audit.score as number | null;
    const details = audit.details as Record<string, unknown> | undefined;

    // Informative audits have score=null; treat as failed when they have items to show
    const isInformative = INFORMATIVE_AUDIT_IDS.has(auditId);
    const hasFailed = isInformative
      ? Array.isArray(details?.items) && (details!.items as unknown[]).length > 0
      : (score ?? 1) < 0.9;

    if (hasFailed) {
      failedAuditIds.push(auditId);
      const savings = getSavingsMs(audit);
      if (savings !== undefined) savingsMap[auditId] = savings;
      if (Array.isArray(details?.items)) {
        auditItemsMap[auditId] = (details!.items as Array<Record<string, unknown>>)
          .slice(0, 5)
          .map((item): AuditItem => ({
            url: (item.url as string) || (item.label as string) || undefined,
            wastedBytes: item.wastedBytes as number | undefined,
            totalBytes: item.totalBytes as number | undefined,
            wastedMs: item.wastedMs as number | undefined,
          }))
          .filter((item) => item.url);
      }
    } else if (!isInformative) {
      // Don't add informative audits to passing checks — they have no concept of "passing"
      passingAuditIds.push(auditId);
    }
  }

  return {
    url,
    strategy,
    performanceScore: perfScore,
    seoScore,
    accessibilityScore,
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
