export type Strategy = "mobile" | "desktop";

export type MetricRating = "good" | "needs-improvement" | "poor";

export interface CoreMetric {
  id: "lcp" | "cls" | "inp" | "fcp" | "ttfb" | "tbt";
  label: string;
  value: number;       // raw value (ms for time, unitless for CLS)
  displayValue: string; // e.g. "2.4 s" or "0.12"
  score: number;       // 0–100
  rating: MetricRating;
  description: string;
}

export interface AuditItem {
  url?: string;
  label?: string;
  wastedBytes?: number;
  totalBytes?: number;
  wastedMs?: number;
}

export interface PassingCheck {
  audit: string;
  title: string;
}

export interface NextjsFix {
  audit: string;       // PSI audit id e.g. "uses-optimized-images"
  title: string;       // Next.js-specific short title
  impact: "high" | "medium" | "low";
  savingsMs?: number;  // estimated ms saved
  problem: string;     // what's wrong, in plain English
  fix: string;         // the exact Next.js fix to apply
  codeExample?: string; // optional before/after or snippet
  docsUrl?: string;    // link to Next.js docs
  auditItems?: AuditItem[]; // specific resources flagged by PSI
}

export interface AnalysisResult {
  url: string;
  strategy: Strategy;
  performanceScore: number;  // 0–100
  metrics: CoreMetric[];
  fixes: NextjsFix[];
  passingChecks: PassingCheck[];
  cachedAt: string;          // ISO timestamp
  fromCache: boolean;
  lighthouseVersion: string;
  fetchTimeMs: number;
}

export interface AnalysisError {
  error: true;
  code: "INVALID_URL" | "SSRF_BLOCKED" | "PSI_TIMEOUT" | "PSI_ERROR" | "RATE_LIMITED" | "PRIVATE_URL";
  message: string;
  retryAfter?: number; // seconds, for rate limit errors
}
