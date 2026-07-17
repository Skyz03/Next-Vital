# Nextvital

Paste a Next.js URL. Get performance fixes written for Next.js — not generic Lighthouse advice.

Most PageSpeed tools tell you "optimize images." Nextvital tells you to replace `<img>` with `next/image`, add the `priority` prop on your LCP image, and links you to the Next.js docs. The fix map covers ~26 audits across performance, SEO, and accessibility, all translated into App Router patterns.

---

## How it works

```
URL input
  → Zod validation + SSRF block (private IPs, localhost)
  → Redis cache check (24h TTL — cached hits are free and instant)
  → Per-IP rate limit (5 live audits/hour) + global daily cap (500/day)
  → Google PageSpeed Insights API (performance + SEO + accessibility categories)
  → Shaping layer — extracts metrics, failed audits, savings estimates
  → Next.js fix map — maps PSI audit IDs to actionable Next.js-specific fixes
  → Results page — score rings, Core Web Vitals, categorized fixes, passing checks
```

Shared `/results?url=…` links work for anyone — they hit the Redis cache rather than re-running a live PSI audit.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router (TypeScript) |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Validation | Zod |
| Caching / rate limiting | Upstash Redis |
| External API | Google PageSpeed Insights v5 |
| Deploy | Vercel |

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
| `GOOGLE_PSI_API_KEY` | [Google Cloud Console](https://developers.google.com/speed/docs/insights/v5/get-started) — free, 25k/day |
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
4. Deploy, then **redeploy once** after setting `NEXT_PUBLIC_APP_URL` — it's inlined at build time for OG images and the sitemap.

---

## Roadmap

- **Server-side SEO checklist** (`docs/seo-checklist-spec.md`) — direct HTML inspection independent of PSI, covering 22 checks (social tags, Open Graph, canonical, structured data, Next.js-specific patterns). Needs SSRF hardening (DNS resolution checks) before shipping.
- **Full CSP** — intentionally deferred; inline styles + Next.js bootstrap scripts make a strict policy high-effort without third-party scripts to police.
- **Tests + CI** — unit tests for `lib/validate`, `lib/nextjs-fixes`, `lib/cache`; GitHub Actions for lint + build on PR.
