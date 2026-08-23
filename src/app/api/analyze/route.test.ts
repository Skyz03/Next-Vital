import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/cache", () => ({
  cacheKey: vi.fn((url: string, strategy: string) => `analysis:${strategy}:${url}`),
  getCached: vi.fn(),
  setCached: vi.fn(),
  checkRateLimit: vi.fn(),
  checkDailyCap: vi.fn(),
  acquireInflightLock: vi.fn(),
  releaseInflightLock: vi.fn(),
}));

vi.mock("@/lib/psi", () => ({
  runPSI: vi.fn(),
  shapePSIResponse: vi.fn(),
}));

const cache = await import("@/lib/cache");
const psi = await import("@/lib/psi");
const { POST } = await import("./route");

const SHAPED = {
  url: "https://example.com/",
  strategy: "mobile" as const,
  performanceScore: 80,
  seoScore: 90,
  accessibilityScore: 95,
  metrics: [],
  failedAuditIds: ["unused-javascript"],
  passingAuditIds: ["image-alt"],
  savingsMap: { "unused-javascript": 400 },
  auditItemsMap: {},
  cachedAt: "2026-08-23T00:00:00.000Z",
  fromCache: false,
  lighthouseVersion: "13.4.1",
  fetchTimeMs: 5000,
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cache.getCached).mockResolvedValue(null);
  vi.mocked(cache.checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 3600 });
  vi.mocked(cache.checkDailyCap).mockResolvedValue(true);
  vi.mocked(cache.acquireInflightLock).mockResolvedValue(true);
  vi.mocked(cache.releaseInflightLock).mockResolvedValue(undefined);
  vi.mocked(cache.setCached).mockResolvedValue(undefined);
  vi.mocked(psi.runPSI).mockResolvedValue({ raw: {}, fetchTimeMs: 5000 });
  vi.mocked(psi.shapePSIResponse).mockReturnValue(SHAPED);
});

describe("input validation", () => {
  it("rejects a body that is not JSON", async () => {
    const res = await POST(request("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_URL");
    expect(psi.runPSI).not.toHaveBeenCalled();
  });

  it("rejects a missing url", async () => {
    const res = await POST(request({ strategy: "mobile" }));
    expect(res.status).toBe(400);
  });

  it("surfaces the first validation message", async () => {
    const res = await POST(request({ url: "" }));
    expect((await res.json()).message).toBe("URL is required");
  });
});

describe("SSRF guard", () => {
  it("blocks a private address before anything else runs", async () => {
    const res = await POST(request({ url: "http://169.254.169.254/latest/meta-data/" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("SSRF_BLOCKED");
    expect(psi.runPSI).not.toHaveBeenCalled();
    expect(cache.checkRateLimit).not.toHaveBeenCalled();
  });

  it("blocks a bracketed IPv6 loopback", async () => {
    const res = await POST(request({ url: "http://[::1]/" }));
    expect((await res.json()).code).toBe("SSRF_BLOCKED");
  });
});

describe("cache hits are free", () => {
  it("returns the cached result marked fromCache", async () => {
    vi.mocked(cache.getCached).mockResolvedValue({ performanceScore: 77, fromCache: false });
    const res = await POST(request({ url: "example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.performanceScore).toBe(77);
    expect(body.fromCache).toBe(true);
  });

  it("does not consume the caller's quota or the daily budget", async () => {
    vi.mocked(cache.getCached).mockResolvedValue({ performanceScore: 77 });
    await POST(request({ url: "example.com" }));
    // Sharing a result link should never cost the recipient an audit.
    expect(cache.checkRateLimit).not.toHaveBeenCalled();
    expect(cache.checkDailyCap).not.toHaveBeenCalled();
    expect(cache.acquireInflightLock).not.toHaveBeenCalled();
    expect(psi.runPSI).not.toHaveBeenCalled();
  });
});

describe("rate limiting", () => {
  it("returns 429 with a Retry-After header", async () => {
    vi.mocked(cache.checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 1800 });
    const res = await POST(request({ url: "example.com" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryAfter).toBe(1800);
    expect(body.message).toContain("30 minutes");
  });

  it("does not spend the global daily budget on a rate-limited request", async () => {
    // Regression: the daily cap used to be incremented before the per-IP check,
    // so a caller who was already blocked still burned the day's PSI quota.
    vi.mocked(cache.checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 60 });
    await POST(request({ url: "example.com" }));
    expect(cache.checkDailyCap).not.toHaveBeenCalled();
    expect(psi.runPSI).not.toHaveBeenCalled();
  });

  it("reports the remaining quota on a successful audit", async () => {
    const res = await POST(request({ url: "example.com" }));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });
});

describe("client IP resolution", () => {
  it("trusts x-real-ip, which the platform sets and clients cannot forge", async () => {
    await POST(request({ url: "example.com" }, { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }));
    expect(cache.checkRateLimit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("takes the last x-forwarded-for entry, not the client-controlled first", async () => {
    await POST(request({ url: "example.com" }, { "x-forwarded-for": "6.6.6.6, 9.9.9.9" }));
    expect(cache.checkRateLimit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("falls back to a sentinel when no IP header is present", async () => {
    await POST(request({ url: "example.com" }));
    expect(cache.checkRateLimit).toHaveBeenCalledWith("unknown");
  });
});

describe("in-flight lock", () => {
  it("returns 409 when another request already holds the lock", async () => {
    vi.mocked(cache.acquireInflightLock).mockResolvedValue(false);
    const res = await POST(request({ url: "example.com" }));
    expect(res.status).toBe(409);
    expect(psi.runPSI).not.toHaveBeenCalled();
  });

  it("does not release a lock it failed to acquire", async () => {
    // The loser releasing the winner's lock would defeat the whole mechanism.
    vi.mocked(cache.acquireInflightLock).mockResolvedValue(false);
    await POST(request({ url: "example.com" }));
    expect(cache.releaseInflightLock).not.toHaveBeenCalled();
  });

  it("releases the lock after a successful audit", async () => {
    await POST(request({ url: "example.com" }));
    expect(cache.releaseInflightLock).toHaveBeenCalledWith("analysis:mobile:https://example.com/");
  });

  it("releases the lock when PSI fails", async () => {
    vi.mocked(psi.runPSI).mockRejectedValue(new Error("PSI returned 500"));
    await POST(request({ url: "example.com" }));
    expect(cache.releaseInflightLock).toHaveBeenCalled();
  });

  it("releases the lock when the daily cap rejects the request", async () => {
    vi.mocked(cache.checkDailyCap).mockResolvedValue(false);
    await POST(request({ url: "example.com" }));
    expect(cache.releaseInflightLock).toHaveBeenCalled();
  });

  it("releases the lock when the shaping layer throws", async () => {
    // Regression: shapePSIResponse ran outside any try/finally, so a malformed
    // PSI payload left the lock held and 409'd every request for that URL
    // until the 65 second TTL expired.
    vi.mocked(psi.shapePSIResponse).mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'score')");
    });
    await expect(POST(request({ url: "example.com" }))).rejects.toThrow(TypeError);
    expect(cache.releaseInflightLock).toHaveBeenCalledWith("analysis:mobile:https://example.com/");
  });
});

describe("PSI failures", () => {
  it("maps an aborted request to 504", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    vi.mocked(psi.runPSI).mockRejectedValue(abort);
    const res = await POST(request({ url: "example.com" }));
    expect(res.status).toBe(504);
    expect((await res.json()).code).toBe("PSI_TIMEOUT");
  });

  it("maps any other failure to 502", async () => {
    vi.mocked(psi.runPSI).mockRejectedValue(new Error("PSI returned 429: quota"));
    const res = await POST(request({ url: "example.com" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("PSI_ERROR");
    expect(body.message).toContain("quota");
  });

  it("returns 503 when the global daily budget is spent", async () => {
    vi.mocked(cache.checkDailyCap).mockResolvedValue(false);
    const res = await POST(request({ url: "example.com" }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });
});

describe("successful audit", () => {
  it("normalizes the URL before keying the cache", async () => {
    await POST(request({ url: "EXAMPLE.com/docs/#intro" }));
    expect(cache.cacheKey).toHaveBeenCalledWith("https://example.com/docs", "mobile");
  });

  it("defaults to the mobile strategy", async () => {
    await POST(request({ url: "example.com" }));
    expect(psi.runPSI).toHaveBeenCalledWith("https://example.com/", "mobile");
  });

  it("honours an explicit desktop strategy", async () => {
    await POST(request({ url: "example.com", strategy: "desktop" }));
    expect(psi.runPSI).toHaveBeenCalledWith("https://example.com/", "desktop");
  });

  it("returns fixes and passing checks derived from the shaped audits", async () => {
    const res = await POST(request({ url: "example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.fromCache).toBe(false);
    expect(body.performanceScore).toBe(80);
    expect(body.fixes.map((f: { audit: string }) => f.audit)).toEqual(["unused-javascript"]);
    expect(body.fixes[0].savingsMs).toBe(400);
    expect(body.passingChecks.map((c: { audit: string }) => c.audit)).toEqual(["image-alt"]);
  });

  it("writes the result to the cache", async () => {
    await POST(request({ url: "example.com" }));
    expect(cache.setCached).toHaveBeenCalledWith(
      "analysis:mobile:https://example.com/",
      expect.objectContaining({ performanceScore: 80, fromCache: false })
    );
  });
});
