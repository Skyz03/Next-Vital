
# Nextvital — SEO Checklist Feature

## Context

The tool is currently 100% dependent on Google PSI. The user wants a **cross-validation layer**: a server-side HTML inspection that fetches the target URL directly and runs its own checks, independent of PSI. This surfaces things PSI doesn't cover (OG images, canonical URLs, structured data, robots.txt, fonts, sitemap) and can confirm PSI findings from our own data (e.g., PSI flags render-blocking resources → our layer identifies it's an external Google Font, and surfaces the `next/font` fix). The two layers complement rather than duplicate each other.

---

## Architecture

```
User submits URL
        │
        ├──► POST /api/analyze    ──► PSI API ──► AnalysisResult (sessionStorage: nextvital_result)
        │
        └──► POST /api/seo-check  ──► fetch URL HTML ──► 22 checks ──► SeoResult (sessionStorage: nextvital_seo)
                                   └──► HEAD /robots.txt + /sitemap.xml (parallel)

Results page reads both stores and renders:
  [Performance score + metrics]  ← existing
  [Next.js fixes]               ← existing
  [Already optimized]           ← existing
  [SEO Checklist]               ← NEW (SeoChecklist component)
```

---

## New Dependency

```bash
npm install node-html-parser
```

Lightweight (~100KB), no native binaries, works in Next.js serverless. No cheerio or jsdom.

---

## Files to Create

### `src/types/seo.ts`

```ts
export type CheckStatus = "pass" | "fail" | "warn";
export type CheckCategory = "social" | "core" | "technical" | "nextjs";

export interface SeoCheck {
  id: string;
  category: CheckCategory;
  title: string;
  status: CheckStatus;
  detail: string;      // e.g. "Missing og:title" or "Title is 18 chars (should be 30–60)"
  fix?: string;        // Next.js-specific fix (shown on fail/warn)
  codeExample?: string;
  docsUrl?: string;
}

export interface SeoResult {
  url: string;
  checks: SeoCheck[];
  passCount: number;
  failCount: number;
  warnCount: number;
  cachedAt: string;
  fromCache: boolean;
  fetchTimeMs: number;
}

export interface SeoError {
  error: true;
  code: "INVALID_URL" | "SSRF_BLOCKED" | "FETCH_FAILED" | "NOT_HTML" | "TIMEOUT";
  message: string;
}
```

---

### `src/lib/html-fetcher.ts`

Server-side HTML fetch with SSRF guard and 2MB body cap.

```ts
export interface FetchResult {
  html: string;
  headers: Record<string, string>;
  finalUrl: string;   // URL after redirects
  fetchTimeMs: number;
}

export async function fetchHtml(url: string): Promise<FetchResult>
```

- 10s timeout via `AbortController`
- Stream body with 2MB byte cap (don't call `res.text()` directly — use `getReader()` loop)
- Reject if `Content-Type` header doesn't include `text/html`
- Returns `FetchResult` with flat `Record<string, string>` headers (lowercase keys)

---

### `src/lib/seo-checks.ts`

Takes parsed HTML root (from `node-html-parser`) + metadata, returns `SeoCheck[]`. All check functions are synchronous. I/O (robots.txt, sitemap HEAD requests) happens in the route before checks run.

**22 checks across 4 categories:**

| Category | ID | Title | Pass condition |
|---|---|---|---|
| social | `og-title` | OG title | `<meta property="og:title">` exists |
| social | `og-description` | OG description | `<meta property="og:description">` exists |
| social | `og-image` | OG image | `<meta property="og:image">` exists |
| social | `og-image-size` | OG image dimensions | og:image:width=1200, height=630 present |
| social | `twitter-card` | Twitter card | `<meta name="twitter:card">` exists |
| core | `title-tag` | Title tag | `<title>` non-empty |
| core | `title-length` | Title length | 30–60 chars (warn if outside) |
| core | `meta-description` | Meta description | `<meta name="description">` exists |
| core | `description-length` | Description length | 120–160 chars (warn if outside) |
| core | `canonical` | Canonical URL | `<link rel="canonical">` exists |
| core | `not-noindex` | Page indexable | No `noindex` in robots meta OR `X-Robots-Tag` header |
| core | `single-h1` | Single H1 | Exactly one `<h1>` |
| core | `image-alt` | Images have alt | No `<img>` missing `alt` attribute (skip those in `<noscript>`) |
| technical | `https` | HTTPS | Final URL starts with `https://` |
| technical | `html-lang` | HTML lang | `<html lang="...">` non-empty |
| technical | `viewport` | Viewport meta | `<meta name="viewport">` exists |
| technical | `robots-txt` | robots.txt | HEAD `/robots.txt` returns 200 |
| technical | `sitemap` | Sitemap | HEAD `/sitemap.xml` or `/sitemap-index.xml` returns 200 |
| technical | `favicon` | Favicon | `<link rel="icon">` or `<link rel="shortcut icon">` in head |
| nextjs | `no-external-fonts` | No external fonts | No `fonts.googleapis.com` or `fonts.gstatic.com` `<link>` in head |
| nextjs | `structured-data` | JSON-LD present | `<script type="application/ld+json">` exists |
| nextjs | `next-image` | Images via next/image | No `<img>` without `data-nimg` outside `<noscript>` (warn, not fail) |

**Fix text for the key Next.js checks:**
- `no-external-fonts`: "Replace `<link>` Google Fonts with `next/font/google` — eliminates render-blocking and self-hosts the font."
- `structured-data`: "Add JSON-LD via `<Script type='application/ld+json'>` in a Server Component."
- `og-image`: "Create `app/opengraph-image.tsx` — Next.js auto-registers it as your og:image."

---

### `src/app/api/seo-check/route.ts`

```
POST /api/seo-check   { url: string }

1. Validate with existing UrlSchema (strategy field has default — just ignore it)
2. SSRF check via existing isBlockedUrl()
3. Cache check: key = seoCacheKey(url), 24h TTL via existing setCached/getCached
4. If miss:
   a. Parallel fetch:
      - fetchHtml(url)
      - HEAD baseUrl/robots.txt
      - HEAD baseUrl/sitemap.xml + HEAD baseUrl/sitemap-index.xml
   b. Parse HTML with node-html-parser
   c. Run all 22 synchronous checks
   d. Build SeoResult, cache it, return it
```

**No rate limiting on this route.** The existing rate limit guards the paid PSI API quota. This route only fetches the user's own URL — cheap, no external API costs. Rate limiting it would halve the effective PSI quota (both calls increment the same counter).

---

### `src/components/SeoCheckItem.tsx`

Single check row:
- Pass: `✓` in `--good`
- Fail: `✗` in `--poor` — clicking expands `fix` + `codeExample` + docs link
- Warn: `!` in `--needs` — same expand behavior

Mirror the expand pattern from `FixCard.tsx` (controlled by `useState(false)`, `aria-expanded`).

### `src/components/SeoChecklist.tsx`

Groups checks by category order: Social → Core → Technical → Next.js.
Summary bar: `18 / 22 passed` with colored progress segments.
Takes `SeoResult` as prop.

---

## Files to Modify

### `src/lib/cache.ts`

Add `seoCacheKey`:

```ts
export function seoCacheKey(url: string): string {
  const encoded = Buffer.from(url).toString("base64url");
  return `seo:${encoded}`;
}
```

Placed alongside existing `cacheKey`. No other changes.

---

### `src/app/page.tsx`

Replace single `fetch` in `handleSubmit` with parallel calls. SEO check failure is non-fatal — store the error in sessionStorage but still navigate.

```ts
const [perfRes, seoRes] = await Promise.allSettled([
  fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, strategy }) }),
  fetch("/api/seo-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }),
]);

// PSI result gates navigation
if (perfRes.status === "rejected" || !perfRes.value.ok) {
  const data = perfRes.status === "fulfilled" ? await perfRes.value.json() : null;
  setError(data?.message ?? "Network error. Check your connection and try again.");
  return;
}

const perfData = await perfRes.value.json();
sessionStorage.setItem("nextvital_result", JSON.stringify(perfData));

if (seoRes.status === "fulfilled" && seoRes.value.ok) {
  const seoData = await seoRes.value.json();
  sessionStorage.setItem("nextvital_seo", JSON.stringify(seoData));
} else {
  sessionStorage.removeItem("nextvital_seo");
}

router.push(`/results?url=${encodeURIComponent(url)}&strategy=${strategy}`);
```

---

### `src/app/results/page.tsx`

1. Add `SeoResult` state alongside existing `AnalysisResult` state
2. In `useEffect`, also read `nextvital_seo` from sessionStorage (null if absent)
3. Add SEO section at the bottom, after "Already optimized":

```tsx
{seoResult && (
  <section>
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-2)] mb-4">
      SEO Checklist
    </h2>
    <SeoChecklist result={seoResult} />
  </section>
)}
```

No layout changes to existing sections.

---

## Verification

1. `npm run build` — zero TS errors
2. `npm run dev`, enter a real Next.js URL (e.g. `nextjs.org`)
3. Results page shows SEO section with all 4 category groups
4. A URL without `og:image` → `og-image` check fails, clicking expands the fix
5. A URL with Google Fonts link → `no-external-fonts` fails with next/font fix
6. Re-run same URL → second call returns `fromCache: true` in the SEO section
7. Enter a URL without sitemap.xml → `sitemap` check fails
8. Check Network tab: both `/api/analyze` and `/api/seo-check` requests fire simultaneously