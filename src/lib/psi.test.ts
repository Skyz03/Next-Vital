import { describe, it, expect } from "vitest";
import { shapePSIResponse } from "./psi";
import { AUDIT_IDS } from "./nextjs-fixes";
import fastFixture from "./__fixtures__/psi-fast.json";
import slowFixture from "./__fixtures__/psi-slow.json";

type Raw = Record<string, unknown>;

function shapeFast() {
  return shapePSIResponse(structuredClone(fastFixture) as Raw, "https://nextjs.org", "mobile", 1234);
}

function shapeSlow() {
  return shapePSIResponse(structuredClone(slowFixture) as Raw, "https://gsmarena.com", "mobile", 900);
}

/** Minimal PSI response with a single audit, for testing one behavior in isolation. */
function syntheticRaw(auditId: string, audit: Record<string, unknown>, extra: Raw = {}): Raw {
  return {
    lighthouseResult: {
      lighthouseVersion: "13.4.1",
      categories: { performance: { score: 0.5 } },
      audits: { [auditId]: { id: auditId, ...audit } },
    },
    ...extra,
  };
}

describe("category scores", () => {
  it("converts the 0-1 category scores to 0-100", () => {
    const r = shapeFast();
    expect(r.performanceScore).toBe(86);
    expect(r.seoScore).toBe(100);
    expect(r.accessibilityScore).toBe(100);
  });

  it("reads a poorly performing site correctly", () => {
    const r = shapeSlow();
    expect(r.performanceScore).toBe(51);
    expect(r.seoScore).toBe(92);
    expect(r.accessibilityScore).toBe(68);
  });

  it("leaves optional categories undefined rather than zero when absent", () => {
    const raw = syntheticRaw("unused-javascript", { score: 1 });
    const r = shapePSIResponse(raw, "https://example.com", "mobile", 0);
    // A score of 0 would render as a red "0" ring — undefined hides it instead.
    expect(r.seoScore).toBeUndefined();
    expect(r.accessibilityScore).toBeUndefined();
  });

  it("passes through metadata", () => {
    const r = shapeFast();
    expect(r.url).toBe("https://nextjs.org");
    expect(r.strategy).toBe("mobile");
    expect(r.fetchTimeMs).toBe(1234);
    expect(r.lighthouseVersion).toBe("13.4.1");
    expect(r.fromCache).toBe(false);
    expect(() => new Date(r.cachedAt).toISOString()).not.toThrow();
  });
});

describe("core metrics", () => {
  it("returns all six metrics in a stable order", () => {
    expect(shapeFast().metrics.map((m) => m.id)).toEqual(["lcp", "cls", "inp", "fcp", "ttfb", "tbt"]);
  });

  it("rates a lab metric from its Lighthouse score", () => {
    const lcp = shapeSlow().metrics.find((m) => m.id === "lcp")!;
    expect(lcp.source).toBe("lab");
    expect(lcp.hasData).toBe(true);
    expect(lcp.rating).toBe("poor");
    expect(lcp.value).toBeGreaterThan(0);
  });

  it("formats TTFB from its numeric value, not Lighthouse's sentence", () => {
    // server-response-time's displayValue is "Root document took 290 ms" —
    // rendered as a headline number that reads as broken.
    expect(fastFixture.lighthouseResult.audits["server-response-time"].displayValue).toMatch(
      /^Root document took/
    );
    const ttfb = shapeFast().metrics.find((m) => m.id === "ttfb")!;
    expect(ttfb.displayValue).toBe("293 ms");
    expect(ttfb.value).toBe(293);
  });

  it("formats a TTFB over a second in seconds", () => {
    const raw = syntheticRaw("server-response-time", {
      score: 0,
      scoreDisplayMode: "metricSavings",
      numericValue: 1480,
      displayValue: "Root document took 1,480 ms",
    });
    const ttfb = shapePSIResponse(raw, "https://example.com", "mobile", 0).metrics.find(
      (m) => m.id === "ttfb"
    )!;
    expect(ttfb.displayValue).toBe("1.5 s");
  });

  it("marks a metric as having no data when the audit is absent", () => {
    const raw = syntheticRaw("unused-javascript", { score: 1 });
    const cls = shapePSIResponse(raw, "https://example.com", "mobile", 0).metrics.find(
      (m) => m.id === "cls"
    )!;
    expect(cls.hasData).toBe(false);
    expect(cls.source).toBeUndefined();
    expect(cls.displayValue).toBe("—");
  });
});

describe("INP falls back to CrUX field data", () => {
  // Lighthouse cannot produce an INP score from a lab run — there are no real
  // interactions to measure — so it is absent from the audits entirely. PSI
  // does return CrUX field data for sites with enough traffic.
  it("uses the CrUX percentile when there is no lab score", () => {
    const inp = shapeFast().metrics.find((m) => m.id === "inp")!;
    expect(inp.hasData).toBe(true);
    expect(inp.source).toBe("field");
    expect(inp.value).toBe(125);
    expect(inp.displayValue).toBe("125 ms");
    expect(inp.rating).toBe("good");
  });

  it("maps CrUX categories onto ratings", () => {
    const cases = [
      ["FAST", "good"],
      ["AVERAGE", "needs-improvement"],
      ["SLOW", "poor"],
    ] as const;

    for (const [category, expected] of cases) {
      const raw = syntheticRaw(
        "unused-javascript",
        { score: 1 },
        {
          loadingExperience: {
            metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 300, category } },
          },
        }
      );
      const inp = shapePSIResponse(raw, "https://example.com", "mobile", 0).metrics.find(
        (m) => m.id === "inp"
      )!;
      expect(inp.rating).toBe(expected);
      expect(inp.source).toBe("field");
    }
  });

  it("reports no data when neither lab nor field data exists", () => {
    const noField = structuredClone(fastFixture) as Raw;
    delete noField.loadingExperience;
    const inp = shapePSIResponse(noField, "https://nextjs.org", "mobile", 0).metrics.find(
      (m) => m.id === "inp"
    )!;
    expect(inp.hasData).toBe(false);
    expect(inp.source).toBeUndefined();
  });
});

describe("audit triage", () => {
  it("only ever reports audits the fix map understands", () => {
    for (const r of [shapeFast(), shapeSlow()]) {
      for (const id of [...r.failedAuditIds, ...r.passingAuditIds]) {
        expect(AUDIT_IDS).toContain(id);
      }
    }
  });

  it("never puts the same audit in both buckets", () => {
    for (const r of [shapeFast(), shapeSlow()]) {
      const overlap = r.failedAuditIds.filter((id) => r.passingAuditIds.includes(id));
      expect(overlap).toEqual([]);
    }
  });

  it("finds more to fix on the slow site than the fast one", () => {
    expect(shapeSlow().failedAuditIds.length).toBeGreaterThan(shapeFast().failedAuditIds.length);
  });

  it("flags audits scoring below 0.9", () => {
    const failed = shapeSlow().failedAuditIds;
    expect(failed).toContain("image-delivery-insight");
    expect(failed).toContain("render-blocking-insight");
    expect(failed).toContain("color-contrast");
  });

  it("credits audits scoring at or above 0.9", () => {
    expect(shapeFast().passingAuditIds).toContain("image-alt");
    expect(shapeFast().passingAuditIds).toContain("document-title");
  });

  it("uses 0.9 as the boundary", () => {
    const at = shapePSIResponse(
      syntheticRaw("unused-javascript", { score: 0.9, scoreDisplayMode: "numeric" }),
      "https://example.com",
      "mobile",
      0
    );
    expect(at.passingAuditIds).toContain("unused-javascript");

    const below = shapePSIResponse(
      syntheticRaw("unused-javascript", { score: 0.89, scoreDisplayMode: "numeric" }),
      "https://example.com",
      "mobile",
      0
    );
    expect(below.failedAuditIds).toContain("unused-javascript");
  });
});

describe("audits Lighthouse did not evaluate", () => {
  // notApplicable and manual audits say nothing about the page. Counting them
  // as passing told users a check had succeeded when it had never run.
  it("ignores a notApplicable audit entirely", () => {
    const r = shapeFast();
    // lcp-discovery-insight is notApplicable on nextjs.org — its LCP is text
    expect(fastFixture.lighthouseResult.audits["lcp-discovery-insight"].scoreDisplayMode).toBe(
      "notApplicable"
    );
    expect(r.failedAuditIds).not.toContain("lcp-discovery-insight");
    expect(r.passingAuditIds).not.toContain("lcp-discovery-insight");
  });

  it("ignores a notApplicable audit on the slow fixture too", () => {
    const r = shapeSlow();
    expect(r.failedAuditIds).not.toContain("button-name");
    expect(r.passingAuditIds).not.toContain("button-name");
  });

  for (const mode of ["notApplicable", "manual", "error"]) {
    it(`ignores scoreDisplayMode "${mode}"`, () => {
      const r = shapePSIResponse(
        syntheticRaw("unused-javascript", { score: null, scoreDisplayMode: mode }),
        "https://example.com",
        "mobile",
        0
      );
      expect(r.failedAuditIds).not.toContain("unused-javascript");
      expect(r.passingAuditIds).not.toContain("unused-javascript");
    });
  }
});

describe("informative audits", () => {
  // These carry no pass/fail score. Surfacing them only when Lighthouse
  // attaches an estimated saving keeps them from firing on every single site.
  it("flags an informative audit that comes with a saving", () => {
    const r = shapeSlow();
    expect(r.failedAuditIds).toContain("long-tasks");
    expect(r.savingsMap["long-tasks"]).toBe(450);
  });

  it("ignores an informative audit with no saving", () => {
    const r = shapeSlow();
    // third-parties-insight always has items; without a saving estimate it is
    // just a description of the page, not a problem to fix.
    expect(r.failedAuditIds).not.toContain("third-parties-insight");
  });

  it("never credits an informative audit as passing", () => {
    for (const r of [shapeFast(), shapeSlow()]) {
      expect(r.passingAuditIds).not.toContain("third-parties-insight");
      expect(r.passingAuditIds).not.toContain("long-tasks");
    }
  });

  it("ignores a CLS-only saving, which is not measured in milliseconds", () => {
    // cls-culprits-insight reports metricSavings {"CLS": n} — a unitless score,
    // not a duration, so it must not be presented as "n ms saved".
    expect(shapeSlow().failedAuditIds).not.toContain("cls-culprits-insight");
  });
});

describe("savings estimates", () => {
  it("prefers metricSavings over the legacy overallSavingsMs", () => {
    const r = shapePSIResponse(
      syntheticRaw("unused-javascript", {
        score: 0,
        scoreDisplayMode: "metricSavings",
        metricSavings: { LCP: 500, FCP: 0 },
        details: { type: "opportunity", overallSavingsMs: 100 },
      }),
      "https://example.com",
      "mobile",
      0
    );
    expect(r.savingsMap["unused-javascript"]).toBe(500);
  });

  it("takes the largest time-denominated metric saving", () => {
    const r = shapePSIResponse(
      syntheticRaw("unused-javascript", {
        score: 0,
        scoreDisplayMode: "metricSavings",
        metricSavings: { LCP: 120, FCP: 300, TBT: 80 },
      }),
      "https://example.com",
      "mobile",
      0
    );
    expect(r.savingsMap["unused-javascript"]).toBe(300);
  });

  it("falls back to overallSavingsMs when metricSavings has no useful value", () => {
    const r = shapePSIResponse(
      syntheticRaw("unused-javascript", {
        score: 0,
        scoreDisplayMode: "metricSavings",
        metricSavings: { LCP: 0, FCP: 0 },
        details: { type: "opportunity", overallSavingsMs: 275 },
      }),
      "https://example.com",
      "mobile",
      0
    );
    expect(r.savingsMap["unused-javascript"]).toBe(275);
  });

  it("omits the audit from savingsMap when there is no estimate at all", () => {
    const r = shapePSIResponse(
      syntheticRaw("unused-javascript", { score: 0, scoreDisplayMode: "numeric" }),
      "https://example.com",
      "mobile",
      0
    );
    expect(r.savingsMap).not.toHaveProperty("unused-javascript");
  });

  it("only records savings for audits that failed", () => {
    const r = shapeFast();
    for (const id of Object.keys(r.savingsMap)) {
      expect(r.failedAuditIds).toContain(id);
    }
  });
});

describe("flagged resources", () => {
  it("caps each audit at five items", () => {
    const r = shapeSlow();
    for (const items of Object.values(r.auditItemsMap)) {
      expect(items.length).toBeLessThanOrEqual(5);
    }
    // The fixture keeps 6 items for several audits, so the cap is exercised
    expect(slowFixture.lighthouseResult.audits["unused-javascript"].details.items.length).toBe(6);
    expect(r.auditItemsMap["unused-javascript"]).toHaveLength(5);
  });

  it("extracts the fields the UI renders", () => {
    const item = shapeSlow().auditItemsMap["unused-javascript"][0];
    expect(item.url).toMatch(/^https?:\/\//);
    expect(typeof item.wastedBytes).toBe("number");
    expect(typeof item.totalBytes).toBe("number");
  });

  it("falls back to a node label when an item has no URL", () => {
    const r = shapePSIResponse(
      syntheticRaw("unused-javascript", {
        score: 0,
        scoreDisplayMode: "numeric",
        details: { type: "table", items: [{ node: { nodeLabel: "Hero banner", type: "node" } }] },
      }),
      "https://example.com",
      "mobile",
      0
    );
    expect(r.auditItemsMap["unused-javascript"][0].label).toBe("Hero banner");
  });

  it("drops items with nothing to identify them by", () => {
    const r = shapePSIResponse(
      syntheticRaw("unused-javascript", {
        score: 0,
        scoreDisplayMode: "numeric",
        details: { type: "table", items: [{ wastedBytes: 100 }, { wastedBytes: 200 }] },
      }),
      "https://example.com",
      "mobile",
      0
    );
    expect(r.auditItemsMap).not.toHaveProperty("unused-javascript");
  });

  it("handles a checklist audit whose items are an object, not an array", () => {
    // document-latency-insight reports details.items as a keyed object.
    // Array-shaped extraction must not throw or produce garbage.
    const r = shapePSIResponse(
      syntheticRaw("document-latency-insight", {
        score: 0,
        scoreDisplayMode: "metricSavings",
        details: {
          type: "checklist",
          items: { usesCompression: { label: "Applies text compression", value: false } },
        },
      }),
      "https://example.com",
      "mobile",
      0
    );
    expect(r.failedAuditIds).toContain("document-latency-insight");
    expect(r.auditItemsMap).not.toHaveProperty("document-latency-insight");
  });

  it("only records items for audits that failed", () => {
    const r = shapeSlow();
    for (const id of Object.keys(r.auditItemsMap)) {
      expect(r.failedAuditIds).toContain(id);
    }
  });
});
