"use client";
import { useEffect } from "react";
import type { Strategy } from "@/types/analysis";
import type { FixSummary } from "@/lib/history";

interface Props {
  url: string;
  strategy: Strategy;
  performanceScore: number;
  seoScore?: number;
  accessibilityScore?: number;
  cachedAt: string;
  topFixes: FixSummary[];
}

export default function HistorySaver(props: Props) {
  useEffect(() => {
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(props),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.url, props.strategy]);

  return null;
}
