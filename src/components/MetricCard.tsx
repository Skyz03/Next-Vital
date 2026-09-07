import type { CoreMetric } from "@/types/analysis";

interface Props {
  metric: CoreMetric;
}

const RATING_LABEL = {
  good: "Good",
  "needs-improvement": "Needs work",
  poor: "Poor",
};

export default function MetricCard({ metric }: Props) {
  if (metric.hasData === false) {
    return (
      <div className="glass rounded-xl p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-sm font-semibold text-[var(--text)]">{metric.label}</span>
          <span className="text-xs text-[var(--text-2)] uppercase tracking-wide">No data</span>
        </div>
        <div className="text-2xl font-bold text-[var(--text-2)] mb-1">—</div>
        <p className="text-xs text-[var(--text-2)] leading-relaxed">{metric.description}</p>
      </div>
    );
  }

  const ratingClass = metric.rating === "needs-improvement" ? "needs" : metric.rating;
  const borderLeftColor =
    metric.rating === "good" ? "var(--good)"
    : metric.rating === "needs-improvement" ? "var(--needs)"
    : "var(--poor)";

  return (
    <div
      className="glass rounded-xl p-4 border-l-2"
      style={{ borderLeftColor }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-[var(--text)]">{metric.label}</span>
        <div className="flex items-center gap-1.5">
          {metric.source === "field" && (
            <span className="text-xs text-[var(--text-2)]" title="Real-user field data from Chrome UX Report">
              field
            </span>
          )}
          <span className={`text-xs font-medium rating-${ratingClass} uppercase tracking-wide`}>
            {RATING_LABEL[metric.rating]}
          </span>
        </div>
      </div>
      <div className={`text-2xl font-bold rating-${ratingClass} mb-1`}>
        {metric.displayValue}
      </div>
      <p className="text-xs text-[var(--text-2)] leading-relaxed">{metric.description}</p>
    </div>
  );
}
