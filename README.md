# Nextvital

**Stop guessing why your Next.js site is slow.** Paste a URL and get a ranked list of exactly what
to fix — with the code to fix it.

[![CI](https://github.com/Skyz03/Next-Vital/actions/workflows/ci.yml/badge.svg)](https://github.com/Skyz03/Next-Vital/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Skyz03/Next-Vital)

---

## What you get

**Audit any public URL in seconds.** Nextvital calls Google PageSpeed Insights, pulls out the
failures, and maps each one to the exact Next.js API that fixes it — `next/image`, `next/font`,
dynamic imports, ISR, App Router patterns. No generic "optimize your images" advice.

**See before/after code.** Every fix card shows a collapsible code example alongside the Lighthouse
audit that triggered it, a savings estimate, and a link to the Next.js docs.

**Track your progress on the Dashboard.** Every audit you run is saved automatically. The dashboard
shows all your past results in one place with a unified fix checklist — ranked by impact — so you
can check off fixes as you ship them.

**Share results with a link.** Hit **Copy share link** on any results page to get a permanent URL
you can send to your team. The shared page is fully server-rendered with correct metadata, so it
looks right when pasted into Slack or a Linear ticket.

**Ask AI follow-up questions — with your own key.** Connect a provider (Anthropic, Gemini,
OpenRouter, or a local Ollama model) and turn the report into an interactive action plan. The AI is
told only what's in the audit — it cannot make up scores or recommendations that aren't there. This
is entirely optional and costs you nothing unless you choose to use it.

---

## Quick start

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

---

## AI features (optional)

The AI layer is opt-in and runs entirely on **your** API key — nothing is billed to the server.

Open a results page, click **Connect a model**, and pick a provider:

| Provider | Cost | Get it from |
|----------|------|-------------|
| **Local (Ollama)** | Free, no account needed | [ollama.com](https://ollama.com/download) — runs on your machine |
| **Google Gemini** | Free tier, no card required | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **OpenRouter** | Free models available | [openrouter.ai/keys](https://openrouter.ai/keys) — 400+ models via one key |
| **Anthropic** | Pay-as-you-go | [console.anthropic.com](https://console.anthropic.com/settings/keys) |

### "I have a subscription, not an API key"

A Claude Pro/Max, ChatGPT Plus, or Gemini Advanced subscription **cannot be used here** — those
authenticate a browser session, not an API client. There is no key to issue. Two free alternatives:

- **Run a local model.** `ollama pull llama3.2`, pick **Local (Ollama)**. No key, no cost, no usage
  limit. The report never leaves your machine — the most private option and the only one that works
  offline.
- **Get a free Gemini key.** [AI Studio](https://aistudio.google.com/apikey) issues one in about
  thirty seconds with no card required.

---

## Deploy to Vercel

1. Import `Skyz03/Next-Vital` in the [Vercel dashboard](https://vercel.com/new). Framework and
   package manager are auto-detected.
2. Add the 4 environment variables under **Settings → Environment Variables**.
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain.
4. Deploy. Redeploy once after the domain is live — `NEXT_PUBLIC_APP_URL` is inlined at build time
   for OG images and the sitemap.

---

## Developer features

### Scripts

```bash
npm run dev         # dev server
npm test            # vitest, single run
npm run test:watch  # vitest, watch mode
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

### Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router (TypeScript) |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Validation | Zod 4 |
| Caching / rate limiting | Upstash Redis |
| External API | Google PageSpeed Insights v5 (Lighthouse 13) |
| AI (optional) | BYOK — Anthropic, Gemini, OpenRouter, or local Ollama |
| Tests | Vitest — 402 tests, no DOM dependencies |
| CI | GitHub Actions (lint, typecheck, test, build on Node 20 + 22) |

### How the pipeline works

```
URL input
  → Zod validation + SSRF block (private IPs, IPv6, internal hostnames, non-HTTP schemes)
  → Redis cache check (24h TTL)
  → Per-IP rate limit (5 live audits/hour) + in-flight lock + global daily budget
  → Google PageSpeed Insights API
  → Shaping layer — Core Web Vitals, failed audits, savings estimates, flagged resources
  → Next.js fix map (38 Lighthouse audit IDs → actionable fixes)
  → Results page + auto-save to session history
```

AI second pass:

```
POST /api/explain  (key in X-Provider-Key header)
  → Per-IP AI rate limit (60/hour)
  → Redis lookup of cached audit — prompt built server-side, not from request body
  → Anthropic / Gemini / OpenRouter, streamed as SSE
  (local model: browser → localhost directly, skips all of the above)
```

The reasoning behind these decisions — why the cache is checked before the rate limiter, why
`EXPIRE NX`, why everything fails open — is in **[docs/architecture.md](docs/architecture.md)**.

### Sharing and history internals

- **Permalinks** — `POST /api/share` mints a short random ID and writes the full cached report to
  Redis. The `/r/[id]` page is server-rendered with OG/Twitter Card metadata and JSON-LD schema.
  Share requests reuse the AI rate-limit bucket.
- **Session history** — `GET/POST/DELETE /api/history` stores up to 20 entries per session in Redis
  (30-day `httpOnly` session cookie). The dashboard's fix checklist state is persisted separately in
  `localStorage`.

### Project structure

```
src/
├── app/
│   ├── api/analyze/route.ts   # POST — validation, quota, PSI, cache
│   ├── api/explain/route.ts   # POST — BYOK proxy, streams model reply
│   ├── api/share/route.ts     # POST — mint permalink IDs
│   ├── api/history/route.ts   # GET/POST/DELETE — session audit history
│   ├── r/[id]/page.tsx        # Shareable permalink page
│   ├── dashboard/page.tsx     # Audit history + fix checklist
│   ├── page.tsx               # URL input form
│   └── results/page.tsx       # Score rings + metrics + fix cards
├── components/
│   ├── AppTopBar.tsx          # Persistent top bar
│   ├── ScoreRing.tsx          # Animated SVG score circle
│   ├── MetricCard.tsx         # Core Web Vital tile
│   ├── FixCard.tsx            # Collapsible fix with code example
│   ├── AiPanel.tsx            # Action plan + chat
│   ├── AiSettings.tsx         # Provider / model / key form
│   ├── ResultsView.tsx        # Shared results layout (/results and /r/[id])
│   ├── ShareButton.tsx        # Mints and copies a /r/[id] permalink
│   ├── HistorySaver.tsx       # Auto-saves each result to session history
│   ├── ProgressTimer.tsx      # Animated loading indicator
│   ├── ResultsSkeleton.tsx    # Loading skeleton
│   └── Markdown.tsx           # Renderer for model output
├── lib/
│   ├── psi.ts                 # PSI fetch + response shaping
│   ├── nextjs-fixes.ts        # Audit ID → Next.js fix map
│   ├── cache.ts               # Redis cache, rate limiter, permalinks, history
│   ├── validate.ts            # Zod schema + SSRF blocklist
│   ├── byok.ts                # Browser-held credentials
│   ├── history.ts             # HistoryEntry type + localStorage checklist helpers
│   ├── analyze.ts             # Shared analysis logic
│   └── ai/                    # Provider registry, SSE parser, adapters
└── types/
    ├── analysis.ts
    └── ai.ts
```

### Roadmap

- **Server-side SEO checklist** — direct HTML inspection covering 22 checks. Deferred pending
  DNS-level SSRF hardening.
- **Full CSP** — `script-src` policy to protect the BYOK credential in `localStorage`.
