"use client";

import Link from "next/link";

interface Props {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function Error({ error, unstable_retry }: Props) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="glass rounded-2xl p-10 text-center max-w-sm w-full shadow-2xl">
        <div className="flex justify-center mb-5">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--poor) 14%, transparent)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--poor)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <circle cx="12" cy="17" r="1" fill="var(--poor)" stroke="none" />
            </svg>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-[var(--text)] mb-2">Something went wrong</h1>
        <p className="text-sm text-[var(--text-2)] mb-8 leading-relaxed">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={unstable_retry}
            className="btn-gradient w-full py-2.5 rounded-xl text-sm font-semibold focus-brand"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-xs text-[var(--text-2)] hover:text-[var(--text)] transition-colors py-1"
          >
            ← Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
