import { describe, it, expect } from "vitest";
import { buildSystemPrompt, PLAN_USER_TURN } from "./prompt";
import type { AnalysisResult } from "@/types/analysis";

const RESULT: AnalysisResult = {
  url: "https://example.com/",
  strategy: "mobile",
  performanceScore: 62,
  seoScore: 91,
  accessibilityScore: 88,
  metrics: [
    {
      id: "lcp",
      label: "LCP",
      value: 4200,
      displayValue: "4.2 s",
      score: 20,
      rating: "poor",
      hasData: true,
      source: "lab",
      description: "d",
    },
    {
      id: "inp",
      label: "INP",
      value: 0,
      displayValue: "—",
      score: 0,
      rating: "good",
      hasData: false,
      description: "d",
    },
    {
      id: "cls",
      label: "CLS",
      value: 120,
      displayValue: "120 ms",
      score: 90,
      rating: "good",
      hasData: true,
      source: "field",
      description: "d",
    },
  ],
  fixes: [
    {
      audit: "unused-javascript",
      title: "Code-split large imports with dynamic()",
      impact: "high",
      category: "performance",
      savingsMs: 1240,
      problem: "p",
      fix: "f",
      auditItems: [
        { url: "https://example.com/vendor.js", wastedBytes: 348160, totalBytes: 911360 },
        { url: "https://example.com/a.js", wastedMs: 90 },
        { label: "third", wastedBytes: 2048 },
        { label: "fourth", wastedBytes: 1024 },
      ],
    },
    {
      audit: "image-alt",
      title: "Add alt text",
      impact: "medium",
      category: "accessibility",
      problem: "p",
      fix: "f",
    },
  ],
  passingChecks: [{ audit: "document-title", title: "Has a document title" }],
  cachedAt: "2026-08-24T00:00:00.000Z",
  fromCache: false,
  lighthouseVersion: "13.4.1",
  fetchTimeMs: 5000,
};

const prompt = buildSystemPrompt(RESULT);

describe("buildSystemPrompt", () => {
  it("includes the site, device and every score", () => {
    expect(prompt).toContain("https://example.com/");
    expect(prompt).toContain("mobile");
    expect(prompt).toContain("Performance 62/100");
    expect(prompt).toContain("SEO 91/100");
    expect(prompt).toContain("Accessibility 88/100");
  });

  it("marks an unmeasured metric as such rather than reporting a value", () => {
    // hasData:false is routine for INP. Leaving it to look like a real reading
    // is how a model ends up inventing a number for it.
    expect(prompt).toContain("INP: not measured in this run");
    expect(prompt).not.toContain("INP: —");
  });

  it("labels field data so lab and real-user numbers are distinguishable", () => {
    expect(prompt).toContain("CLS: 120 ms — rated good (real-user field data)");
  });

  it("carries the audit id, impact and estimated saving for each fix", () => {
    expect(prompt).toContain("unused-javascript");
    expect(prompt).toContain("high impact, est. saving 1240 ms");
  });

  it("omits the saving clause when there is no estimate", () => {
    expect(prompt).toContain("image-alt — Add alt text (medium impact)");
  });

  it("treats a zero-millisecond estimate as absent", () => {
    // Lighthouse reports an explicit 0 on some audits. "est. saving 0 ms"
    // reads as "not worth doing" and would skew the plan.
    const zero = buildSystemPrompt({
      ...RESULT,
      fixes: [{ ...RESULT.fixes[0], savingsMs: 0 }],
    });
    expect(zero).not.toContain("est. saving 0 ms");
    expect(zero).toContain("(high impact)");
  });

  it("includes the flagged resources with their wasted bytes", () => {
    expect(prompt).toContain("https://example.com/vendor.js — 340 KB wasted of 890 KB");
    expect(prompt).toContain("https://example.com/a.js — 90 ms");
  });

  it("caps flagged resources at three per audit", () => {
    // An audit can flag dozens of resources; the prompt should not balloon.
    expect(prompt).toContain("third");
    expect(prompt).not.toContain("fourth");
  });

  it("appends a '…N more' note when items are truncated", () => {
    // The RESULT fixture has 4 auditItems; only 3 shown, so 1 more is noted.
    expect(prompt).toContain("(…1 more)");
  });

  it("instructs the model to group audits sharing a root cause", () => {
    expect(prompt).toContain("root cause");
  });

  it("lists the passing checks", () => {
    expect(prompt).toContain("Has a document title");
  });

  it("instructs the model not to invent data", () => {
    expect(prompt).toContain("Never invent a metric");
  });

  it("is deterministic, so the cached prefix stays byte-identical across turns", () => {
    expect(buildSystemPrompt(RESULT)).toBe(prompt);
  });

  it("handles a clean report without throwing", () => {
    const clean = buildSystemPrompt({
      ...RESULT,
      seoScore: undefined,
      accessibilityScore: undefined,
      fixes: [],
      passingChecks: [],
    });
    expect(clean).toContain("None — every audit we check passed.");
    expect(clean).not.toContain("SEO");
  });
});

describe("PLAN_USER_TURN", () => {
  it("scopes the model to the supplied data", () => {
    expect(PLAN_USER_TURN).toContain("Using only the audit data above");
  });

  it("includes all three effort labels", () => {
    expect(PLAN_USER_TURN).toContain("Quick");
    expect(PLAN_USER_TURN).toContain("Medium");
    expect(PLAN_USER_TURN).toContain("Large");
  });

  it("asks for audit grouping by root cause", () => {
    expect(PLAN_USER_TURN).toContain("root cause");
  });

  it("requests a Follow-ups section", () => {
    expect(PLAN_USER_TURN).toContain("Follow-ups");
  });
});
