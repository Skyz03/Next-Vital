"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGE_META: Record<string, { title: string; sub?: string }> = {
  "/": { title: "Nextvital", sub: "Next.js Performance Analyzer" },
  "/results": { title: "Audit Results", sub: "Powered by PageSpeed Insights" },
  "/dashboard": { title: "Dashboard", sub: "Focus • Plan • Execute • Succeed" },
};

export default function AppTopBar() {
  const pathname = usePathname();

  const isResults =
    pathname.startsWith("/results") || pathname.startsWith("/r/");
  const meta = isResults
    ? PAGE_META["/results"]
    : PAGE_META[pathname] ?? { title: "Nextvital" };

  return (
    <header
      className="glass flex items-center justify-between px-5 shrink-0"
      style={{ height: 56 }}
    >
      {/* Left: page title */}
      <div className="flex items-baseline gap-2">
        <span className="gradient-text text-base font-bold">{meta.title}</span>
        {meta.sub && (
          <span
            className="text-xs hidden sm:inline"
            style={{ color: "var(--text-2)" }}
          >
            {meta.sub}
          </span>
        )}
      </div>

      {/* Right: PSI badge on home, New Audit CTA elsewhere */}
      {pathname === "/" ? (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass text-xs"
          style={{ color: "var(--text-2)" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0"
          />
          PageSpeed Insights API
        </div>
      ) : (
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs transition-colors focus-brand"
          style={{ color: "var(--text-2)" }}
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
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
          New Audit
        </Link>
      )}
    </header>
  );
}
