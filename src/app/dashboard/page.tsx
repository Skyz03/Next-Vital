"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ScoreRing from "@/components/ScoreRing";
import { getCheckedFixes, saveCheckedFixes, type HistoryEntry, type FixSummary } from "@/lib/history";

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

const IMPACT_STYLE: Record<FixSummary["impact"], { bg: string; text: string; label: string }> = {
  high:   { bg: "bg-rating-poor",  text: "rating-poor",  label: "High" },
  medium: { bg: "bg-rating-needs", text: "rating-needs", label: "Med" },
  low:    { bg: "bg-rating-good",  text: "rating-good",  label: "Low" },
};

// ── Audit card ────────────────────────────────────────────────────────────────

function AuditCard({ entry }: { entry: HistoryEntry }) {
  const href = `/results?url=${encodeURIComponent(entry.url)}&strategy=${entry.strategy}`;
  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }} title={entry.url}>
            {hostname(entry.url)}
          </p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-2)" }}>{entry.url}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
            style={{
              backgroundColor: "var(--surface-3)",
              color: "var(--text-2)",
            }}
          >
            {entry.strategy}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-2)" }}>{timeAgo(entry.savedAt)}</span>
        </div>
      </div>

      <div className="flex items-end justify-center gap-6 py-1">
        {[
          { score: entry.performanceScore, label: "Perf" },
          { score: entry.seoScore,         label: "SEO" },
          { score: entry.accessibilityScore, label: "A11y" },
        ].map(({ score, label }) =>
          score != null ? (
            <div key={label} className="flex flex-col items-center gap-1">
              <ScoreRing score={score} size={68} />
              <span className="text-[10px]" style={{ color: "var(--text-2)" }}>{label}</span>
            </div>
          ) : null
        )}
      </div>

      <Link
        href={href}
        className="btn-gradient w-full py-2 rounded-xl text-xs font-semibold text-center focus-brand"
      >
        Open Results
      </Link>
    </div>
  );
}

// ── Fix checklist ─────────────────────────────────────────────────────────────

interface ChecklistFix extends FixSummary {
  from: string; // hostname
  resultsHref: string;
}

function buildChecklist(entries: HistoryEntry[]): ChecklistFix[] {
  const seen = new Set<string>();
  const fixes: ChecklistFix[] = [];
  for (const entry of entries) {
    for (const fix of entry.topFixes ?? []) {
      if (seen.has(fix.audit)) continue;
      seen.add(fix.audit);
      fixes.push({
        ...fix,
        from: hostname(entry.url),
        resultsHref: `/results?url=${encodeURIComponent(entry.url)}&strategy=${entry.strategy}`,
      });
    }
  }
  // High → medium → low
  const order = { high: 0, medium: 1, low: 2 };
  return fixes.sort((a, b) => order[a.impact] - order[b.impact]);
}

function FixChecklist({
  fixes,
  checked,
  onToggle,
}: {
  fixes: ChecklistFix[];
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (fixes.length === 0) {
    return (
      <div
        className="glass rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs" style={{ color: "var(--text-2)" }}>
          Run an audit to populate your fix list.
        </p>
      </div>
    );
  }

  const done = fixes.filter((f) => checked.has(f.audit)).length;

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)]">
          Fix Checklist
        </h2>
        <span className="text-[10px]" style={{ color: "var(--text-2)" }}>
          {done}/{fixes.length} done
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface-3)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${fixes.length ? (done / fixes.length) * 100 : 0}%`,
            background: "var(--brand-from)",
          }}
        />
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto pr-1">
        {fixes.map((fix) => {
          const isDone = checked.has(fix.audit);
          const style = IMPACT_STYLE[fix.impact];
          return (
            <label
              key={fix.audit}
              className="flex items-start gap-3 py-2 px-2 rounded-lg cursor-pointer transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <input type="checkbox" checked={isDone} onChange={() => onToggle(fix.audit)} className="sr-only" />
              {/* Custom checkbox */}
              <div
                className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center transition-all"
                style={{
                  border: `1.5px solid ${isDone ? "var(--brand-from)" : "var(--border-2)"}`,
                  backgroundColor: isDone ? "var(--text)" : "transparent",
                }}
              >
                {isDone && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-xs leading-snug"
                  style={{
                    color: isDone ? "var(--text-2)" : "var(--text)",
                    textDecoration: isDone ? "line-through" : "none",
                  }}
                >
                  {fix.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${style.bg} ${style.text} font-medium`}>
                    {style.label}
                  </span>
                  <Link
                    href={fix.resultsHref}
                    className="text-[10px] transition-colors"
                    style={{ color: "var(--text-2)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand-from)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {fix.from} ↗
                  </Link>
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* AI prompt */}
      {fixes.length > 0 && (
        <p className="text-[10px] text-center mt-1" style={{ color: "var(--text-2)" }}>
          Open any result and use{" "}
          <span style={{ color: "var(--brand-from)" }}>AI analysis</span>
          {" "}for a tailored action plan.
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data: { entries: HistoryEntry[] }) => {
        setEntries(data.entries ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    setChecked(getCheckedFixes());
  }, []);

  function toggleFix(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveCheckedFixes(next);
      return next;
    });
  }

  async function handleClear() {
    await fetch("/api/history", { method: "DELETE" }).catch(() => {});
    setEntries([]);
  }

  const checklist = buildChecklist(entries);

  return (
    <div className="px-6 py-8 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
            Audit History
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
            {loaded && entries.length > 0
              ? `${entries.length} audit${entries.length !== 1 ? "s" : ""} saved to your session`
              : "Audits you run are saved here automatically"}
          </p>
        </div>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="glass px-3 py-1.5 rounded-lg text-xs transition-colors focus-brand"
            style={{ color: "var(--text-2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--poor)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Empty state */}
      {loaded && entries.length === 0 && (
        <div className="glass rounded-2xl p-12 flex flex-col items-center gap-4 text-center max-w-sm mx-auto mt-12">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No audits yet</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
            Run your first audit and the results will appear here automatically.
          </p>
          <Link href="/" className="btn-gradient mt-2 px-5 py-2 rounded-xl text-sm font-semibold focus-brand">
            Analyze a site
          </Link>
        </div>
      )}

      {/* Two-column layout */}
      {entries.length > 0 && (
        <div
          className="grid gap-6 items-start"
          style={{ gridTemplateColumns: "1fr 320px" }}
        >
          {/* Left: audit cards */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {entries.map((entry) => (
              <AuditCard key={`${entry.url}:${entry.strategy}`} entry={entry} />
            ))}
          </div>

          {/* Right: fix checklist */}
          <div className="sticky top-4">
            <FixChecklist fixes={checklist} checked={checked} onToggle={toggleFix} />
          </div>
        </div>
      )}
    </div>
  );
}
