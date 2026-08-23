import { describe, it, expect } from "vitest";
import { UrlSchema, isBlockedUrl, normalizeUrl } from "./validate";

function parse(input: unknown) {
  return UrlSchema.safeParse(input);
}

describe("UrlSchema", () => {
  it("prefixes a bare domain with https://", () => {
    const result = parse({ url: "example.com" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.url).toBe("https://example.com");
  });

  it("preserves an explicit http:// scheme", () => {
    const result = parse({ url: "http://example.com" });
    expect(result.success && result.data.url).toBe("http://example.com");
  });

  it("does not double-prefix a URL whose path contains 'http'", () => {
    const result = parse({ url: "example.com/http/guide" });
    expect(result.success && result.data.url).toBe("https://example.com/http/guide");
  });

  it("defaults strategy to mobile", () => {
    const result = parse({ url: "example.com" });
    expect(result.success && result.data.strategy).toBe("mobile");
  });

  it("accepts desktop strategy", () => {
    const result = parse({ url: "example.com", strategy: "desktop" });
    expect(result.success && result.data.strategy).toBe("desktop");
  });

  it("rejects an unknown strategy", () => {
    expect(parse({ url: "example.com", strategy: "tablet" }).success).toBe(false);
  });

  it("rejects an empty URL with a readable message", () => {
    const result = parse({ url: "" });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe("URL is required");
  });

  it("rejects a missing url field", () => {
    expect(parse({}).success).toBe(false);
  });
});

describe("isBlockedUrl — IPv4 private and reserved ranges", () => {
  const blocked = [
    "http://localhost/",
    "http://LOCALHOST/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://169.254.169.254/", // AWS/GCP instance metadata
    "http://0.0.0.0/",
    "http://100.64.0.1/", // CGNAT
    "http://192.0.0.1/", // IETF protocol assignments
    "http://198.18.0.1/", // benchmarking range
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  }
});

describe("isBlockedUrl — IPv6", () => {
  // Regression: URL.hostname returns IPv6 hosts wrapped in brackets ("[::1]"),
  // so patterns anchored on the bare address can never match unless the
  // brackets are stripped first.
  const blocked = [
    "http://[::1]/",
    "http://[0:0:0:0:0:0:0:1]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "http://[fd00::1]/", // unique-local is fc00::/7, not just the fc00 prefix
    "http://[::ffff:127.0.0.1]/", // IPv4-mapped loopback
    "http://[::ffff:169.254.169.254]/", // IPv4-mapped metadata endpoint
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  }

  it("allows a public IPv6 address", () => {
    expect(isBlockedUrl("http://[2001:4860:4860::8888]/")).toBe(false);
  });
});

describe("isBlockedUrl — non-HTTP schemes", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com/",
    "gopher://example.com/",
    "data:text/html,<script>alert(1)</script>",
  ]) {
    it(`blocks ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  }
});

describe("isBlockedUrl — internal hostnames", () => {
  // A hostname with no dot is only resolvable on an internal network.
  // "http://metadata/" is a live alias for the GCP metadata server.
  for (const url of [
    "http://metadata/",
    "http://intranet/",
    "http://metadata.google.internal/",
    "http://printer.local/",
    "http://app.localhost/",
  ]) {
    it(`blocks ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  }
});

describe("isBlockedUrl — public addresses pass", () => {
  const allowed = [
    "https://nextjs.org/",
    "https://example.com/docs?q=1",
    "http://8.8.8.8/",
    "http://172.15.0.1/", // just below the 172.16/12 block
    "http://172.32.0.1/", // just above it
    "http://100.63.255.255/", // just below CGNAT
    "http://100.128.0.1/", // just above CGNAT
    "http://11.0.0.1/",
    "http://192.167.1.1/",
  ];

  for (const url of allowed) {
    it(`allows ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(false);
    });
  }
});

describe("isBlockedUrl — malformed input", () => {
  it("blocks anything it cannot parse", () => {
    expect(isBlockedUrl("not a url")).toBe(true);
    expect(isBlockedUrl("")).toBe(true);
  });
});

describe("normalizeUrl", () => {
  it("lowercases the hostname", () => {
    expect(normalizeUrl("https://EXAMPLE.com/Path")).toBe("https://example.com/Path");
  });

  it("preserves path case", () => {
    expect(normalizeUrl("https://example.com/CaseSensitive")).toBe(
      "https://example.com/CaseSensitive"
    );
  });

  it("strips the fragment", () => {
    expect(normalizeUrl("https://example.com/docs#section")).toBe("https://example.com/docs");
  });

  it("strips a trailing slash from a non-root path", () => {
    expect(normalizeUrl("https://example.com/docs/")).toBe("https://example.com/docs");
  });

  it("keeps the root slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("preserves the query string", () => {
    expect(normalizeUrl("https://example.com/search?q=next#frag")).toBe(
      "https://example.com/search?q=next"
    );
  });

  it("returns the input unchanged when it cannot be parsed", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });

  it("is idempotent", () => {
    const once = normalizeUrl("https://EXAMPLE.com/docs/#x");
    expect(normalizeUrl(once)).toBe(once);
  });
});
