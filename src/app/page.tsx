"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeUrl, isBlockedUrl } from "@/lib/validate";

export default function Home() {
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const raw = url.trim();
    if (!raw) {
      setError("Enter a URL to analyze.");
      return;
    }

    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const normalized = normalizeUrl(withScheme);

    if (isBlockedUrl(normalized)) {
      setError("That URL isn't allowed — localhost, private ranges, and internal hostnames can't be analyzed.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized, strategy }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Something went wrong.");
        return;
      }

      const encoded = encodeURIComponent(normalized);
      router.push(`/results?url=${encoded}&strategy=${strategy}`);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-20">
      <div className="w-full max-w-xl">
        {/* Wordmark */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-1.5 mb-6 px-3 py-1 rounded-full glass text-xs text-[var(--text-2)] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Powered by PageSpeed Insights API
          </div>

          <h1 className="text-5xl font-bold tracking-tight mb-4">
            <span className="text-[var(--text)]">Next</span>
            <span className="gradient-text">vital</span>
          </h1>

          <p className="text-[var(--text-2)] text-base leading-relaxed max-w-sm mx-auto">
            Paste your Next.js app URL.<br />
            Get fixes written for Next.js —{" "}
            <span className="text-[var(--text)]">not generic Lighthouse advice.</span>
          </p>
        </div>

        {/* Form card */}
        <div className="glass rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex rounded-xl border border-[var(--border-2)] overflow-hidden bg-[var(--surface)] transition-all duration-200 focus-within:border-[var(--brand-from)] focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.2)]">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-nextjs-app.vercel.app"
                className="flex-1 px-4 py-3 text-sm bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-2)]"
                disabled={loading}
                aria-label="URL to analyze"
              />
            </div>

            {/* Strategy toggle — segmented pill control */}
            <div className="flex p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
              {(["mobile", "desktop"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    strategy === s
                      ? "bg-[var(--surface)] text-[var(--text)] shadow-sm border border-[var(--border-2)]"
                      : "text-[var(--text-2)] hover:text-[var(--text)]"
                  }`}
                >
                  {s === "mobile" ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="5" y="2" width="14" height="20" rx="2" />
                        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
                      </svg>
                      Mobile
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <svg width="14" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <path d="M8 21h8M12 17v4" />
                      </svg>
                      Desktop
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="btn-gradient w-full py-3 rounded-xl text-sm font-semibold focus-brand"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Running audit…
                </span>
              ) : "Analyze"}
            </button>

            {error && (
              <p className="text-sm text-[var(--poor)] text-center">{error}</p>
            )}
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[var(--text-2)] mt-8 opacity-60">
          PageSpeed Insights · 5 audits/hour per IP · Results cached 24h
        </p>
      </div>
    </main>
  );
}
