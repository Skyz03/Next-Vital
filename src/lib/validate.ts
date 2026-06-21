import { z } from "zod";

// Private IP ranges to block (SSRF prevention)
const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./, // link-local (AWS metadata endpoint)
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

export const UrlSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .transform((val) => (val.startsWith("http") ? val : `https://${val}`))
    .pipe(
      z.string().url("Please enter a valid URL")
    ),
  strategy: z.enum(["mobile", "desktop"]).default("mobile"),
});

export function isBlockedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return BLOCKED_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return true;
  }
}
