"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, strategy }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Something went wrong.");
        return;
      }

      // Store result in sessionStorage and navigate to results page
      sessionStorage.setItem("nextvital_result", JSON.stringify(data));
      const encoded = encodeURIComponent(url);
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
          <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] mb-3">
            Next<span style={{ color: "var(--brand)" }}>vital</span>
          </h1>
          <p className="text-[var(--text-2)] text-base leading-relaxed">
            Paste your Next.js app URL.<br />
            Get fixes written for Next.js — not generic Lighthouse advice.
          </p>
        </div>

        {/* Form */}
        <div onSubmit={handleSubmit} className="space-y-4">
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--brand)] bg-[var(--surface)]">
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

          <div className="flex gap-2">
            {(["mobile", "desktop"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStrategy(s)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  strategy === s
                    ? "border-[var(--brand)] text-[var(--brand)] bg-[var(--surface-2)]"
                    : "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--text-2)]"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !url.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--brand)" }}
          >
            {loading ? "Running audit…" : "Analyze"}
          </button>

          {error && (
            <p className="text-sm text-[var(--poor)] text-center">{error}</p>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[var(--text-2)] mt-8">
          Powered by PageSpeed Insights · 5 audits/hour per IP · Results cached 24h
        </p>
      </div>
    </main>
  );
}
