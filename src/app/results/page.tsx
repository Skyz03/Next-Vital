"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AnalysisResult } from "@/types/analysis";
import ScoreRing from "@/components/ScoreRing";
import MetricCard from "@/components/MetricCard";
import FixCard from "@/components/FixCard";

function ResultsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("nextvital_result");
    if (stored) {
      setResult(JSON.parse(stored));
    } else {
      router.push("/");
    }
  }, [router]);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--text-2)]">
        Loading…
      </div>
    );
  }

  const url = params.get("url") ?? result.url;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
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
          <ScoreRing score={result.performanceScore} size={96} />
        </div>

        {/* Core Web Vitals — all 6 metrics */}
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

        {/* Next.js Fixes */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)] mb-4">
            {result.fixes.length > 0
              ? `${result.fixes.length} Next.js fix${result.fixes.length === 1 ? "" : "es"} found`
              : "No fixes needed — great work"}
          </h2>
          {result.fixes.length === 0 ? (
            <p className="text-sm text-[var(--text-2)]">
              Your app is well-optimized. No Next.js-specific improvements were detected.
            </p>
          ) : (
            <div className="space-y-3">
              {result.fixes.map((fix, i) => (
                <FixCard key={fix.audit} fix={fix} index={i} />
              ))}
            </div>
          )}
        </section>

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
