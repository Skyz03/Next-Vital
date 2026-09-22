import type { Strategy } from "@/types/analysis";

export interface FixSummary {
  audit: string;
  title: string;
  impact: "high" | "medium" | "low";
  category: "performance" | "seo" | "accessibility";
}

export interface HistoryEntry {
  url: string;
  strategy: Strategy;
  performanceScore: number;
  seoScore?: number;
  accessibilityScore?: number;
  cachedAt: string;
  savedAt: number;
  topFixes: FixSummary[];
}

const CHECKLIST_KEY = "nextvital:checked";

export function getCheckedFixes(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveCheckedFixes(checked: Set<string>): void {
  try {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify([...checked]));
  } catch {}
}
