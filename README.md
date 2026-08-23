# Nextvital

**PageSpeed Insights, interpreted for Next.js.** Paste a URL, get fixes that reference
`next/image`, `next/font`, App Router patterns, dynamic imports, and ISR — not generic Lighthouse
advice.

[![CI](https://github.com/Skyz03/Next-Vital/actions/workflows/ci.yml/badge.svg)](https://github.com/Skyz03/Next-Vital/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Skyz03/Next-Vital)

---

Most performance tools tell you to "optimize your images." Nextvital tells you which component to
reach for, shows the before/after code, links the Next.js docs, and lists the specific files on your
site that triggered it. The fix map covers **38 Lighthouse audits** across performance, SEO, and
accessibility.

## How it works

```
URL input
  → Zod validation + SSRF block (private IPs, IPv6, internal hostnames, non-HTTP schemes)
  → Redis cache check (24h TTL — cached hits are instant and cost no quota)
  → Per-IP rate limit (5 live audits/hour) + in-flight lock + global daily budget
  → Google PageSpeed Insights API (performance + SEO + accessibility)
  → Shaping layer — Core Web Vitals, failed audits, savings estimates, flagged resources
  → Next.js fix map — maps PSI audit IDs → actionable Next.js fixes
  → Results page — score rings, Core Web Vitals, fix cards with code examples
```

The decisions behind that pipeline — why the cache is checked before the rate limiter, why the rate
limiter uses `EXPIRE NX`, why everything fails open, and how the shaping layer survives Lighthouse
renaming its audits — are written up in **[docs/architecture.md](docs/architecture.md)**.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router (TypeScript) |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Validation | Zod 4 |
| Caching / rate limiting | Upstash Redis |
| External API | Google PageSpeed Insights v5 (Lighthouse 13) |
| Tests | Vitest — 273 tests, no DOM dependencies |
| CI | GitHub Actions (lint, typecheck, test, build on Node 20 + 22) |

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

Open [http://localhost:3000](http://localhost:3000) and paste any public URL.

## Scripts

```bash
npm run dev         # dev server
npm test            # vitest, single run
npm run test:watch  # vitest, watch mode
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

## Deploy to Vercel

1. Import `Skyz03/Next-Vital` in the [Vercel dashboard](https://vercel.com/new). Framework and
   package manager are auto-detected.
2. Add the 4 environment variables under **Settings → Environment Variables** (Production +
   Preview).
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://nextvital.vercel.app`).
4. Deploy. Once the domain is live, redeploy once — `NEXT_PUBLIC_APP_URL` is inlined at build time
   for OG images and the sitemap.

## Project structure

```
src/
├── app/
│   ├── api/analyze/route.ts   # POST handler — validation, quota, PSI, cache
│   ├── page.tsx               # URL input form
│   └── results/page.tsx       # Score rings + metrics + fix cards
├── components/
│   ├── ScoreRing.tsx          # Animated SVG score circle
│   ├── MetricCard.tsx         # Core Web Vital tile
│   └── FixCard.tsx            # Collapsible fix with code example
├── lib/
│   ├── psi.ts                 # PSI fetch + response shaping
│   ├── nextjs-fixes.ts        # PSI audit ID → Next.js fix map (single source of truth)
│   ├── cache.ts               # Upstash Redis cache, rate limiter, in-flight lock
│   ├── validate.ts            # Zod schema + SSRF blocklist
│   └── __fixtures__/          # Real PSI responses, trimmed, for tests
└── types/
    └── analysis.ts            # Shared TypeScript types
```

## Roadmap

- **Shareable result permalinks** — Redis-backed `/r/[id]` routes, server-rendered, with a per-result
  OG card showing the actual scores.
- **Server-side SEO checklist** ([`docs/seo-checklist-spec.md`](docs/seo-checklist-spec.md)) — direct
  HTML inspection covering 22 checks. Deferred pending DNS-level SSRF hardening, which becomes
  mandatory once this server fetches a submitted URL itself.
- **Full CSP** — deferred; inline styles and Next.js bootstrap scripts make a strict policy
  high-effort without third-party scripts to police.
