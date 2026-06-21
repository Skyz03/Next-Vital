"use client";

import { useState } from "react";
import type { AuditItem, NextjsFix } from "@/types/analysis";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function shortenUrl(url: string): string {
  try {
    const { pathname, search } = new URL(url);
    const full = pathname + search;
    return full.length > 60 ? `…${full.slice(-58)}` : full;
  } catch {
    return url.length > 60 ? `…${url.slice(-58)}` : url;
  }
}

function AuditItems({ items }: { items: AuditItem[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-2">
        Flagged on your site
      </p>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2"
          >
            <span className="font-mono text-[var(--text)] truncate flex-1 min-w-0">
              {item.url ? shortenUrl(item.url) : item.label}
            </span>
            {item.wastedBytes != null && item.wastedBytes > 0 && (
              <span className="text-[var(--poor)] shrink-0 font-medium tabular-nums">
                {formatBytes(item.wastedBytes)} wasted
              </span>
            )}
            {item.wastedMs != null && item.wastedMs > 0 && (
              <span className="text-[var(--poor)] shrink-0 font-medium tabular-nums">
                {item.wastedMs} ms
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  fix: NextjsFix;
  index: number;
}

const IMPACT_COLORS = {
  high:   { bg: "bg-rating-poor",  text: "rating-poor",  label: "High impact" },
  medium: { bg: "bg-rating-needs", text: "rating-needs", label: "Medium impact" },
  low:    { bg: "bg-rating-good",  text: "rating-good",  label: "Low impact" },
};

export default function FixCard({ fix, index }: Props) {
  const [open, setOpen] = useState(index === 0);
  const impact = IMPACT_COLORS[fix.impact];

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--surface-2)] transition-colors"
        aria-expanded={open}
      >
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${impact.bg} ${impact.text}`}>
          {impact.label}
        </span>
        <span className="flex-1 text-sm font-medium text-[var(--text)]">{fix.title}</span>
        {fix.savingsMs && (
          <span className="text-xs text-[var(--text-2)] whitespace-nowrap">
            ~{(fix.savingsMs / 1000).toFixed(1)}s saved
          </span>
        )}
        <span className="text-[var(--text-2)] text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--border)] pt-4">
          {fix.auditItems && fix.auditItems.length > 0 && (
            <AuditItems items={fix.auditItems} />
          )}
          <div>
            <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-1">Problem</p>
            <p className="text-sm text-[var(--text)] leading-relaxed">{fix.problem}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-1">Fix</p>
            <p className="text-sm text-[var(--text)] leading-relaxed">{fix.fix}</p>
          </div>
          {fix.codeExample && (
            <pre className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 overflow-x-auto font-mono leading-relaxed text-[var(--text)]">
              {fix.codeExample}
            </pre>
          )}
          {fix.docsUrl && (
            <a
              href={fix.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline"
            >
              Next.js docs →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
