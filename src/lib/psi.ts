import { AUDIT_IDS } from "@/lib/nextjs-fixes";
import type { AuditItem, CoreMetric, MetricRating } from "@/types/analysis";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

// A Lighthouse audit is only "failed" below this score. 0.9 matches the
// threshold Lighthouse itself uses to colour an audit green.
const PASS_THRESHOLD = 0.9;

/**
 * How to read an audit's result depends on its scoreDisplayMode:
 *
 *  binary | numeric | metricSavings → a real 0-1 score, compare to the threshold
 *  informative                      → no pass/fail concept; Lighthouse is just
 *                                     reporting. Only worth surfacing when it
 *                                     comes with an estimated saving.
 *  notApplicable | manual | error   → Lighthouse did not evaluate this page.
 *                                     Neither a failure nor something we can
 *                                     claim is "already optimized".
 */
const UNEVALUATED_MODES = new Set(["notApplicable", "manual", "error"]);

function scoreToRating(score: number): MetricRating {
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

// Lighthouse phrases server-response-time's displayValue as a sentence
// ("Root document took 290 ms") rather than a bare value like every other
// metric. Rendered as a headline number it reads as broken, so TTFB is
// formatted from numericValue instead.
function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function cruxCategoryToRating(category: string): MetricRating {
  if (category === "FAST") return "good";
  if (category === "AVERAGE") return "needs-improvement";
  return "poor";
}

// Lighthouse 13 dropped details.overallSavingsMs from most audits in favour of
// a per-metric metricSavings object. Read the new field first and fall back to
// the legacy one, which a few classic opportunity audits still carry.
function getSavingsMs(audit: Record<string, unknown>): number | undefined {
  const metricSavings = audit.metricSavings as Record<string, number> | undefined;
  if (metricSavings) {
    const candidates = [metricSavings.LCP, metricSavings.FCP, metricSavings.TBT, metricSavings.INP]
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (candidates.length > 0) return Math.round(Math.max(...candidates));
  }
  const details = audit.details as Record<string, unknown> | undefined;
  if (typeof details?.overallSavingsMs === "number") return Math.round(details.overallSavingsMs);
  return undefined;
}

// Insight audits report their findings as a table of resources. Pull out the
// handful of fields we display and drop rows we can't label.
function getAuditItems(details: Record<string, unknown> | undefined): AuditItem[] | undefined {
  if (!Array.isArray(details?.items)) return undefined;

  const items = (details.items as Array<Record<string, unknown>>)
    .slice(0, 5)
    .map((item): AuditItem => {
      const node = item.node as Record<string, unknown> | undefined;
      return {
        url: typeof item.url === "string" ? item.url : undefined,
        label:
          (typeof item.label === "string" ? item.label : undefined) ??
          (typeof node?.nodeLabel === "string" ? node.nodeLabel : undefined),
        wastedBytes: typeof item.wastedBytes === "number" ? Math.round(item.wastedBytes) : undefined,
        totalBytes: typeof item.totalBytes === "number" ? item.totalBytes : undefined,
        wastedMs: typeof item.wastedMs === "number" ? Math.round(item.wastedMs) : undefined,
      };
    })
    .filter((item) => item.url ?? item.label);

  return items.length > 0 ? items : undefined;
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
  const accessibilityScore =
    cats.accessibility?.score != null
      ? Math.round((cats.accessibility.score as number) * 100)
      : undefined;

  const METRIC_MAP: Array<{
    id: CoreMetric["id"];
    auditId: string;
    label: string;
    description: string;
    format?: (numericValue: number) => string;
  }> = [
    { id: "lcp", auditId: "largest-contentful-paint", label: "LCP", description: "Time until the largest image or text block is rendered." },
    { id: "cls", auditId: "cumulative-layout-shift", label: "CLS", description: "How much the page layout shifts unexpectedly during load." },
    { id: "inp", auditId: "interaction-to-next-paint", label: "INP", description: "Responsiveness to user interactions across the page lifecycle." },
    { id: "fcp", auditId: "first-contentful-paint", label: "FCP", description: "Time until first text or image is painted." },
    { id: "ttfb", auditId: "server-response-time", label: "TTFB", description: "Time until the first byte is received from the server.", format: formatDuration },
    { id: "tbt", auditId: "total-blocking-time", label: "TBT", description: "Total time the main thread was blocked during load." },
  ];

  const metrics: CoreMetric[] = METRIC_MAP.map(({ id, auditId, label, description, format }) => {
    const audit = audits[auditId] ?? {};
    const rawScore = audit.score as number | null | undefined;
    // Null score = no lab data for this metric (common for INP)
    const hasLabData = rawScore != null;
    const score = hasLabData ? Math.round(rawScore * 100) : 0;
    const numericValue = (audit.numericValue as number) ?? 0;
    return {
      id,
      label,
      value: numericValue,
      displayValue:
        format && audit.numericValue != null
          ? format(numericValue)
          : (audit.displayValue as string) ?? "—",
      score,
      rating: hasLabData ? scoreToRating(score) : "good", // placeholder; overwritten below if no data
      hasData: hasLabData,
      source: hasLabData ? ("lab" as const) : undefined,
      description,
    };
  });

  // Lighthouse cannot measure INP in a lab run — it needs real interactions.
  // Fall back to the CrUX field data PSI returns alongside the lab result.
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
      inpMetric.score =
        inpMetric.rating === "good" ? 90 : inpMetric.rating === "needs-improvement" ? 70 : 20;
    }
  }

  // Split the audits we understand into things to fix and things already done.
  const savingsMap: Record<string, number> = {};
  const auditItemsMap: Record<string, AuditItem[]> = {};
  const failedAuditIds: string[] = [];
  const passingAuditIds: string[] = [];

  for (const auditId of AUDIT_IDS) {
    const audit = audits[auditId];
    if (!audit) continue;

    const mode = audit.scoreDisplayMode as string | undefined;
    if (mode && UNEVALUATED_MODES.has(mode)) continue;

    const details = audit.details as Record<string, unknown> | undefined;
    const savings = getSavingsMs(audit);
    const isInformative = mode === "informative";

    const hasFailed = isInformative
      ? savings !== undefined && savings > 0
      : ((audit.score as number | null) ?? 1) < PASS_THRESHOLD;

    if (hasFailed) {
      failedAuditIds.push(auditId);
      if (savings !== undefined) savingsMap[auditId] = savings;
      const items = getAuditItems(details);
      if (items) auditItemsMap[auditId] = items;
    } else if (!isInformative) {
      // An informative audit passing means nothing — don't claim credit for it.
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
