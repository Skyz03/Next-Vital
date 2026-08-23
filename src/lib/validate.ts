import { z } from "zod";

// SSRF prevention.
//
// Threat model and its limits are documented in docs/architecture.md. In short:
// this is *hostname*-level blocking, not DNS resolution, so a public hostname
// with an A record pointing at a private address (localtest.me and friends)
// still gets through. The mitigating factor is that Google's infrastructure
// fetches the target page — this server never issues a request to the URL — so
// the blocklist is defence in depth rather than the only thing standing between
// a caller and our internal network.

const BLOCKED_HOST_PATTERNS = [
  // Loopback and link-local
  /^localhost$/,
  /^127\./,
  /^169\.254\./, // includes 169.254.169.254, the cloud instance metadata endpoint
  // RFC 1918 private ranges
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  // Other reserved IPv4 space
  /^0\./, // "this network" — 0.0.0.0 reaches localhost on Linux
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 carrier-grade NAT
  /^192\.0\.0\./, // IETF protocol assignments
  /^198\.(1[89])\./, // 198.18.0.0/15 benchmarking
  /^(22[4-9]|23[0-9])\./, // 224.0.0.0/4 multicast
  /^(24[0-9]|25[0-5])\./, // 240.0.0.0/4 reserved
  // IPv6 — matched after the surrounding brackets are stripped
  /^::1$/, // loopback
  /^::$/, // unspecified
  /^f[cd][0-9a-f]{2}:/, // fc00::/7 unique-local
  /^fe[89ab][0-9a-f]:/, // fe80::/10 link-local
];

// Hostname suffixes that only resolve on an internal network.
const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];

export const UrlSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .transform((val) => (/^https?:\/\//i.test(val) ? val : `https://${val}`))
    .pipe(z.string().url("Please enter a valid URL")),
  strategy: z.enum(["mobile", "desktop"]).default("mobile"),
});

// The WHATWG URL parser serializes IPv6 hosts with their brackets ("[::1]"),
// which silently defeats any pattern anchored on the bare address.
function bareHostname(hostname: string): string {
  const host = hostname.toLowerCase();
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

// IPv4-mapped IPv6 ("::ffff:127.0.0.1") is a loopback address wearing a
// disguise. The URL parser normalizes it to the hex form "::ffff:7f00:1", so
// handle both spellings and re-check the result against the IPv4 patterns.
function mappedIPv4(host: string): string | null {
  const match = /^::ffff:(.+)$/.exec(host);
  if (!match) return null;

  const rest = match[1];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rest)) return rest;

  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

export function isBlockedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  // Only ever hand http(s) to PageSpeed Insights. Without this, file:, data:,
  // and gopher: URLs reach the request pipeline intact.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;

  const host = bareHostname(parsed.hostname);
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host))) return true;

  const mapped = mappedIPv4(host);
  if (mapped && BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(mapped))) return true;

  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

  // A hostname with neither a dot nor a colon is a bare internal name —
  // "http://metadata/" is a live alias for the GCP metadata server.
  if (!host.includes(".") && !host.includes(":")) return true;

  return false;
}

// Canonical form before cache keying: lowercase host, no fragment, no trailing slash
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}
