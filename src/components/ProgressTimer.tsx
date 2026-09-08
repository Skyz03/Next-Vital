"use client";

import { useEffect, useState } from "react";

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getStatusCopy(sec: number): string {
  if (sec < 8) return "Contacting PageSpeed Insights…";
  if (sec < 22) return "Google is running Lighthouse on your page…";
  if (sec < 40) return "Mapping audits to Next.js fixes…";
  return "Still going — complex pages can take a minute.";
}

export default function ProgressTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass rounded-xl px-4 py-3">
      <p className="text-sm text-[var(--text-2)]">
        <span className="font-mono tabular-nums text-[var(--text)]">{formatElapsed(elapsed)}</span>
        {" · "}
        {getStatusCopy(elapsed)}
      </p>
    </div>
  );
}
