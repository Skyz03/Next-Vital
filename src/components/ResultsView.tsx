import type { AnalysisResult } from "@/types/analysis";
import ScoreRing from "@/components/ScoreRing";
import MetricCard from "@/components/MetricCard";
import FixCard from "@/components/FixCard";
import AiPanel from "@/components/AiPanel";
import ShareButton from "@/components/ShareButton";

const CATEGORY_META = {
  performance: { label: "Performance" },
  seo: { label: "SEO" },
  accessibility: { label: "Accessibility" },
} as const;

interface Props {
  report: AnalysisResult;
  /** When set, the ShareButton copies /r/{id} without minting a new one. */
  permalinkId?: string;
}

export default function ResultsView({ report, permalinkId }: Props) {
  const scoreItems = [
    { label: "Performance", score: report.performanceScore },
    ...(report.seoScore != null ? [{ label: "SEO", score: report.seoScore }] : []),
    ...(report.accessibilityScore != null ? [{ label: "Accessibility", score: report.accessibilityScore }] : []),
  ];

  const fixCategories = (["performance", "seo", "accessibility"] as const)
    .map((cat) => ({
      key: cat,
      ...CATEGORY_META[cat],
      fixes: report.fixes.filter((f) => f.category === cat),
    }))
    .filter((c) => c.fixes.length > 0);

  const totalFixes = report.fixes.length;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-2)]">
          Lighthouse {report.lighthouseVersion}
          {report.fromCache && (
            <span className="ml-2 text-[var(--needs)]">· Cached {new Date(report.cachedAt).toLocaleString()}</span>
          )}
        </p>
        <ShareButton url={report.url} strategy={report.strategy} existingId={permalinkId} />
      </div>

      {/* Score row */}
      <div className="glass rounded-2xl py-8 px-6 flex gap-8 justify-center">
        {scoreItems.map(({ label, score }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <ScoreRing score={score} size={96} />
            <span className="text-xs font-medium text-[var(--text-2)] uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>

      {/* Performance metrics */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-4 text-[var(--text-2)]">
          Performance metrics
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {report.metrics.map((m) => (
            <MetricCard key={m.id} metric={m} />
          ))}
        </div>
      </section>

      {/* Fixes grouped by category */}
      {totalFixes === 0 ? (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4 text-[var(--text-2)]">
            No fixes needed — great work
          </h2>
          <p className="text-sm text-[var(--text-2)]">
            No performance, SEO, or accessibility improvements were detected.
          </p>
        </section>
      ) : (
        fixCategories.map((cat, catIndex) => (
          <section key={cat.key}>
            {catIndex > 0 && <hr className="section-sep mb-10 -mt-4" />}
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4 text-[var(--text-2)]">
              {cat.fixes.length} {cat.label} fix{cat.fixes.length === 1 ? "" : "es"} found
            </h2>
            <div className="space-y-3">
              {cat.fixes.map((fix, i) => (
                <FixCard key={fix.audit} fix={fix} index={catIndex === 0 ? i : i + 1} />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Already optimized */}
      {report.passingChecks && report.passingChecks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4 text-[var(--text-2)]">
            Already optimized
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.passingChecks.map((check) => (
              <div
                key={check.audit}
                className="flex items-center gap-2.5 text-xs glass rounded-lg px-3 py-2.5"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="rating-good shrink-0"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span className="text-[var(--text)]">{check.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <AiPanel result={report} />
    </div>
  );
}
