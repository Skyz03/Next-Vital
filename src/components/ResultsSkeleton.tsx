export default function ResultsSkeleton() {
  return (
    <div className="space-y-10">
      {/* Score rings row */}
      <div className="glass rounded-2xl py-8 px-6 flex gap-8 justify-center">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="rounded-full shimmer" style={{ width: 96, height: 96 }} />
            <div className="h-3 w-16 rounded shimmer" />
          </div>
        ))}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="glass rounded-xl p-4 space-y-2 shimmer" style={{ minHeight: 120 }}>
            <div className="h-3 w-3/4 rounded bg-[var(--border)]" />
            <div className="h-7 w-1/2 rounded bg-[var(--border)]" />
            <div className="h-3 w-full rounded bg-[var(--border)]" />
          </div>
        ))}
      </div>

      {/* Fix card rows */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass rounded-xl shimmer" style={{ height: 72 }} />
      ))}
    </div>
  );
}
