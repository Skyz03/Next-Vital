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
  const ratingClass = metric.rating === "needs-improvement" ? "needs" : metric.rating;

  return (
    <div
      className={`bg-rating-${ratingClass} rounded-xl p-4 border border-current/10`}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-[var(--text)]">{metric.label}</span>
        <span className={`text-xs font-medium rating-${ratingClass} uppercase tracking-wide`}>
          {RATING_LABEL[metric.rating]}
        </span>
      </div>
      <div className={`text-2xl font-bold rating-${ratingClass} mb-1`}>
        {metric.displayValue}
      </div>
      <p className="text-xs text-[var(--text-2)] leading-relaxed">{metric.description}</p>
    </div>
  );
}
