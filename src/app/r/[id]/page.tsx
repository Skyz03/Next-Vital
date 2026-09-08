import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getPermalink } from "@/lib/cache";
import ResultsView from "@/components/ResultsView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function scoreSummary(perf: number, seo?: number, a11y?: number): string {
  const parts = [`Performance ${perf}`];
  if (seo != null) parts.push(`SEO ${seo}`);
  if (a11y != null) parts.push(`Accessibility ${a11y}`);
  return parts.join(" · ");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const report = await getPermalink(id);
  if (!report) {
    return { title: "Report not found" };
  }
  const summary = scoreSummary(report.performanceScore, report.seoScore, report.accessibilityScore);
  return {
    title: `Audit: ${report.url}`,
    description: `${summary} — Next.js-specific fixes for ${report.url}.`,
    openGraph: {
      title: `Audit: ${report.url}`,
      description: summary,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `Audit: ${report.url}`,
      description: summary,
    },
  };
}

export default async function PermalinkPage({ params }: PageProps) {
  const { id } = await params;
  const report = await getPermalink(id);

  if (!report) {
    notFound();
  }

  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: `Nextvital audit — ${report.url}`,
    description: scoreSummary(report.performanceScore, report.seoScore, report.accessibilityScore),
    datePublished: report.cachedAt,
    about: { "@type": "WebPage", url: report.url },
  };

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-10">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text)] mb-3 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Run your own audit
          </Link>
          <h1 className="text-lg font-semibold text-[var(--text)] break-all">{report.url}</h1>
          <p className="text-xs text-[var(--text-2)] mt-1 capitalize">
            {report.strategy} · Captured {new Date(report.cachedAt).toLocaleDateString()}
          </p>
        </div>

        <ResultsView report={report} permalinkId={id} />

        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </main>
  );
}
