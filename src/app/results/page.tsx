"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AnalysisResult } from "@/types/analysis";
import ScoreRing from "@/components/ScoreRing";
import MetricCard from "@/components/MetricCard";
import FixCard from "@/components/FixCard";
import AiPanel from "@/components/AiPanel";

const CATEGORY_META = {
  performance: { label: "Performance" },
  seo: { label: "SEO" },
  accessibility: { label: "Accessibility" },
} as const;

function ResultsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const urlParam = params.get("url");
    if (!urlParam) {
      router.replace("/");
      return;
    }

    const strategyParam = (params.get("strategy") ?? "mobile") as "mobile" | "desktop";

    // Always ask the API rather than handing the result over in sessionStorage.
    // The audit that produced this link has already populated the Redis cache,
    // so this is a cache hit that costs the caller no quota — and it means a
    // shared link works for someone who never ran the audit.
    let cancelled = false;
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlParam, strategy: strategyParam }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Something went wrong.");
        return data as AnalysisResult;
      })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message ?? "Failed to load results.");
      });

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-[var(--poor)]">{loadError}</p>
        <button
          onClick={() => router.push("/")}
          className="text-xs text-[var(--text-2)] hover:text-[var(--text)]"
        >
          ← New audit
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--text-2)]">
        Loading…
      </div>
    );
  }

  const url = params.get("url") ?? result.url;

  const scoreItems = [
    { label: "Performance", score: result.performanceScore },
    ...(result.seoScore != null ? [{ label: "SEO", score: result.seoScore }] : []),
    ...(result.accessibilityScore != null ? [{ label: "Accessibility", score: result.accessibilityScore }] : []),
  ];

  const fixCategories = (["performance", "seo", "accessibility"] as const).map((cat) => ({
    key: cat,
    ...CATEGORY_META[cat],
    fixes: result.fixes.filter((f) => f.category === cat),
  })).filter((c) => c.fixes.length > 0);

  const totalFixes = result.fixes.length;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <button
            onClick={() => router.push("/")}
            className="text-xs text-[var(--text-2)] hover:text-[var(--text)] mb-3 block"
          >
            ← New audit
          </button>
          <h1 className="text-lg font-semibold text-[var(--text)] break-all">{url}</h1>
          <p className="text-xs text-[var(--text-2)] mt-1">
            {result.strategy} · Lighthouse {result.lighthouseVersion}
            {result.fromCache && (
              <span className="ml-2 text-[var(--needs)]">
                · Cached {new Date(result.cachedAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>

        {/* Score row */}
        <div className="flex gap-6 justify-center">
          {scoreItems.map(({ label, score }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <ScoreRing score={score} size={88} />
              <span className="text-xs text-[var(--text-2)]">{label}</span>
            </div>
          ))}
        </div>

        {/* Performance metrics */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)] mb-4">
            Performance metrics
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {result.metrics.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        </section>

        {/* Fixes grouped by category */}
        {totalFixes === 0 ? (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)] mb-4">
              No fixes needed — great work
            </h2>
            <p className="text-sm text-[var(--text-2)]">
              No performance, SEO, or accessibility improvements were detected.
            </p>
          </section>
        ) : (
          fixCategories.map((cat, catIndex) => (
            <section key={cat.key}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)] mb-4">
                {cat.fixes.length} {cat.label} fix{cat.fixes.length === 1 ? "" : "es"} found
              </h2>
              <div className="space-y-3">
                {cat.fixes.map((fix, i) => (
                  <FixCard
                    key={fix.audit}
                    fix={fix}
                    index={catIndex === 0 ? i : i + 1}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {/* Already optimized */}
        {result.passingChecks && result.passingChecks.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)] mb-4">
              Already optimized
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.passingChecks.map((check) => (
                <div
                  key={check.audit}
                  className="flex items-center gap-2.5 text-xs bg-rating-good rounded-lg px-3 py-2.5 border border-[var(--border)]"
                >
                  <span className="rating-good font-bold text-sm leading-none">✓</span>
                  <span className="text-[var(--text)]">{check.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <AiPanel result={result} />

      </div>
    </main>
  );
}

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  );
}
