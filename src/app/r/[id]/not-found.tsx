import Link from "next/link";

export default function PermalinkNotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="glass rounded-2xl p-10 text-center max-w-sm w-full shadow-2xl">
        <p className="text-xs font-semibold tracking-widest uppercase text-[var(--text-2)] mb-4">
          Report expired
        </p>
        <h1 className="text-2xl font-bold tracking-tight mb-3">
          <span className="gradient-text">Link no longer available</span>
        </h1>
        <p className="text-sm text-[var(--text-2)] leading-relaxed mb-8">
          Shared reports expire after 30 days. Run a new audit to generate a fresh link.
        </p>
        <Link
          href="/"
          className="btn-gradient inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold focus-brand"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v20M2 12h20" />
          </svg>
          Run a new audit
        </Link>
      </div>
    </main>
  );
}
