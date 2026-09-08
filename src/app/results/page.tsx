import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { UrlSchema } from "@/lib/validate";
import { analyze } from "@/lib/analyze";
import ResultsView from "@/components/ResultsView";
import ResultsSkeleton from "@/components/ResultsSkeleton";

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
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text)] mb-3 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        New audit
      </Link>
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

  return <ResultsView report={outcome.result} />;
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
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">
        <Header url={url} strategy={strategy} />
        <Suspense fallback={<ResultsSkeleton withProgress />}>
          <ResultsLoader url={url} strategy={strategy} />
        </Suspense>
      </div>
    </main>
  );
}
