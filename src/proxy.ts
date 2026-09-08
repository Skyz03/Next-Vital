import { NextResponse, type NextRequest } from "next/server";

// Nonces close the XSS-via-inline-script hole that BYOK credentials in
// localStorage make urgent. Every request gets a fresh nonce; only scripts
// tagged with that nonce (plus their transitive imports via strict-dynamic)
// execute. Next.js automatically applies the nonce to its own framework
// scripts when x-nonce is present on the request.
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const isDev = process.env.NODE_ENV === "development";
  const connectSrc = [
    "'self'",
    "https://api.anthropic.com",
    "https://generativelanguage.googleapis.com",
    "https://openrouter.ai",
    // Local Ollama is a browser-side call to loopback and only exists in dev.
    ...(isDev ? ["http://localhost:11434"] : []),
  ].join(" ");

  // 'unsafe-inline' on style-src stays: Tailwind 4 + inline React styles are
  // pervasive, and style-based XSS is dramatically less severe than script.
  // The script-src nonce closes the actual XSS-execution hole.
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`.trim(),
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src ${connectSrc}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and metadata routes — they don't need CSP and adding
    // the header to every /_next/static/* response is pure overhead.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
