"use client";

interface Props {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function Error({ error, unstable_retry }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-[var(--poor)]">
        {error.message ?? "Something went wrong."}
      </p>
      <button
        onClick={unstable_retry}
        className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
      >
        Try again
      </button>
      <a href="/" className="text-xs text-[var(--text-2)] hover:text-[var(--text)]">
        ← Go home
      </a>
    </div>
  );
}
