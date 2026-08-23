import type { AuditItem, NextjsFix, PassingCheck } from "@/types/analysis";

// Map from PSI audit ID → Next.js-specific fix.
//
// IMPORTANT: these keys must be audit IDs that the *current* Lighthouse release
// actually emits. Lighthouse 13 replaced most of the classic "opportunity"
// audits (uses-optimized-images, render-blocking-resources, dom-size, …) with
// Insight audits ending in "-insight". An ID that no longer exists fails
// silently — PSI simply omits it, so the fix never fires and nobody notices.
// src/lib/nextjs-fixes.test.ts pins every key in this map against a real PSI
// response fixture to make that failure loud.

interface FixDefinition extends Omit<NextjsFix, "audit" | "savingsMs" | "auditItems"> {
  /** Shown in the "Already optimized" list when this audit passes. */
  passingLabel: string;
}

export const NEXTJS_FIX_MAP: Record<string, FixDefinition> = {
  // ---------------------------------------------------------------- performance

  "image-delivery-insight": {
    title: "Serve images through next/image",
    impact: "high",
    category: "performance",
    passingLabel: "Images are optimized and correctly sized",
    problem:
      "Images are being delivered larger or in older formats than they need to be. Next.js can resize, compress, and serve AVIF/WebP automatically.",
    fix: "Replace every <img> tag with the Next.js <Image> component. Give it explicit width and height (or fill with a sized parent), add sizes so the browser picks the right candidate on mobile, and add priority to the above-the-fold image.",
    codeExample: `// Before
<img src="/hero.jpg" alt="Hero" />

// After
import Image from 'next/image'

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  sizes="(max-width: 768px) 100vw, 1200px"
  priority          // only on the LCP image
/>`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image",
  },

  "render-blocking-insight": {
    title: "Remove render-blocking CSS and fonts",
    impact: "high",
    category: "performance",
    passingLabel: "Nothing blocks the first render",
    problem:
      "Stylesheets or font requests are blocking the first paint. The browser cannot render anything until they finish downloading.",
    fix: "Load fonts through next/font instead of a <link> to Google Fonts — it self-hosts the file, inlines the @font-face rule, and removes the blocking request entirely. For CSS, keep global stylesheets small and move component styles into CSS Modules so they ship with the component that needs them.",
    codeExample: `// Before — a blocking request to fonts.googleapis.com
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />

// After — self-hosted, zero network requests, no layout shift
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export default function RootLayout({ children }) {
  return <html className={inter.className}>{children}</html>
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/font",
  },

  "lcp-discovery-insight": {
    title: "Let the browser discover your LCP image sooner",
    impact: "high",
    category: "performance",
    passingLabel: "LCP image is discovered immediately",
    problem:
      "The Largest Contentful Paint image was found late — it is lazy-loaded, injected by client JavaScript, or buried behind a CSS background rule, so the browser could not start fetching it until well into the load.",
    fix: "Render the LCP image with next/image and set priority. That emits a <link rel='preload'> in the document head and opts the image out of lazy loading. Never set loading='lazy' on an above-the-fold image, and avoid rendering the hero from a client component that only mounts after hydration.",
    codeExample: `import Image from 'next/image'

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority           // ← preloads, and disables lazy loading
/>`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image#priority",
  },

  "unused-javascript": {
    title: "Code-split heavy components with next/dynamic",
    impact: "high",
    category: "performance",
    passingLabel: "JavaScript bundle is lean",
    problem:
      "A significant share of the JavaScript in the initial bundle is never executed on this page. Heavy client components and third-party libraries are being shipped upfront whether or not they render.",
    fix: "Lazy-load anything not needed for the first paint with next/dynamic — charts, editors, date pickers, modals, maps. Keep components as Server Components wherever they don't need state or effects, since Server Components ship no JavaScript at all.",
    codeExample: `import dynamic from 'next/dynamic'

// Before — always in the initial bundle
import HeavyChart from './HeavyChart'

// After — fetched only when it actually renders
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,   // if it touches window/document
})`,
    docsUrl: "https://nextjs.org/docs/app/guides/lazy-loading",
  },

  "document-latency-insight": {
    title: "Fix slow server response, redirects, or missing compression",
    impact: "high",
    category: "performance",
    passingLabel: "Document is served fast and compressed",
    problem:
      "The initial HTML document is slow to arrive. Lighthouse flags one of three causes: the server took too long to respond, the request was redirected before it landed, or the response was not compressed.",
    fix: "Compression is on by default in Next.js (compress: true) — if you're behind a custom server or proxy, enable gzip/brotli there. Collapse redirect chains in next.config.ts so visitors land on the final URL in one hop. For slow responses, move data fetching into async Server Components and cache it, rather than blocking the document on a database round trip.",
    codeExample: `// next.config.ts
const nextConfig = {
  compress: true,              // default, but be explicit
  async redirects() {
    return [
      // one hop, not two: /old → /new (not /old → /mid → /new)
      { source: '/old', destination: '/new', permanent: true },
    ]
  },
}
export default nextConfig`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/config/next-config-js/compress",
  },

  "server-response-time": {
    title: "Move data fetching to Server Components or add ISR",
    impact: "high",
    category: "performance",
    passingLabel: "Server responds quickly (TTFB)",
    problem:
      "Your server is slow to send the first byte. This is almost always a slow database query or upstream API call running on every single request.",
    fix: "Fetch data in async Server Components so it happens on the server, close to your data. Then stop doing it per-request: give the fetch a revalidate window so the rendered result is reused, and wrap anything genuinely slow in <Suspense> so the rest of the page streams immediately instead of waiting.",
    codeExample: `// Rebuild this page at most once a minute, serve it instantly in between
export const revalidate = 60

export default async function Page() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 60 },
  })
  const data = await res.json()
  return <Dashboard data={data} />
}`,
    docsUrl: "https://nextjs.org/docs/app/guides/incremental-static-regeneration",
  },

  "cls-culprits-insight": {
    title: "Reserve space for images, fonts, and late-loading content",
    impact: "high",
    category: "performance",
    passingLabel: "Layout stays stable during load",
    problem:
      "Page content is jumping around as it loads. Layout shift is usually caused by images without dimensions, web fonts swapping in at a different size, or client-side content injected above existing elements.",
    fix: "Always give next/image explicit width and height, or use fill inside a parent with a fixed aspect ratio — Next.js then reserves the box before the image arrives. next/font eliminates font-swap shift by matching fallback metrics automatically. For content that loads late (banners, ads, consent bars), reserve its height in CSS up front.",
    codeExample: `// Reserve the box before the image loads
<div className="relative aspect-video">
  <Image src="/cover.jpg" alt="" fill className="object-cover" />
</div>

// next/font matches fallback metrics, so no shift when the font swaps
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], display: 'swap' })`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/font",
  },

  "legacy-javascript-insight": {
    title: "Stop shipping polyfills modern browsers don't need",
    impact: "medium",
    category: "performance",
    passingLabel: "No unnecessary legacy JavaScript",
    problem:
      "The bundle contains transpiled helpers and polyfills for features every browser you target already supports natively. That's dead weight parsed and executed on every load.",
    fix: "Next.js already ships a modern build to modern browsers. The usual culprit is a dependency bundling its own polyfills, or a browserslist entry that still targets dead browsers. Set an explicit modern browserslist in package.json, and check for core-js showing up in your bundle analysis.",
    codeExample: `// package.json — drop the browsers you don't actually support
{
  "browserslist": [
    "chrome 111",
    "edge 111",
    "firefox 111",
    "safari 16.4"
  ]
}`,
    docsUrl: "https://nextjs.org/docs/app/guides/package-bundling",
  },

  "duplicated-javascript-insight": {
    title: "Deduplicate modules bundled more than once",
    impact: "medium",
    category: "performance",
    passingLabel: "No duplicated bundled modules",
    problem:
      "The same module is included in multiple chunks, so visitors download the same code more than once. This usually means two dependencies pulled in different versions of a shared library.",
    fix: "Run npm ls <package> to find the version conflict and dedupe it, or pin a single version with an overrides entry in package.json. For large libraries that only run on the server, add them to serverExternalPackages so they never enter the client bundle at all.",
    codeExample: `// package.json — force one copy of a duplicated dependency
{
  "overrides": {
    "date-fns": "^4.1.0"
  }
}

// next.config.ts — keep server-only deps out of the client bundle
const nextConfig = {
  serverExternalPackages: ['heavy-server-only-lib'],
}`,
    docsUrl: "https://nextjs.org/docs/app/guides/package-bundling",
  },

  "cache-insight": {
    title: "Set long cache lifetimes on static assets",
    impact: "medium",
    category: "performance",
    passingLabel: "Static assets are cached aggressively",
    problem:
      "Static assets are served with short or missing cache lifetimes, so returning visitors re-download files that never changed.",
    fix: "Next.js already sets immutable, one-year caching on everything under /_next/static — those filenames are content-hashed, so it's safe. Files you serve from /public are not hashed and get no such header; add one yourself in next.config.ts for the directories whose contents are stable.",
    codeExample: `// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/config/next-config-js/headers",
  },

  "third-parties-insight": {
    title: "Load third-party scripts with next/script",
    impact: "medium",
    category: "performance",
    passingLabel: "Third-party scripts are lightweight",
    problem:
      "Third-party scripts — analytics, chat widgets, tag managers, embeds — are consuming a meaningful share of main-thread time and network bandwidth.",
    fix: "Load them through next/script with the right strategy: afterInteractive for analytics, lazyOnload for chat widgets and anything below the fold. For Google Analytics, GTM, or YouTube embeds, use @next/third-parties, which ships tuned loading behavior for each.",
    codeExample: `import Script from 'next/script'

// Runs after the page is interactive, not during load
<Script src="https://analytics.example.com/s.js" strategy="afterInteractive" />

// Waits for browser idle — right for chat widgets
<Script src="https://widget.example.com/w.js" strategy="lazyOnload" />`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/script",
  },

  "network-dependency-tree-insight": {
    title: "Shorten the critical request chain",
    impact: "medium",
    category: "performance",
    passingLabel: "Critical request chain is short",
    problem:
      "Resources needed for the first paint are discovered in sequence rather than in parallel — each request has to finish before the browser learns about the next one.",
    fix: "Add preconnect hints for third-party origins you always load from, so DNS, TCP, and TLS are already done when the request goes out. Use next/font (which removes the font chain entirely) and preload the LCP image via priority so it isn't waiting behind a stylesheet.",
    codeExample: `// src/app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://cdn.example.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/font",
  },

  "font-display-insight": {
    title: "Set font-display so text renders immediately",
    impact: "medium",
    category: "performance",
    passingLabel: "Fonts render text without blocking",
    problem:
      "Web fonts are hiding text while they download. Visitors stare at blank space where your copy should be.",
    fix: "next/font sets display: 'swap' for you and preloads the font file, so text paints in a fallback immediately and swaps without shifting. If you're loading fonts by hand in CSS, add font-display: swap to every @font-face rule.",
    codeExample: `import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',    // paint text immediately in the fallback
})`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/font",
  },

  "unsized-images": {
    title: "Give every image explicit dimensions",
    impact: "medium",
    category: "performance",
    passingLabel: "All images have explicit dimensions",
    problem:
      "Images are rendering without width and height, so the browser cannot reserve space for them and the page reflows once each one arrives.",
    fix: "next/image requires width and height precisely to prevent this — pass them for local or remote images, or use fill when the parent controls the size. Statically imported images carry their dimensions automatically.",
    codeExample: `import Image from 'next/image'
import cover from './cover.png'   // dimensions come along for free

<Image src={cover} alt="Cover" placeholder="blur" />

// Remote images need them stated explicitly
<Image src="https://cdn.example.com/cover.png" alt="Cover" width={800} height={600} />`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image#width-and-height",
  },

  "dom-size-insight": {
    title: "Reduce DOM size with virtualization or pagination",
    impact: "medium",
    category: "performance",
    passingLabel: "DOM size is manageable",
    problem:
      "The page renders an unusually large number of DOM nodes, which slows style recalculation, layout, and every subsequent interaction.",
    fix: "Virtualize long lists so only the visible rows exist in the DOM. For tables, paginate on the server and fetch a page at a time in a Server Component. Avoid rendering large off-screen sections that a user may never open.",
    codeExample: `'use client'
import { useVirtualizer } from '@tanstack/react-virtual'

// Renders ~20 rows instead of 10,000
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48,
})`,
    docsUrl: "https://tanstack.com/virtual/latest",
  },

  "bootup-time": {
    title: "Cut JavaScript execution time",
    impact: "medium",
    category: "performance",
    passingLabel: "JavaScript execution time is low",
    problem:
      "Parsing, compiling, and executing JavaScript is occupying the main thread long enough to delay interactivity.",
    fix: "The most effective lever in the App Router is shipping less client JavaScript: keep components on the server by default and push 'use client' as far down the tree as possible. A component that only needs interactivity in one button shouldn't turn its whole subtree into client code.",
    codeExample: `// Server Component — ships zero JS
export default async function ProductPage({ params }) {
  const product = await getProduct((await params).id)
  return (
    <article>
      <ProductDetails product={product} />   {/* still server */}
      <AddToCartButton id={product.id} />    {/* only this is 'use client' */}
    </article>
  )
}`,
    docsUrl: "https://nextjs.org/docs/app/getting-started/server-and-client-components",
  },

  "long-tasks": {
    title: "Break up long main-thread tasks",
    impact: "medium",
    category: "performance",
    passingLabel: "No long main-thread tasks",
    problem:
      "Individual JavaScript tasks are running long enough to block the main thread, so clicks and taps during that window feel unresponsive.",
    fix: "Find the work with the Performance panel, then move it off the critical path: hydrate less by keeping components server-side, defer non-urgent state updates with useTransition, and lazy-load the libraries responsible with next/dynamic.",
    codeExample: `'use client'
import { useTransition } from 'react'

const [isPending, startTransition] = useTransition()

// Keeps the input responsive while the expensive re-render happens
startTransition(() => setFilter(value))`,
    docsUrl: "https://nextjs.org/docs/app/guides/lazy-loading",
  },

  "redirects": {
    title: "Collapse redirect chains",
    impact: "medium",
    category: "performance",
    passingLabel: "No wasteful redirects",
    problem:
      "The page was reached through one or more redirects. Every hop is a full round trip before anything can start rendering.",
    fix: "Declare redirects in next.config.ts so they're handled at the edge rather than by a client-side navigation, and make each one point straight at the final destination instead of chaining through intermediate URLs.",
    codeExample: `// next.config.ts
const nextConfig = {
  async redirects() {
    return [
      { source: '/blog/:slug', destination: '/posts/:slug', permanent: true },
    ]
  },
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects",
  },

  "unused-css-rules": {
    title: "Trim unused CSS",
    impact: "low",
    category: "performance",
    passingLabel: "No significant unused CSS",
    problem: "A large share of the delivered CSS is never applied to this page.",
    fix: "With Tailwind v4, make sure your @source directives point only at directories that actually contain class names — a path that reaches node_modules will pull in enormous amounts of dead CSS. For hand-written styles, prefer CSS Modules so each stylesheet ships with the component that imports it.",
    codeExample: `/* globals.css — Tailwind v4 scans these paths for class names */
@import "tailwindcss";

@source "./src/app";
@source "./src/components";
/* Don't point @source at the project root — it will scan node_modules */`,
    docsUrl: "https://tailwindcss.com/docs/detecting-classes-in-source-files",
  },

  "forced-reflow-insight": {
    title: "Avoid forced synchronous layout",
    impact: "low",
    category: "performance",
    passingLabel: "No forced synchronous layouts",
    problem:
      "JavaScript is reading a layout property (offsetHeight, getBoundingClientRect) right after writing to the DOM, forcing the browser to recompute layout mid-frame.",
    fix: "Batch reads before writes rather than interleaving them. Mark scroll and touch listeners passive so they can't block scrolling, and prefer transform and opacity for animation since neither triggers layout.",
    codeExample: `// Bad — read, write, read, write forces layout each time
items.forEach((el) => { el.style.height = el.offsetHeight + 10 + 'px' })

// Good — all reads, then all writes
const heights = items.map((el) => el.offsetHeight)
items.forEach((el, i) => { el.style.height = heights[i] + 10 + 'px' })

window.addEventListener('scroll', onScroll, { passive: true })`,
    docsUrl: "https://developer.chrome.com/docs/lighthouse/performance/",
  },

  "total-byte-weight": {
    title: "Reduce total page weight",
    impact: "low",
    category: "performance",
    passingLabel: "Page weight is reasonable",
    problem:
      "The page transfers a large total payload, which is slow and expensive on mobile data.",
    fix: "Images are almost always the bulk of it — next/image with AVIF/WebP typically cuts them by more than half. After that, check your bundle with @next/bundle-analyzer and lazy-load whatever isn't needed for the first screen.",
    codeExample: `// next.config.ts — inspect what's actually in your bundles
import withBundleAnalyzer from '@next/bundle-analyzer'

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })({
  images: { formats: ['image/avif', 'image/webp'] },
})`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image",
  },

  // ----------------------------------------------------------------------- seo

  "document-title": {
    title: "Set a page title with the metadata export",
    impact: "high",
    category: "seo",
    passingLabel: "Page title is set",
    problem:
      "The page has no <title>. It's the single strongest on-page ranking signal and it's what shows in search results and browser tabs.",
    fix: "Export a metadata object from the route's layout.tsx or page.tsx. Use a title.template in the root layout so every child page gets consistent branding without repeating it.",
    codeExample: `// src/app/layout.tsx
export const metadata = {
  title: {
    default: 'Acme — Fast, modern storefronts',
    template: '%s · Acme',
  },
}

// src/app/pricing/page.tsx → renders "Pricing · Acme"
export const metadata = { title: 'Pricing' }`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/functions/generate-metadata",
  },

  "meta-description": {
    title: "Add a meta description",
    impact: "medium",
    category: "seo",
    passingLabel: "Meta description is present",
    problem:
      "The page has no meta description, so search engines invent a snippet from whatever page text they find.",
    fix: "Add description to the metadata export. For dynamic routes, use generateMetadata so each page describes its own content rather than repeating a site-wide blurb.",
    codeExample: `// Static route
export const metadata = {
  description: 'Compare Acme plans and pricing for teams of any size.',
}

// Dynamic route
export async function generateMetadata({ params }) {
  const post = await getPost((await params).slug)
  return { title: post.title, description: post.excerpt }
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/functions/generate-metadata",
  },

  "html-has-lang": {
    title: "Set the lang attribute on <html>",
    impact: "medium",
    category: "seo",
    passingLabel: "HTML lang attribute is set",
    problem:
      "The <html> element has no lang attribute. Screen readers need it to choose a pronunciation, and search engines use it to target the right audience.",
    fix: "Add lang to the <html> element in your root layout. It's a one-line change in src/app/layout.tsx.",
    codeExample: `// src/app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/file-conventions/layout",
  },

  "canonical": {
    title: "Declare a canonical URL",
    impact: "medium",
    category: "seo",
    passingLabel: "Canonical URL is declared",
    problem:
      "The page has no canonical link, or points at the wrong one. Without it, the same content reachable at several URLs competes with itself in search rankings.",
    fix: "Set metadataBase once in the root layout, then give each route a relative alternates.canonical — Next.js resolves it into an absolute URL for you.",
    codeExample: `// src/app/layout.tsx
export const metadata = {
  metadataBase: new URL('https://acme.com'),
}

// src/app/pricing/page.tsx → https://acme.com/pricing
export const metadata = {
  alternates: { canonical: '/pricing' },
}`,
    docsUrl:
      "https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase",
  },

  "robots-txt": {
    title: "Generate robots.txt from code",
    impact: "medium",
    category: "seo",
    passingLabel: "robots.txt is valid",
    problem: "robots.txt is missing or malformed, so crawlers are guessing at what they may index.",
    fix: "Add src/app/robots.ts and export a config object. Next.js generates the file at build time, which means it lives in version control and can reference the same environment variables as the rest of your app.",
    codeExample: `// src/app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://acme.com/sitemap.xml',
  }
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots",
  },

  "is-crawlable": {
    title: "Let search engines index the page",
    impact: "high",
    category: "seo",
    passingLabel: "Page is indexable",
    problem:
      "The page is blocking indexing through a noindex directive or a robots.txt rule. It cannot appear in search results at all.",
    fix: "Check for a robots entry in your metadata export that sets index: false, and for a disallow rule in src/app/robots.ts covering this path. A staging-only noindex accidentally shipped to production is the usual cause.",
    codeExample: `// Make sure production isn't inheriting a staging noindex
export const metadata = {
  robots: {
    index: process.env.VERCEL_ENV === 'production',
    follow: true,
  },
}`,
    docsUrl:
      "https://nextjs.org/docs/app/api-reference/functions/generate-metadata#robots",
  },

  "crawlable-anchors": {
    title: "Use next/link for navigation",
    impact: "medium",
    category: "seo",
    passingLabel: "Links are crawlable",
    problem:
      "Some links aren't crawlable — they're click handlers on non-anchor elements, or anchors with no resolvable href. Crawlers can't follow them, so those pages may never be discovered.",
    fix: "Navigate with the next/link component, which renders a real <a href>. Reserve router.push for genuine post-action redirects. Never simulate a link with an onClick on a div or button.",
    codeExample: `import Link from 'next/link'

// Bad — invisible to crawlers, and unusable with a keyboard
<div onClick={() => router.push('/pricing')}>Pricing</div>

// Good — a real anchor, prefetched on hover
<Link href="/pricing">Pricing</Link>`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/link",
  },

  "link-text": {
    title: "Write descriptive link text",
    impact: "low",
    category: "seo",
    passingLabel: "Link text is descriptive",
    problem:
      "Links use generic text like 'click here', 'read more', or a bare URL. Both crawlers and screen reader users rely on link text to understand the destination.",
    fix: "Describe the destination in the link itself. When the visible text has to stay short for layout reasons, add an aria-label carrying the full description.",
    codeExample: `// Before
<Link href="/pricing">Read more</Link>

// After
<Link href="/pricing">Compare Acme pricing plans</Link>

// Or when layout constrains the visible text
<Link href="/pricing" aria-label="Compare Acme pricing plans">More →</Link>`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/link",
  },

  "hreflang": {
    title: "Declare language alternates",
    impact: "low",
    category: "seo",
    passingLabel: "Language alternates are valid",
    problem:
      "This page has localized versions but no valid hreflang annotations, so search engines may serve the wrong language to a visitor.",
    fix: "List the alternates in metadata.alternates.languages. Combined with metadataBase, Next.js emits the full set of hreflang link tags.",
    codeExample: `export const metadata = {
  alternates: {
    canonical: '/pricing',
    languages: {
      'en-US': '/en-US/pricing',
      'de-DE': '/de-DE/pricing',
    },
  },
}`,
    docsUrl: "https://nextjs.org/docs/app/guides/internationalization",
  },

  "meta-viewport": {
    title: "Add a viewport meta tag",
    impact: "medium",
    category: "seo",
    passingLabel: "Viewport is configured for mobile",
    problem:
      "The page has no viewport meta tag, so mobile browsers render it at desktop width and then scale it down. Text ends up unreadably small.",
    fix: "Export a viewport object from your root layout. Next.js adds a sensible default, so seeing this fail usually means something overrode it — check for a hand-written <meta name='viewport'> that sets user-scalable=no or a fixed width.",
    codeExample: `// src/app/layout.tsx
import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}`,
    docsUrl:
      "https://nextjs.org/docs/app/api-reference/functions/generate-viewport",
  },

  // ------------------------------------------------------------- accessibility

  "image-alt": {
    title: "Give every image alt text",
    impact: "high",
    category: "accessibility",
    passingLabel: "All images have alt text",
    problem:
      "Images are missing alt attributes. Screen reader users get a filename read aloud, or nothing at all.",
    fix: "next/image requires alt, so this usually points at a raw <img> somewhere. Describe what the image conveys, not what it depicts — and use alt=\"\" deliberately for purely decorative images so assistive tech skips them.",
    codeExample: `// Meaningful image — describe its purpose
<Image src="/chart.png" alt="Revenue grew 40% between Q1 and Q4 2025" width={600} height={400} />

// Decorative only — empty alt tells screen readers to skip it
<Image src="/flourish.svg" alt="" width={24} height={24} />`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image#alt",
  },

  "color-contrast": {
    title: "Raise contrast to meet WCAG AA",
    impact: "high",
    category: "accessibility",
    passingLabel: "Color contrast meets WCAG AA",
    problem:
      "Some text doesn't have enough contrast against its background. WCAG AA requires 4.5:1 for body text and 3:1 for large text.",
    fix: "Check the flagged pairs and darken the foreground or lighten the background until they pass. Muted secondary text and placeholder colors are the usual offenders — and remember to check both light and dark themes, since a token that passes in one often fails in the other.",
    codeExample: `/* Tailwind's lighter grays fail on white at body size */
/* text-gray-400 on white → 2.8:1  ✗ */
/* text-gray-600 on white → 5.7:1  ✓ */

<p className="text-gray-600 dark:text-gray-300">Secondary text</p>`,
    docsUrl: "https://webaim.org/resources/contrastchecker/",
  },

  "link-name": {
    title: "Give every link an accessible name",
    impact: "high",
    category: "accessibility",
    passingLabel: "All links have accessible names",
    problem:
      "Some links have no discernible text — typically an icon-only link with nothing but an SVG inside. A screen reader announces it as just 'link'.",
    fix: "Add an aria-label to icon-only links, and mark the icon itself aria-hidden so it isn't announced twice.",
    codeExample: `<Link href="https://github.com/acme" aria-label="Acme on GitHub">
  <GithubIcon aria-hidden="true" />
</Link>`,
    docsUrl: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label",
  },

  "button-name": {
    title: "Give every button an accessible name",
    impact: "high",
    category: "accessibility",
    passingLabel: "All buttons have accessible names",
    problem:
      "Some buttons have no text content. Icon-only controls — close, menu, search — are announced as an unlabeled 'button'.",
    fix: "Add aria-label describing the action, and hide the decorative icon from assistive technology.",
    codeExample: `<button onClick={close} aria-label="Close dialog">
  <XIcon aria-hidden="true" />
</button>`,
    docsUrl: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label",
  },

  "heading-order": {
    title: "Fix the heading hierarchy",
    impact: "medium",
    category: "accessibility",
    passingLabel: "Heading order is logical",
    problem:
      "Heading levels skip — an <h1> followed by an <h4>, for instance. Screen reader users navigate by heading, and gaps make the page structure incoherent.",
    fix: "Choose heading levels by document structure, not by how large you want the text to be. One <h1> per page, then descend one level at a time; use Tailwind classes for the visual size.",
    codeExample: `// Bad — skips h2 and h3 to get smaller text
<h1>Pricing</h1>
<h4>Team plan</h4>

// Good — correct level, styled to taste
<h1>Pricing</h1>
<h2 className="text-base font-semibold">Team plan</h2>`,
    docsUrl: "https://www.w3.org/WAI/tutorials/page-structure/headings/",
  },

  "target-size": {
    title: "Make tap targets big enough",
    impact: "medium",
    category: "accessibility",
    passingLabel: "Tap targets are large enough",
    problem:
      "Some interactive elements are too small or too close together to tap reliably. WCAG asks for at least 24×24 CSS pixels.",
    fix: "Give small controls padding rather than growing the icon — the hit area is what matters, not the glyph. 44×44 is the comfortable target on touch devices.",
    codeExample: `// Before — a 16px icon is a 16px hit area
<button><XIcon className="w-4 h-4" /></button>

// After — same icon, 40px hit area
<button className="p-3 -m-3">
  <XIcon className="w-4 h-4" aria-hidden="true" />
</button>`,
    docsUrl: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
  },

  "html-lang-valid": {
    title: "Use a valid lang value",
    impact: "low",
    category: "accessibility",
    passingLabel: "HTML lang value is valid",
    problem:
      "The lang attribute on <html> isn't a valid BCP 47 language tag, so screen readers can't pick the right pronunciation rules.",
    fix: "Use a proper language tag — 'en', 'en-US', 'de-DE'. Not a full language name, and not a country code on its own.",
    codeExample: `<html lang="en-US">   {/* ✓ */}
<html lang="english">  {/* ✗ */}
<html lang="US">       {/* ✗ */}`,
    docsUrl: "https://www.w3.org/International/questions/qa-choosing-language-tags",
  },
};

/**
 * The audit IDs to pull out of a PSI response — derived from the fix map rather
 * than listed separately, so the two can never disagree about which audits this
 * app understands.
 */
export const AUDIT_IDS = Object.keys(NEXTJS_FIX_MAP);

const IMPACT_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function getFixesForAudits(
  auditIds: string[],
  savingsMap: Record<string, number>,
  auditItemsMap: Record<string, AuditItem[]> = {}
): NextjsFix[] {
  return auditIds
    .filter((id) => NEXTJS_FIX_MAP[id])
    .map((id) => {
      // Built explicitly rather than by spreading the definition, so
      // passingLabel — which belongs to the other list — cannot leak into the
      // payload we send to the client.
      const def = NEXTJS_FIX_MAP[id];
      return {
        audit: id,
        title: def.title,
        impact: def.impact,
        category: def.category,
        problem: def.problem,
        fix: def.fix,
        codeExample: def.codeExample,
        docsUrl: def.docsUrl,
        savingsMs: savingsMap[id],
        auditItems: auditItemsMap[id],
      };
    })
    .sort((a, b) => {
      const byImpact = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
      if (byImpact !== 0) return byImpact;
      // Within an impact bucket, lead with the largest measured saving
      return (b.savingsMs ?? 0) - (a.savingsMs ?? 0);
    });
}

export function getPassingChecks(auditIds: string[]): PassingCheck[] {
  return auditIds
    .filter((id) => NEXTJS_FIX_MAP[id])
    .map((id) => ({ audit: id, title: NEXTJS_FIX_MAP[id].passingLabel }));
}
