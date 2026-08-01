# Next

**PageSpeed Insights, interpreted for Next.js.** Paste a URL, get fixes that reference `next/image`, `next/font`, App Router patterns, dynamic imports, and ISR — not generic Lighthouse advice.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Skyz03/Next-Vital)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)

---

Most performance tools tell you to "optimize your images." Nextvital tells you exactly which component to reach for, shows you the before/after code, and links you to the Next.js docs. The fix map covers 12 PSI audits translated into App Router-specific advice.

---

## How it works

```
URL input
  → Zod validation + SSRF block (private IPs, localhost)
  → Redis cache check (24h TTL — cached hits are instant)
  → Per-IP rate limit (5 live audits/hour)
  → Google PageSpeed Insights API (performance category)
  → Shaping layer — extracts Core Web Vitals, failed audits, savings estimates
  → Next.js fix map — maps PSI audit IDs → actionable Next.js fixes
  → Results page — score ring, Core Web Vitals, fix cards with code examples
```

Shareable `/results?url=…` links serve from Redis cache — no re-audit needed.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router (TypeScript) |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Validation | Zod 4 |
| Caching / rate limiting | Upstash Redis |
| External API | Google PageSpeed Insights v5 |
| Deploy target | Vercel |

---

## Local setup

```bash
git clone https://github.com/Skyz03/Next-Vital.git
cd Next-Vital
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Key | Where to get it |
|-----|----------------|
| `GOOGLE_PSI_API_KEY` | [Google Cloud Console](https://developers.google.com/speed/docs/insights/v5/get-started) — free, 25k requests/day |
| `UPSTASH_REDIS_REST_URL` | [Upstash console](https://upstash.com) — free tier |
| `UPSTASH_REDIS_REST_TOKEN` | Same Upstash Redis instance |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev |

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste any public Next.js URL.

---

## Deploy to Vercel

1. Import `Skyz03/Next-Vital` in the [Vercel dashboard](https://vercel.com/new). Framework and package manager are auto-detected.
2. Add the 4 environment variables under **Settings → Environment Variables** (Production + Preview).
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://nextvital.vercel.app`).
4. Deploy. Once the domain is live, redeploy once — `NEXT_PUBLIC_APP_URL` is inlined at build time for OG images and the sitemap.

---

## Project structure

```
src/
├── app/
│   ├── api/analyze/route.ts   # POST handler — validation, rate limit, PSI, cache
│   ├── page.tsx               # URL input form
│   └── results/page.tsx       # Score ring + metrics + fix cards
├── components/
│   ├── ScoreRing.tsx          # Animated SVG score circle
│   ├── MetricCard.tsx         # Core Web Vital tile
│   └── FixCard.tsx            # Collapsible fix with code example
├── lib/
│   ├── psi.ts                 # PSI fetch + response shaping
│   ├── nextjs-fixes.ts        # PSI audit ID → Next.js fix map
│   ├── cache.ts               # Upstash Redis cache + rate limiter
│   └── validate.ts            # Zod schema + SSRF block list
└── types/
    └── analysis.ts            # Shared TypeScript types
```

---

## Roadmap

- **Server-side SEO checklist** (`docs/seo-checklist-spec.md`) — direct HTML inspection covering 22 checks: Open Graph, canonical URLs, structured data, Next.js-specific patterns. Deferred pending SSRF hardening (DNS resolution checks).
- **Tests + CI** — unit tests for `lib/validate`, `lib/nextjs-fixes`, `lib/cache`; GitHub Actions for lint + build on PR.
- **Full CSP** — deferred; inline styles and Next.js bootstrap scripts make a strict policy high-effort without third-party scripts to police.
