import type { AnalysisResult, AuditItem, CoreMetric, NextjsFix } from "@/types/analysis";
import type { ChatMessage } from "@/types/ai";

export const PLAN_USER_TURN =
  "Using only the audit data above, give me a prioritised action plan for this site.\n\n" +
  "Follow these rules exactly:\n" +
  "1. Rank items by impact-to-effort ratio, not raw impact alone. A 200 ms gain from a two-line change beats a 300 ms gain from a multi-week refactor.\n" +
  "2. If several failing audits share a root cause (e.g. all image audits, all unused-JS audits, all render-blocking resources), collapse them into one item and name the shared cause.\n" +
  "3. Format each item as a level-2 heading using this exact pattern:\n" +
  "   ## N. Title · Effort · Metric moved\n" +
  "   where Effort is exactly one of: Quick (under an hour) | Medium (half a day) | Large (multi-day)\n" +
  "   and 'Metric moved' is the Core Web Vital this primarily affects with an estimated delta, e.g. LCP −1.4 s, TBT −800 ms, Perf +8.\n" +
  "4. Under each heading: one sentence explaining WHY, grounded in the audit data, then bullet the specific Next.js APIs to use.\n" +
  "5. For the top item only, include a short runnable Next.js code snippet.\n" +
  "6. Cover at most five items.\n" +
  "7. End with a ## Follow-ups section containing exactly three bullet-point questions the developer is most likely to ask next about this site.";

/**
 * Every provider here requires a conversation to open on a user turn. The
 * client sends the action plan as the opening assistant message so follow-ups
 * can refer to it, so restore the request that produced that plan and keep the
 * exchange truthful.
 */
export function openOnUserTurn(messages: ChatMessage[]): ChatMessage[] {
  if (messages[0]?.role !== "assistant") return messages;
  return [{ role: "user", content: PLAN_USER_TURN }, ...messages];
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function metricLine(m: CoreMetric): string {
  // hasData:false is common for INP, which Lighthouse cannot measure in a lab
  // run. Saying so explicitly stops the model inventing a value for it.
  if (!m.hasData) return `- ${m.label}: not measured in this run`;
  const source = m.source === "field" ? " (real-user field data)" : "";
  return `- ${m.label}: ${m.displayValue} — rated ${m.rating}${source}`;
}

function itemLine(item: AuditItem): string {
  const name = item.url ?? item.label ?? "unknown resource";
  const parts: string[] = [];
  if (item.wastedBytes != null && item.wastedBytes > 0) {
    parts.push(
      item.totalBytes != null && item.totalBytes > 0
        ? `${formatBytes(item.wastedBytes)} wasted of ${formatBytes(item.totalBytes)}`
        : `${formatBytes(item.wastedBytes)} wasted`
    );
  }
  if (item.wastedMs != null && item.wastedMs > 0) parts.push(`${item.wastedMs} ms`);
  return parts.length > 0 ? `  - ${name} — ${parts.join(", ")}` : `  - ${name}`;
}

function fixBlock(fix: NextjsFix): string {
  // Lighthouse reports an explicit 0 for some audits. Surfacing "est. saving
  // 0 ms" invites the model to write off a real problem, so treat it as absent
  // — the same call FixCard makes when deciding whether to show the badge.
  const saving =
    fix.savingsMs != null && fix.savingsMs > 0 ? `, est. saving ${fix.savingsMs} ms` : "";
  const lines = [`- [${fix.category}] ${fix.audit} — ${fix.title} (${fix.impact} impact${saving})`];
  // Three items is enough to make the advice concrete without ballooning the
  // prompt on an audit that flagged forty resources.
  if (fix.auditItems && fix.auditItems.length > 0) {
    lines.push(...fix.auditItems.slice(0, 3).map(itemLine));
    const remaining = fix.auditItems.length - 3;
    if (remaining > 0) lines.push(`  (…${remaining} more)`);
  }
  return lines.join("\n");
}

function digest(result: AnalysisResult): string {
  const scores = [
    `Performance ${result.performanceScore}/100`,
    result.seoScore != null ? `SEO ${result.seoScore}/100` : null,
    result.accessibilityScore != null ? `Accessibility ${result.accessibilityScore}/100` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const sections = [
    `Site: ${result.url}`,
    `Device: ${result.strategy}`,
    `Scores: ${scores}`,
    "",
    "## Core metrics",
    result.metrics.map(metricLine).join("\n"),
    "",
    `## Failing audits (${result.fixes.length})`,
    result.fixes.length > 0
      ? result.fixes.map(fixBlock).join("\n")
      : "None — every audit we check passed.",
  ];

  if (result.passingChecks && result.passingChecks.length > 0) {
    sections.push(
      "",
      `## Already passing (${result.passingChecks.length})`,
      result.passingChecks.map((c) => `- ${c.title}`).join("\n")
    );
  }

  return sections.join("\n");
}

export function buildSystemPrompt(result: AnalysisResult): string {
  return `You are a senior Next.js performance engineer reviewing a PageSpeed Insights audit for a developer. You know the App Router well: Server Components, streaming, ISR and \`revalidate\`, \`next/image\`, \`next/font\`, \`next/dynamic\`, route segment config, and the caching model.

Rules:
- Ground every claim in the audit data below. If a number is not there, do not state a number.
- Never invent a metric, a saving, or a file that is not listed. Say what the data does not tell you.
- When you cite a saving, use the estimate given for that audit.
- The developer has already been shown generic per-audit advice. Your value is sequencing and specificity: what to do first for THIS site, why, and what it should move.
- If several failing audits share a root cause (e.g. all image-related audits, all unused-JS audits, all render-blocking resource audits), name the shared cause and treat them as one recommendation.
- For the single highest impact-to-effort item, include a short, runnable Next.js code snippet. For other items, add a snippet only when the API is non-obvious.
- Prefer concrete Next.js APIs over general web advice.
- Be concise. No preamble, no restating the scores back.

Format your answer as markdown using only: \`##\` headings, \`-\` bullets, \`**bold**\`, inline \`code\`, and fenced code blocks. No tables, no numbered lists, no nested bullets.

# Audit data

${digest(result)}`;
}
