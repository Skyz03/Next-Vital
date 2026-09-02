export default function ResultsSkeleton() {
  return (
    <div className="space-y-10">
      {/* Score rings row */}
      <div className="flex gap-6 justify-center">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className="rounded-full bg-[var(--surface-2)] animate-pulse"
              style={{ width: 88, height: 88 }}
            />
            <div className="h-3 w-16 rounded bg-[var(--surface-2)] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] animate-pulse p-4 space-y-2"
            style={{ minHeight: 120 }}
          >
            <div className="h-3 w-3/4 rounded bg-[var(--border)]" />
            <div className="h-7 w-1/2 rounded bg-[var(--border)]" />
            <div className="h-3 w-full rounded bg-[var(--border)]" />
          </div>
        ))}
      </div>

      {/* Fix card rows */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] animate-pulse"
          style={{ height: 72 }}
        />
      ))}
    </div>
  );
}
