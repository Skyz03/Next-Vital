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

On top of that deterministic layer, you can plug in **your own model** — a hosted API key, or a model
running locally on your machine with no key at all — to turn a report into a prioritised action plan
and ask follow-up questions about it. That layer is entirely optional; with nothing connected the app
behaves exactly as it always has.

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

With a key configured, the results page can run a second pass:

```
Action plan / follow-up question
  → POST /api/explain with the key in an X-Provider-Key header
  → Per-IP AI rate limit (60/hour — stops the route being used as an open LLM relay)
  → Redis lookup of the cached audit (the prompt is built server-side from that,
    never from the request body)
  → Anthropic / Gemini / OpenRouter, streamed
  (a local model skips all of the above: browser → localhost, direct)
  → SSE normalised to plain-text deltas → rendered as it arrives
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
| AI (optional) | Bring-your-own key — Anthropic, Gemini, OpenRouter — or a keyless local model |
| Tests | Vitest — 402 tests, no DOM dependencies |
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

## Bring your own model

The AI features are opt-in and run on **your** API key. Nothing is configured server-side — there is
no key in `.env`, and the deployment never pays for a token.

Open a report, click **Connect a model**, and choose a provider:

| Provider | Cost | Get it from |
|----------|------|-------------|
| **Local (Ollama)** | Free, and no account | [ollama.com](https://ollama.com/download) — no key at all; see below |
| **Google Gemini** | Free tier, no card required | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **OpenRouter** | Free models available (`:free` slugs) | [openrouter.ai/keys](https://openrouter.ai/keys) — one key reaches 400+ models |
| **Anthropic** | Pay-as-you-go | [console.anthropic.com](https://console.anthropic.com/settings/keys) — defaults to `claude-opus-5` |

The model field is free text with suggestions rather than a fixed dropdown, because provider
catalogues move faster than a hardcoded list survives.

### "I have a subscription, not an API key"

**A Claude Pro/Max, ChatGPT Plus or Gemini Advanced subscription cannot be used here** — not by this
app and not by any third-party app. Those plans authenticate a browser session, not an API client:
there is no token to issue and no OAuth flow that would grant one. Anything that claims otherwise is
replaying a session cookie, which breaks on every logout and violates the provider's terms.

That is a limitation of what subscriptions are, not a gap in this app. But **paying is not the
alternative** — there are two genuinely free routes:

- **Run a model locally.** Install [Ollama](https://ollama.com/download), `ollama pull llama3.2`,
  pick **Local (Ollama)**. No key, no account, no cost, no usage limit. Your browser talks to
  `localhost` directly, so the report never touches our server or anyone else's — the most private
  option available, and the only one that works offline. Smaller local models write shorter, blunter
  plans than a frontier model; that is the trade.
- **Get a free Gemini key.** [AI Studio](https://aistudio.google.com/apikey) issues one in about
  thirty seconds with no card. It is still technically an API key, but it costs nothing.

If this page is not served from `localhost`, start Ollama with `OLLAMA_ORIGINS="*" ollama serve` so
the browser is allowed to reach it.

### How the local option differs

Everything else on this page describes the **proxied** providers, where the key goes to
`/api/explain` and the prompt is built server-side from the cached audit. A local runtime inverts
that: the endpoint is on your machine, which this server cannot reach and has no reason to relay
through. So the request goes browser → `localhost` directly and the prompt is assembled client-side.
There is no trust boundary to defend on that path — both ends are you. `/api/explain` rejects
`provider: "local"` outright rather than pretending it could help.

### Where the key lives, and what that costs you

The key is kept in `localStorage` and attached to each request in an `X-Provider-Key` header. The
server holds it only for the lifetime of that request: it is never written to Redis, never logged,
and scrubbed from provider error text before it is echoed back.

The honest trade-off: **`localStorage` is readable by any script running on this origin.** This app
loads no third-party scripts and sets no `script-src` CSP, so an XSS here would expose the key. That
is inherent to any browser-held credential rather than specific to this design, and the blast radius
is one revocable, user-owned provider key — but it is the reason full CSP moved up the roadmap. Use
**Remove key** on a shared machine.

Chat history is never persisted and never leaves the request.

### What the model is told

The prompt is assembled **server-side from the cached audit**, not from the request body. A caller
chooses which report to discuss; it cannot choose what the model is told about it. The digest runs
~1,100 tokens: scores, each Core Web Vital (explicitly flagged when Lighthouse could not measure
it), and every failing audit with its impact, savings estimate and up to three flagged resources.
The system prompt forbids inventing a number that is not in that data.

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
│   ├── api/explain/route.ts   # POST handler — BYOK proxy, streams the model reply
│   ├── page.tsx               # URL input form
│   └── results/page.tsx       # Score rings + metrics + fix cards
├── components/
│   ├── ScoreRing.tsx          # Animated SVG score circle
│   ├── MetricCard.tsx         # Core Web Vital tile
│   ├── FixCard.tsx            # Collapsible fix with code example
│   ├── AiPanel.tsx            # Action plan + chat, reads the streamed response
│   ├── AiSettings.tsx         # Provider / model / API key form
│   └── Markdown.tsx           # ~120-line renderer for the model output subset
├── lib/
│   ├── psi.ts                 # PSI fetch + response shaping
│   ├── nextjs-fixes.ts        # PSI audit ID → Next.js fix map (single source of truth)
│   ├── cache.ts               # Upstash Redis cache, rate limiter, in-flight lock
│   ├── validate.ts            # Zod schema + SSRF blocklist
│   ├── byok.ts                # Browser-held credentials (useSyncExternalStore)
│   ├── ai/                    # Provider registry, SSE parser, per-provider adapters
│   │   ├── client.ts          # Picks the transport: proxy vs browser-direct
│   │   ├── gemini.ts          # streamGenerateContent adapter
│   │   └── openai-compat.ts   # Shared by OpenRouter and local runtimes
│   └── __fixtures__/          # Real PSI responses, trimmed, for tests
└── types/
    ├── analysis.ts            # Shared TypeScript types
    └── ai.ts                  # Provider, chat and error types
```

## Roadmap

- **Shareable result permalinks** — Redis-backed `/r/[id]` routes, server-rendered, with a per-result
  OG card showing the actual scores.
- **Server-side SEO checklist** ([`docs/seo-checklist-spec.md`](docs/seo-checklist-spec.md)) — direct
  HTML inspection covering 22 checks. Deferred pending DNS-level SSRF hardening, which becomes
  mandatory once this server fetches a submitted URL itself.
- **Full CSP** — deferred, but no longer cosmetic. With BYOK shipped there is now a credential in
  `localStorage`, and without a `script-src` policy an XSS on this origin could read it. See the
  note under *Bring your own model*.
