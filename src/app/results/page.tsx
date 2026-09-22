import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { UrlSchema } from "@/lib/validate";
import { analyze } from "@/lib/analyze";
import ResultsView from "@/components/ResultsView";
import ResultsSkeleton from "@/components/ResultsSkeleton";
import HistorySaver from "@/components/HistorySaver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getIP(h: Headers): string {
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}

function Header({ url, strategy }: { url: string; strategy: string }) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-[var(--text)] break-all">{url}</h1>
      <p className="text-xs text-[var(--text-2)] mt-1 capitalize">{strategy}</p>
    </div>
  );
}

async function ResultsLoader({ url, strategy }: { url: string; strategy: "mobile" | "desktop" }) {
  const ip = getIP(await headers());
  const outcome = await analyze({ url, strategy, ip });

  if (!outcome.ok) {
    // Nearest error.tsx catches this. The message surfaces from AnalysisError.
    throw new Error(outcome.error.message);
  }

  const { url: resultUrl, strategy: resultStrategy, performanceScore, seoScore, accessibilityScore, cachedAt, fixes } = outcome.result;
  const topFixes = fixes
    .filter((f) => f.impact === "high" || f.impact === "medium")
    .slice(0, 10)
    .map(({ audit, title, impact, category }) => ({ audit, title, impact, category }));

  return (
    <>
      <HistorySaver
        url={resultUrl}
        strategy={resultStrategy}
        performanceScore={performanceScore}
        seoScore={seoScore}
        accessibilityScore={accessibilityScore}
        cachedAt={cachedAt}
        topFixes={topFixes}
      />
      <ResultsView report={outcome.result} />
    </>
  );
}

interface PageProps {
  searchParams: Promise<{ url?: string; strategy?: string }>;
}

export default async function ResultsPage({ searchParams }: PageProps) {
  const { url: rawUrl, strategy: rawStrategy } = await searchParams;

  if (!rawUrl) {
    redirect("/");
  }

  const parsed = UrlSchema.safeParse({ url: rawUrl, strategy: rawStrategy });
  if (!parsed.success) {
    redirect("/");
  }

  const { url, strategy } = parsed.data;

  return (
    <main className="px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-10">
        <Header url={url} strategy={strategy} />
        <Suspense fallback={<ResultsSkeleton withProgress />}>
          <ResultsLoader url={url} strategy={strategy} />
        </Suspense>
      </div>
    </main>
  );
}
