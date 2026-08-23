import { describe, it, expect } from "vitest";
import {
  AUDIT_IDS,
  NEXTJS_FIX_MAP,
  getFixesForAudits,
  getPassingChecks,
} from "./nextjs-fixes";
import fastFixture from "./__fixtures__/psi-fast.json";
import slowFixture from "./__fixtures__/psi-slow.json";

const FIXTURES = {
  "psi-fast (nextjs.org)": fastFixture,
  "psi-slow (gsmarena.com)": slowFixture,
};

describe("audit IDs track the Lighthouse release PSI actually runs", () => {
  // This is the test that matters most in this file.
  //
  // Lighthouse 13 replaced the classic opportunity audits with Insight audits:
  // uses-optimized-images → image-delivery-insight, render-blocking-resources →
  // render-blocking-insight, dom-size → dom-size-insight, and so on. When an
  // audit ID disappears, PSI does not error — it just omits the key. The fix
  // silently stops firing and the product quietly loses a feature.
  //
  // Pinning every key against a captured PSI response turns that silent rot
  // into a failing build.
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`every fix-map audit exists in ${name}`, () => {
      const available = new Set(Object.keys(fixture.lighthouseResult.audits));
      const missing = AUDIT_IDS.filter((id) => !available.has(id));
      expect(missing).toEqual([]);
    });
  }

  it("does not reference any audit retired before Lighthouse 13", () => {
    const retired = [
      "uses-optimized-images",
      "uses-text-compression",
      "render-blocking-resources",
      "efficient-animated-content",
      "uses-long-cache-ttl",
      "largest-contentful-paint-element",
      "dom-size",
      "uses-passive-event-listeners",
      "uses-rel-preconnect",
      "font-display",
      "preload-lcp-image",
      "third-party-summary",
    ];
    expect(AUDIT_IDS.filter((id) => retired.includes(id))).toEqual([]);
  });

  it("does not reference structured-data, which Lighthouse never scores", () => {
    // scoreDisplayMode is "manual" — it always comes back unscored, so treating
    // it as a passing check told users their structured data was valid when
    // Lighthouse had not looked at it.
    expect(AUDIT_IDS).not.toContain("structured-data");
  });
});

describe("fix map content", () => {
  it("derives AUDIT_IDS from the map, so the two cannot drift", () => {
    expect(AUDIT_IDS).toEqual(Object.keys(NEXTJS_FIX_MAP));
  });

  it("covers all three categories", () => {
    const categories = new Set(Object.values(NEXTJS_FIX_MAP).map((f) => f.category));
    expect([...categories].sort()).toEqual(["accessibility", "performance", "seo"]);
  });

  for (const [id, fix] of Object.entries(NEXTJS_FIX_MAP)) {
    describe(id, () => {
      it("has non-empty prose in every required field", () => {
        expect(fix.title.length).toBeGreaterThan(0);
        expect(fix.problem.length).toBeGreaterThan(20);
        expect(fix.fix.length).toBeGreaterThan(20);
        expect(fix.passingLabel.length).toBeGreaterThan(0);
      });

      it("has a valid impact and category", () => {
        expect(["high", "medium", "low"]).toContain(fix.impact);
        expect(["performance", "seo", "accessibility"]).toContain(fix.category);
      });

      it("has a parseable docs URL", () => {
        expect(fix.docsUrl).toBeDefined();
        expect(() => new URL(fix.docsUrl!)).not.toThrow();
        expect(fix.docsUrl!.startsWith("https://")).toBe(true);
      });
    });
  }
});

describe("getFixesForAudits", () => {
  it("ignores audit IDs it has no fix for", () => {
    expect(getFixesForAudits(["not-a-real-audit"], {})).toEqual([]);
  });

  it("attaches the audit id, savings, and items", () => {
    const items = [{ url: "https://example.com/a.js", wastedBytes: 1000 }];
    const [fix] = getFixesForAudits(
      ["unused-javascript"],
      { "unused-javascript": 450 },
      { "unused-javascript": items }
    );
    expect(fix.audit).toBe("unused-javascript");
    expect(fix.savingsMs).toBe(450);
    expect(fix.auditItems).toEqual(items);
  });

  it("does not leak passingLabel into the fix payload", () => {
    const [fix] = getFixesForAudits(["unused-javascript"], {});
    expect(fix).not.toHaveProperty("passingLabel");
  });

  it("sorts high impact before medium before low", () => {
    const fixes = getFixesForAudits(
      ["unused-css-rules", "cache-insight", "image-delivery-insight"],
      {}
    );
    expect(fixes.map((f) => f.impact)).toEqual(["high", "medium", "low"]);
  });

  it("breaks impact ties by largest measured saving", () => {
    const fixes = getFixesForAudits(
      ["unused-javascript", "render-blocking-insight", "image-delivery-insight"],
      { "unused-javascript": 100, "render-blocking-insight": 900, "image-delivery-insight": 400 }
    );
    expect(fixes.map((f) => f.audit)).toEqual([
      "render-blocking-insight",
      "image-delivery-insight",
      "unused-javascript",
    ]);
  });

  it("ranks a fix with no savings estimate below one that has them", () => {
    const fixes = getFixesForAudits(
      ["unused-javascript", "image-delivery-insight"],
      { "image-delivery-insight": 300 }
    );
    expect(fixes[0].audit).toBe("image-delivery-insight");
  });
});

describe("getPassingChecks", () => {
  it("returns the passing label for known audits", () => {
    expect(getPassingChecks(["unused-javascript"])).toEqual([
      { audit: "unused-javascript", title: NEXTJS_FIX_MAP["unused-javascript"].passingLabel },
    ]);
  });

  it("ignores unknown audits", () => {
    expect(getPassingChecks(["not-a-real-audit"])).toEqual([]);
  });

  it("has a label available for every audit the app can report", () => {
    expect(getPassingChecks(AUDIT_IDS)).toHaveLength(AUDIT_IDS.length);
  });
});
