# Architecture

Nextvital takes a URL, runs it through the PageSpeed Insights API, and translates the failed
Lighthouse audits into fixes written against Next.js APIs. This document covers the decisions
behind that pipeline — the *why*, not the *what*. The code is the reference for the what.

---

## Request flow

```
POST /api/analyze  { url, strategy }
  │
  ├─ 1. Validate + normalize        Zod coerces a bare domain to https, canonicalizes the URL
  │
  ├─ 2. SSRF guard                  reject private, reserved, and internal hostnames
  │
  ├─ 3. Cache lookup ──── hit ────► return immediately (no quota consumed)
  │        miss
  ├─ 4. Per-IP rate limit           5 live audits per hour
  │
  ├─ 5. In-flight lock              SET NX — one PSI call per URL at a time
  │
  ├─ 6. Global daily budget         500 PSI calls per day across all callers
  │
  ├─ 7. PageSpeed Insights          40s timeout, performance + SEO + accessibility
  │
  ├─ 8. Shape + enrich              extract metrics, split audits, attach Next.js fixes
  │
  └─ 9. Cache (24h) + return        lock released in a finally, whatever happened
```

The ordering is the design. Each step below explains why it sits where it does.

---

## Why the cache is checked before the rate limit

A cached response costs one Redis read. Charging a caller an audit for it would penalize exactly
the behavior the product wants — sharing a result link with a colleague. Someone opening a link
that has already been audited should get it instantly and for free, and should still have all five
of their own audits available.

The same reasoning puts the cache ahead of the global daily budget: a cache hit spends nothing, so
it should not count against a limit that exists to cap spending.

## Why the rate limiter uses `EXPIRE … NX`

The obvious implementation has a bug that only shows up under load:

```ts
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, WINDOW);
```

Two problems. First, it's two round trips with no atomicity — if the process dies between them, the
key exists with no expiry and that IP is rate-limited forever. Second, any implementation that
calls `EXPIRE` unconditionally slides the window forward on every request, so a caller making
steady requests never sees it reset.

The fix is a single pipelined round trip where the expiry is conditional on there not already
being one:

```ts
const pipeline = redis.pipeline();
pipeline.incr(key);
pipeline.expire(key, RATE_LIMIT_WINDOW, "NX");  // only if no TTL is set
await pipeline.exec();
```

`NX` makes the window fixed rather than sliding, and folding both commands into one pipeline
removes the window where a crash could strand the key.

## Why every Redis path fails open

Every function in `src/lib/cache.ts` catches its own errors and returns a permissive default: cache
reads return `null`, rate limit checks return `allowed`, the daily cap returns `true`, the lock
returns "acquired".

Upstash being unreachable should degrade the service to "slower and unmetered", not "down". The
failure mode this trades into — an unmetered burst of PSI calls during a Redis outage — is bounded
by the PSI quota itself and is far less bad than refusing every request. This is a deliberate
availability-over-enforcement choice, and it's the right one for a free public tool with no
authentication.

## Why there's an in-flight lock

Post a result link somewhere and several people click it at once. Without coordination, every one
of those requests misses the cold cache and fires its own 20-40 second PSI call for the same URL —
a classic cache stampede against a rate-limited upstream.

The first caller takes a lock (`SET inflight:<key> 1 NX EX 65`) and the rest get a `409` telling
them to retry in a few seconds, by which point the cache is warm.

`SET NX` is atomic, so acquiring the lock *is* the check — an earlier version probed with `EXISTS`
first, which was both a wasted round trip and a time-of-check/time-of-use race where two callers
could both see "no lock" and both proceed.

The lock is released in a `finally` covering every path after acquisition, including a throw from
the shaping layer. It also carries a 65-second TTL as a backstop, slightly longer than the 40s PSI
timeout, so a hard crash can't strand it.

Note that the loser of the race must *not* release the lock — it doesn't own it. That's why the
`409` returns before entering the `try`.

## Why the daily budget is counted last

The global cap protects the shared PSI quota, so it should count PSI calls. Incrementing it earlier
in the pipeline meant requests that never reached PSI — ones rejected by the rate limiter, or that
lost the in-flight race — still spent the day's budget. A single caller hammering the endpoint
could exhaust the global cap while being told they were rate-limited.

It now sits immediately before `runPSI`, the only thing that actually spends the resource it
guards.

---

## The SSRF threat model

`isBlockedUrl` in `src/lib/validate.ts` rejects a URL when any of these hold:

- the scheme isn't `http:` or `https:` — blocks `file:`, `data:`, `gopher:`
- the host matches a private or reserved range — loopback, RFC 1918, link-local (including
  `169.254.169.254`, the cloud instance metadata endpoint), CGNAT, multicast, and reserved space
- the host is an IPv6 address in those ranges, checked after stripping the brackets the WHATWG URL
  parser wraps them in
- the host is an IPv4-mapped IPv6 address (`::ffff:127.0.0.1`) whose embedded IPv4 is blocked
- the host ends in `.internal`, `.local`, `.localhost`, or `.home.arpa`
- the host has neither a dot nor a colon — a bare name like `http://metadata/`, which is a live
  alias for the GCP metadata server, only resolves inside an internal network

**What it does not do:** resolve DNS. A public hostname whose A record points at `127.0.0.1` — the
`localtest.me` family — passes every check above. Closing that requires resolving the host and
re-checking each returned address, and then handling the rebinding window between our resolution
and the fetch.

That gap is acceptable *here* specifically because this server never fetches the submitted URL.
Google's infrastructure does. The blocklist is defence in depth and a guard against wasting quota
on unreachable addresses, not the only thing standing between a caller and a private network. If
Nextvital ever fetches a URL directly — which the deferred SEO checklist in
[`seo-checklist-spec.md`](./seo-checklist-spec.md) would require — DNS-level validation becomes
mandatory before that ships.

---

## Reading a Lighthouse response

### Audit IDs are a moving target

This is the sharpest edge in the project. Lighthouse 13 retired most of the classic "opportunity"
audits and replaced them with Insight audits:

| Retired | Lighthouse 13 replacement |
|---|---|
| `uses-optimized-images`, `efficient-animated-content` | `image-delivery-insight` |
| `render-blocking-resources` | `render-blocking-insight` |
| `largest-contentful-paint-element`, `preload-lcp-image` | `lcp-discovery-insight` |
| `uses-long-cache-ttl` | `cache-insight` |
| `dom-size` | `dom-size-insight` |
| `third-party-summary` | `third-parties-insight` |
| `uses-rel-preconnect` | `network-dependency-tree-insight` |
| `font-display` | `font-display-insight` |
| `uses-text-compression` | `document-latency-insight` |
| `uses-passive-event-listeners` | `forced-reflow-insight` |

When an audit ID disappears, **PSI does not error — it simply omits the key**. The corresponding
fix stops firing and nothing anywhere reports a problem. The product quietly loses a feature.

Two things guard against this:

1. `AUDIT_IDS` is derived from `Object.keys(NEXTJS_FIX_MAP)` rather than maintained as a separate
   list, so `psi.ts` and `nextjs-fixes.ts` cannot disagree about which audits the app understands.
2. `nextjs-fixes.test.ts` pins every key in the map against two captured PSI responses. An ID that
   Lighthouse no longer emits fails the build.

The fixtures in `src/lib/__fixtures__/` are real PSI responses trimmed to the fields the shaping
layer reads — about 20KB each instead of 500KB. `psi-fast.json` is a well-optimized site
(nextjs.org, performance 86) and `psi-slow.json` is a heavy one (performance 51, accessibility 68),
so both the passing and failing paths are covered by real data rather than hand-written mocks.

### `scoreDisplayMode`, not a hardcoded list

How to interpret an audit's result depends on its `scoreDisplayMode`:

| Mode | Meaning | Handling |
|---|---|---|
| `binary`, `numeric`, `metricSavings` | a real 0–1 score | fail below 0.9 |
| `informative` | no pass/fail concept | surface only when it carries a savings estimate |
| `notApplicable`, `manual`, `error` | Lighthouse did not evaluate this page | ignore entirely |

The `notApplicable` handling matters for honesty. An earlier version treated any unscored audit as
passing, which put `structured-data` — permanently `manual`, never actually scored — in the
"Already optimized" list. The app was telling users a check had succeeded when Lighthouse had never
run it. Unevaluated audits now appear in neither list.

`informative` audits get the same treatment in reverse: `third-parties-insight` always has items on
any site that loads a third-party script, so keying off item presence would fire on nearly
everything. It's only reported when Lighthouse attaches an estimated saving.

### Savings estimates

Lighthouse 13 dropped `details.overallSavingsMs` from most audits in favour of a per-metric
`metricSavings` object. `getSavingsMs` reads the new field first — taking the largest of the
time-denominated metrics (LCP, FCP, TBT, INP) — and falls back to the legacy field, which a few
classic opportunity audits still carry.

CLS savings are deliberately excluded: CLS is a unitless score, and rendering it as "0.05 ms saved"
would be nonsense.

### INP comes from field data

Lighthouse cannot measure Interaction to Next Paint in a lab run — there are no real interactions
to observe — so the audit is absent from the response entirely. PSI returns CrUX field data
alongside the lab result, and the shaper falls back to the `INTERACTION_TO_NEXT_PAINT` percentile,
tagging the metric `source: "field"` so the UI can distinguish it. Sites without enough CrUX traffic
get `hasData: false` rather than a fabricated zero.

---

## Caching and keys

| Key | TTL | Purpose |
|---|---|---|
| `analysis:<strategy>:<base64url(url)>` | 24h | shaped result |
| `ratelimit:<ip>` | 1h | per-IP request count |
| `global:psi:<YYYY-MM-DD>` | 26h | daily PSI call count |
| `inflight:analysis:<…>` | 65s | one PSI call per URL |

URLs are canonicalized by `normalizeUrl` before keying — lowercase host, fragment stripped,
trailing slash removed — so `EXAMPLE.com/docs/#intro` and `https://example.com/docs` share one cache
entry instead of two. The key is base64url rather than base64 so it contains no `/` or `+`.

The daily counter uses a 26-hour TTL on a UTC date key so it can't expire early at a timezone
boundary.

---

## Testing

Everything worth testing in this codebase is a pure function, so the suite needs no DOM, no
Testing Library, and no jsdom — `vitest` is the only test dependency.

- **`validate.test.ts`** — the SSRF blocklist, table-driven across private ranges, IPv6 forms,
  schemes, and internal hostnames, plus the public addresses that must keep working.
- **`psi.test.ts`** — the shaping layer against both fixtures, plus synthetic single-audit
  responses for behaviors real data doesn't happen to contain.
- **`nextjs-fixes.test.ts`** — the fixture-drift guard above, and content invariants on every fix.
- **`cache.test.ts`** — Redis mocked at the module boundary; asserts the pipeline shape and that
  every path fails open.
- **`route.test.ts`** — the ordering guarantees, which is where the interesting bugs live: cache
  hits bypassing quota, the daily budget not being spent on rejected requests, and the lock being
  released on every exit path including a throw from the shaping layer.
