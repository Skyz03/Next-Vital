import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    pipeline: vi.fn(),
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {
      return mockRedis;
    }
  },
}));

const {
  cacheKey,
  rateLimitKey,
  getCached,
  setCached,
  checkRateLimit,
  checkAiRateLimit,
  aiRateLimitKey,
  checkDailyCap,
  acquireInflightLock,
  releaseInflightLock,
} = await import("./cache");

/** Makes redis.pipeline() resolve to the given exec() results. */
function pipelineReturning(results: unknown[]) {
  const pipe = { incr: vi.fn(), expire: vi.fn(), exec: vi.fn().mockResolvedValue(results) };
  mockRedis.pipeline.mockReturnValue(pipe);
  return pipe;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cacheKey", () => {
  it("is deterministic", () => {
    expect(cacheKey("https://a.com", "mobile")).toBe(cacheKey("https://a.com", "mobile"));
  });

  it("separates strategies", () => {
    expect(cacheKey("https://a.com", "mobile")).not.toBe(cacheKey("https://a.com", "desktop"));
  });

  it("separates URLs that differ only in the query string", () => {
    expect(cacheKey("https://a.com/?a=1", "mobile")).not.toBe(cacheKey("https://a.com/?a=2", "mobile"));
  });

  it("produces a key safe to use unescaped", () => {
    // base64url avoids the "/" and "+" that plain base64 would emit
    const key = cacheKey("https://a.com/some/deep/path?q=a+b&r=c/d", "mobile");
    expect(key.startsWith("analysis:mobile:")).toBe(true);
    expect(key.slice("analysis:mobile:".length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("rateLimitKey", () => {
  it("namespaces by IP", () => {
    expect(rateLimitKey("1.2.3.4")).toBe("ratelimit:1.2.3.4");
  });
});

describe("getCached / setCached", () => {
  it("returns the stored value", async () => {
    mockRedis.get.mockResolvedValue({ hello: "world" });
    expect(await getCached("k")).toEqual({ hello: "world" });
  });

  it("returns null when Redis is unreachable", async () => {
    mockRedis.get.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await getCached("k")).toBeNull();
  });

  it("writes with a 24 hour TTL", async () => {
    mockRedis.set.mockResolvedValue("OK");
    await setCached("k", { a: 1 });
    expect(mockRedis.set).toHaveBeenCalledWith("k", { a: 1 }, { ex: 86400 });
  });

  it("swallows write failures — a cold cache is not an outage", async () => {
    mockRedis.set.mockRejectedValue(new Error("quota exceeded"));
    await expect(setCached("k", { a: 1 })).resolves.toBeUndefined();
  });
});

describe("checkRateLimit", () => {
  it("sets the window expiry with NX so it is not reset on every request", async () => {
    const pipe = pipelineReturning([1, 1]);
    mockRedis.ttl.mockResolvedValue(3600);

    await checkRateLimit("1.2.3.4");

    expect(pipe.incr).toHaveBeenCalledWith("ratelimit:1.2.3.4");
    // Without NX, every request would push the window out and the limit would
    // never actually reset for an active caller.
    expect(pipe.expire).toHaveBeenCalledWith("ratelimit:1.2.3.4", 3600, "NX");
  });

  it("allows the first five requests in a window", async () => {
    for (const count of [1, 2, 3, 4, 5]) {
      pipelineReturning([count, 0]);
      mockRedis.ttl.mockResolvedValue(1800);
      const result = await checkRateLimit("1.2.3.4");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - count);
    }
  });

  it("blocks the sixth", async () => {
    pipelineReturning([6, 0]);
    mockRedis.ttl.mockResolvedValue(1800);
    const result = await checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(1800);
  });

  it("never reports a negative remaining count", async () => {
    pipelineReturning([99, 0]);
    mockRedis.ttl.mockResolvedValue(60);
    expect((await checkRateLimit("1.2.3.4")).remaining).toBe(0);
  });

  it("falls back to a full window when the key has no TTL", async () => {
    pipelineReturning([6, 0]);
    mockRedis.ttl.mockResolvedValue(-1); // key exists but has no expiry
    expect((await checkRateLimit("1.2.3.4")).retryAfter).toBe(3600);
  });

  it("fails open when Redis is down", async () => {
    mockRedis.pipeline.mockImplementation(() => {
      throw new Error("ECONNREFUSED");
    });
    // Losing Redis should make the service unmetered, not unavailable.
    expect(await checkRateLimit("1.2.3.4")).toEqual({
      allowed: true,
      remaining: 5,
      retryAfter: 0,
    });
  });
});

describe("checkDailyCap", () => {
  it("sets an expiry only on the first increment of the day", async () => {
    mockRedis.incr.mockResolvedValue(1);
    await checkDailyCap();
    expect(mockRedis.expire).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockRedis.incr.mockResolvedValue(2);
    await checkDailyCap();
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  it("keys by UTC date", async () => {
    mockRedis.incr.mockResolvedValue(1);
    await checkDailyCap();
    expect(mockRedis.incr).toHaveBeenCalledWith(
      `global:psi:${new Date().toISOString().slice(0, 10)}`
    );
  });

  it("allows requests up to the cap", async () => {
    mockRedis.incr.mockResolvedValue(500);
    expect(await checkDailyCap()).toBe(true);
  });

  it("blocks past the cap", async () => {
    mockRedis.incr.mockResolvedValue(501);
    expect(await checkDailyCap()).toBe(false);
  });

  it("fails open when Redis is down", async () => {
    mockRedis.incr.mockRejectedValue(new Error("down"));
    expect(await checkDailyCap()).toBe(true);
  });
});

describe("in-flight lock", () => {
  it("acquires with NX so only one caller wins", async () => {
    mockRedis.set.mockResolvedValue("OK");
    expect(await acquireInflightLock("analysis:mobile:abc")).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith("inflight:analysis:mobile:abc", "1", {
      nx: true,
      ex: 65,
    });
  });

  it("reports failure when another request already holds it", async () => {
    mockRedis.set.mockResolvedValue(null);
    expect(await acquireInflightLock("k")).toBe(false);
  });

  it("fails open — double-calling PSI beats blocking every request", async () => {
    mockRedis.set.mockRejectedValue(new Error("down"));
    expect(await acquireInflightLock("k")).toBe(true);
  });

  it("releases by deleting the key", async () => {
    mockRedis.del.mockResolvedValue(1);
    await releaseInflightLock("k");
    expect(mockRedis.del).toHaveBeenCalledWith("inflight:k");
  });

  it("tolerates a failed release — the TTL cleans up regardless", async () => {
    mockRedis.del.mockRejectedValue(new Error("down"));
    await expect(releaseInflightLock("k")).resolves.toBeUndefined();
  });


});

describe("checkAiRateLimit", () => {
  it("uses a key namespace separate from the PSI limiter", () => {
    // Sharing a key would spend the audit quota on chat turns and vice versa.
    expect(aiRateLimitKey("1.2.3.4")).not.toBe(rateLimitKey("1.2.3.4"));
  });

  it("sets the window expiry with NX, like the PSI limiter", async () => {
    const pipe = pipelineReturning([1, 1]);
    mockRedis.ttl.mockResolvedValue(3600);

    await checkAiRateLimit("1.2.3.4");

    expect(pipe.incr).toHaveBeenCalledWith("ai:ratelimit:1.2.3.4");
    expect(pipe.expire).toHaveBeenCalledWith("ai:ratelimit:1.2.3.4", 3600, "NX");
  });

  it("allows far more requests than the audit quota", async () => {
    // The tokens spent here are the caller's own, so this budget only exists
    // to stop the proxy being driven as a general-purpose LLM relay. At the
    // PSI limit of 5 a user would be cut off after their first chat exchange.
    pipelineReturning([60, 0]);
    mockRedis.ttl.mockResolvedValue(1800);
    const result = await checkAiRateLimit("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks past the limit", async () => {
    pipelineReturning([61, 0]);
    mockRedis.ttl.mockResolvedValue(1800);
    const result = await checkAiRateLimit("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(1800);
  });

  it("fails open when Redis is down", async () => {
    mockRedis.pipeline.mockImplementation(() => {
      throw new Error("connection refused");
    });
    expect(await checkAiRateLimit("1.2.3.4")).toEqual({
      allowed: true,
      remaining: 60,
      retryAfter: 0,
    });
  });
});
