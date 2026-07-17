import type { AuditItem, NextjsFix, PassingCheck } from "@/types/analysis";

// Map from PSI audit ID → Next.js-specific fix
// PSI audit IDs: https://github.com/GoogleChrome/lighthouse/blob/main/core/audits/

export const NEXTJS_FIX_MAP: Record<string, Omit<NextjsFix, "audit" | "savingsMs" | "auditItems">> = {
  "uses-optimized-images": {
    title: "Replace <img> with next/image",
    category: "performance",
    impact: "high",
    problem: "You're serving unoptimized images. Next.js can automatically resize, compress, and serve WebP/AVIF.",
    fix: "Replace every <img> tag with the Next.js <Image> component from 'next/image'. Set explicit width and height, and add priority prop on above-the-fold images.",
    codeExample: `// Before
<img src="/hero.jpg" alt="Hero" />

// After
import Image from 'next/image'
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority  // add this on LCP images
/>`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image",
  },

  "uses-text-compression": {
    title: "Enable compression in Next.js config",
    category: "performance",
    impact: "medium",
    problem: "Text assets (JS, CSS, HTML) are not being compressed before transfer.",
    fix: "Ensure compress: true is set in next.config.js (it's the default). If you're behind a custom server or reverse proxy, enable gzip/brotli there.",
    codeExample: `// next.config.js
const nextConfig = {
  compress: true, // default, but make it explicit
}
export default nextConfig`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/next-config-js/compress",
  },

  "render-blocking-resources": {
    title: "Move fonts to next/font",
    category: "performance",
    impact: "high",
    problem: "You have render-blocking resources, likely Google Fonts loaded via <link> in a <head> tag.",
    fix: "Migrate to next/font/google. It zero-configs font optimization: self-hosts the font, adds font-display: swap, and eliminates the render-blocking network request entirely.",
    codeExample: `// Before (in layout.tsx <head> or _document)
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />

// After
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], display: 'swap' })
export default function RootLayout({ children }) {
  return <html className={inter.className}>{children}</html>
}`,
    docsUrl: "https://nextjs.org/docs/app/building-your-application/optimizing/fonts",
  },

  "uses-rel-preconnect": {
    title: "Add preconnect hints for third-party origins",
    category: "performance",
    impact: "medium",
    problem: "The browser is discovering third-party origins late. Preconnect hints let the browser set up connections earlier.",
    fix: "Add <link rel='preconnect'> in your root layout for any third-party origin you load resources from.",
    codeExample: `// src/app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/font#preload",
  },

  "unused-javascript": {
    title: "Code-split large imports with dynamic()",
    category: "performance",
    impact: "high",
    problem: "Unused JavaScript is being shipped in the initial bundle. Note: if you're on the App Router, Next.js already code-splits by route automatically — so this flag likely points to a heavy import inside a shared layout or root component that loads on every page.",
    fix: "First, check whether the flagged library lives in your root layout.tsx or a shared provider. If it does, that's where to act — dynamic() on a per-route component won't help if the import is in the layout wrapper. Use next/dynamic for components that aren't needed on the initial render, especially inside layouts. If a heavy library (e.g. a toast system, analytics widget, or rich-text editor) is imported in the root layout but only used on one route, move it to that route's layout or load it dynamically.",
    codeExample: `import dynamic from 'next/dynamic'

// Pattern 1 — heavy component only needed on one route
// Move the import out of root layout.tsx into the specific page/layout
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <p>Loading chart...</p>,
  ssr: false, // if the component uses browser-only APIs
})

// Pattern 2 — toast/notification provider in root layout
// Before (loads on every page):
// import { ToastContainer } from 'react-toastify'
// <ToastContainer />

// After (move to the layout of the route that actually triggers toasts):
// app/contact/layout.tsx
import { ToastContainer } from 'react-toastify'
export default function ContactLayout({ children }) {
  return <>{children}<ToastContainer /></>
}`,
    docsUrl: "https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading",
  },

  "unused-css-rules": {
    title: "Audit Tailwind content paths or remove unused CSS",
    category: "performance",
    impact: "low",
    problem: "Unused CSS rules are increasing stylesheet size.",
    fix: "If using Tailwind, ensure your content paths in tailwind.config.ts cover all files where you use class names, and nothing more. Avoid glob patterns that accidentally include node_modules.",
    codeExample: `// tailwind.config.ts
export default {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    // Don't add ./ — it scans everything including node_modules
  ],
}`,
    docsUrl: "https://tailwindcss.com/docs/content-configuration",
  },

  "efficient-animated-content": {
    title: "Replace GIF with next/image or <video>",
    category: "performance",
    impact: "medium",
    problem: "Animated GIFs are extremely large compared to equivalent video formats.",
    fix: "Convert GIFs to WebM/MP4 and use an autoplay muted loop <video> element, or use next/image which automatically optimizes static images (but not GIFs).",
    codeExample: `// Instead of <img src="animation.gif" />
<video autoPlay loop muted playsInline>
  <source src="/animation.webm" type="video/webm" />
  <source src="/animation.mp4" type="video/mp4" />
</video>`,
    docsUrl: "https://web.dev/replace-gifs-with-videos/",
  },

  "uses-long-cache-ttl": {
    title: "Set cache headers for static assets",
    category: "performance",
    impact: "medium",
    problem: "Static assets aren't being cached aggressively. Returning visitors re-download files they've already seen.",
    fix: "Next.js automatically sets long cache TTLs on assets in the /_next/static/ path. If you're serving other static files from /public, add cache headers via next.config.js headers().",
    codeExample: `// next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/fonts/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/next-config-js/headers",
  },

  "largest-contentful-paint-element": {
    title: "Add priority to your LCP image",
    category: "performance",
    impact: "high",
    problem: "The Largest Contentful Paint element is an image that was discovered and loaded too late.",
    fix: "If your LCP element is a Next.js <Image>, add the priority prop. This injects a <link rel='preload'> in the <head> so the image starts loading immediately.",
    codeExample: `import Image from 'next/image'

// Add priority to whichever image is above the fold / likely to be LCP
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority  // ← this is all you need
/>`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image#priority",
  },

  "uses-passive-event-listeners": {
    title: "Mark scroll/touch listeners as passive",
    category: "performance",
    impact: "low",
    problem: "Event listeners on scroll, touchstart, or wheel events are blocking the main thread.",
    fix: "Add { passive: true } to scroll and touch event listeners. This tells the browser it can scroll without waiting for your handler to finish.",
    codeExample: `// Before
window.addEventListener('scroll', handler)

// After
window.addEventListener('scroll', handler, { passive: true })`,
    docsUrl: "https://developer.chrome.com/docs/lighthouse/best-practices/uses-passive-event-listeners/",
  },

  "dom-size": {
    title: "Reduce DOM size with virtualization or pagination",
    category: "performance",
    impact: "medium",
    problem: "Your page has an extremely large DOM. This slows down style recalculation, layout, and rendering.",
    fix: "For long lists, use a virtualization library like @tanstack/virtual. For data tables, add server-side pagination. Avoid rendering large off-screen content.",
    codeExample: `// @tanstack/virtual for long lists
import { useVirtualizer } from '@tanstack/react-virtual'`,
    docsUrl: "https://tanstack.com/virtual/latest",
  },

  "server-response-time": {
    title: "Move data fetching to Server Components or add ISR",
    category: "performance",
    impact: "high",
    problem: "Your server is responding slowly (TTFB > 600ms). This is usually caused by slow database queries or API calls on every request.",
    fix: "If you're on the App Router, move data fetching into async Server Components — they run on the server and stream results to the client. For pages that can tolerate stale data, add revalidate to enable ISR.",
    codeExample: `// App Router Server Component with ISR
export const revalidate = 60 // revalidate every 60 seconds

export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 60 }
  })
  const json = await data.json()
  return <div>{json.title}</div>
}`,
    docsUrl: "https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration",
  },

  // ── Performance additions ────────────────────────────────────────────────

  "font-display": {
    title: "Set font-display on all custom fonts",
    category: "performance",
    impact: "medium",
    problem: "Custom fonts are loading without a font-display setting, causing invisible text (FOIT) while the font downloads.",
    fix: "next/font defaults to font-display: swap automatically. If this audit fires, you likely have a font loaded outside of next/font (e.g. a raw @font-face in CSS or a third-party stylesheet). Move all fonts through next/font/google or next/font/local.",
    codeExample: `// next/font handles font-display automatically:
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], display: 'swap' })

// For a custom local font:
import localFont from 'next/font/local'
const myFont = localFont({ src: './my-font.woff2', display: 'swap' })`,
    docsUrl: "https://nextjs.org/docs/app/building-your-application/optimizing/fonts#font-display",
  },

  "preload-lcp-image": {
    title: "Preload your LCP image with next/image priority",
    category: "performance",
    impact: "high",
    problem: "The browser discovered the LCP image too late because it wasn't preloaded. This delays the Largest Contentful Paint.",
    fix: "On the Next.js <Image> that is your above-the-fold hero, add the priority prop. This generates a <link rel='preload'> in the document head so the browser fetches the image before finishing HTML parsing.",
    codeExample: `import Image from 'next/image'

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority        // generates <link rel="preload"> in <head>
  sizes="100vw"  // tell the browser what size to expect
/>`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image#priority",
  },

  "third-party-summary": {
    title: "Defer or remove heavy third-party scripts",
    category: "performance",
    impact: "high",
    problem: "Third-party scripts (analytics, tag managers, chat widgets, ad SDKs) are adding significant blocking time to your page load.",
    fix: "Load non-critical scripts using next/script with strategy='lazyOnload'. For analytics that must fire early, use strategy='afterInteractive'. Avoid strategy='beforeInteractive' — it blocks everything.",
    codeExample: `import Script from 'next/script'

// In app/layout.tsx or the specific page that needs it:

// Analytics — can wait until after hydration
<Script src="https://analytics.example.com/script.js" strategy="afterInteractive" />

// Chat widget, marketing tools — no rush
<Script src="https://widget.example.com/embed.js" strategy="lazyOnload" />`,
    docsUrl: "https://nextjs.org/docs/app/building-your-application/optimizing/scripts",
  },

  "bootup-time": {
    title: "Reduce JavaScript execution time",
    category: "performance",
    impact: "medium",
    problem: "JavaScript is taking too long to execute, blocking the main thread during load. This delays time-to-interactive and worsens INP.",
    fix: "Audit your bundle for heavy work at import time (large constants, eager JSON parsing, moment.js locale loading). Move expensive computations to Web Workers or defer them until after first paint. Use next/dynamic with ssr: false for heavy client-only modules.",
    codeExample: `import dynamic from 'next/dynamic'

// Move heavy client-side code behind dynamic imports
const HeavyEditor = dynamic(() => import('./RichTextEditor'), {
  ssr: false,
  loading: () => <div>Loading editor…</div>,
})`,
    docsUrl: "https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading",
  },

  // ── SEO ─────────────────────────────────────────────────────────────────

  "meta-description": {
    title: "Add meta description via the Metadata API",
    category: "seo",
    impact: "medium",
    problem: "This page is missing a meta description. Search engines use it as the snippet in results — missing it can hurt click-through rates.",
    fix: "Export a metadata object from your page.tsx or use generateMetadata for dynamic routes. Set the description field (aim for under 160 characters).",
    codeExample: `// app/page.tsx (static)
export const metadata = {
  description: 'Your concise page description (under 160 chars).',
}

// app/blog/[slug]/page.tsx (dynamic)
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug)
  return { description: post.excerpt }
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/functions/generate-metadata#description",
  },

  "document-title": {
    title: "Set page title via the Metadata API",
    category: "seo",
    impact: "high",
    problem: "This page has no <title> tag. Titles are the most important on-page SEO signal and the first thing users see in search results.",
    fix: "Export metadata.title from your page.tsx. The root layout can define a title.template so all pages inherit a consistent suffix automatically.",
    codeExample: `// app/layout.tsx — template applies to all pages
export const metadata = {
  title: {
    template: '%s | My App',
    default: 'My App',
  },
}

// app/about/page.tsx
export const metadata = {
  title: 'About', // renders as "About | My App"
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/functions/generate-metadata#title",
  },

  "html-has-lang": {
    title: "Add lang attribute to <html> in root layout",
    category: "seo",
    impact: "low",
    problem: "The <html> element is missing a lang attribute. Screen readers and translation tools use it to determine the page language.",
    fix: "In your root layout.tsx, add lang to the <html> element. Next.js inlines this directly into the rendered HTML with no runtime cost.",
    codeExample: `// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/file-conventions/layout",
  },

  "canonical": {
    title: "Declare canonical URL via generateMetadata",
    category: "seo",
    impact: "medium",
    problem: "No canonical URL is set. Without it, search engines may index multiple versions of the same page (www vs non-www, trailing slash, query strings), splitting ranking signals.",
    fix: "Use alternates.canonical in your metadata export. For dynamic routes, set it to the clean production URL built from params.",
    codeExample: `// app/layout.tsx (site-wide default)
export const metadata = {
  alternates: { canonical: 'https://yoursite.com' },
}

// app/blog/[slug]/page.tsx (per-page)
export async function generateMetadata({ params }: { params: { slug: string } }) {
  return {
    alternates: { canonical: \`https://yoursite.com/blog/\${params.slug}\` },
  }
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/functions/generate-metadata#alternates",
  },

  "robots-txt": {
    title: "Add app/robots.ts to control crawler access",
    category: "seo",
    impact: "medium",
    problem: "Your site has no robots.txt or Lighthouse found an issue with it. A misconfigured robots.txt can accidentally block search engines from crawling your content.",
    fix: "Create app/robots.ts. Next.js generates /robots.txt automatically from this file. Be careful not to disallow your main content paths.",
    codeExample: `// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/'],
    },
    sitemap: 'https://yoursite.com/sitemap.xml',
  }
}`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots",
  },

  "link-text": {
    title: "Replace generic link text with descriptive labels",
    category: "seo",
    impact: "low",
    problem: "Links with text like 'click here' or 'read more' are meaningless out of context. Screen readers navigate by link text, and search engines use anchor text as a ranking signal.",
    fix: "Write link text that describes the destination. For icon-only links in Next.js, add an aria-label to the Link component.",
    codeExample: `// Before
<Link href="/docs">Click here</Link>

// After
<Link href="/docs">Read the deployment guide</Link>

// Icon-only link
<Link href="/docs" aria-label="Deployment guide">
  <BookIcon />
</Link>`,
    docsUrl: "https://web.dev/link-text/",
  },

  "structured-data": {
    title: "Add JSON-LD structured data to your pages",
    category: "seo",
    impact: "low",
    problem: "Lighthouse found errors in your structured data, or your pages lack it entirely. Structured data enables rich results in Google Search (stars, FAQs, breadcrumbs).",
    fix: "Add a <script type='application/ld+json'> block in your page or layout. In Next.js App Router, use a server component to inject it so it's present in the initial HTML for crawlers.",
    codeExample: `// app/blog/[slug]/page.tsx
export default async function BlogPost({ params }) {
  const post = await getPost(params.slug)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.publishedAt,
    author: { '@type': 'Person', name: post.author },
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>{post.content}</article>
    </>
  )
}`,
    docsUrl: "https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld",
  },

  // ── Accessibility ────────────────────────────────────────────────────────

  "image-alt": {
    title: "Add alt text to all images",
    category: "accessibility",
    impact: "high",
    problem: "One or more images are missing alt attributes. Screen readers skip these entirely, making the content inaccessible. This also fails WCAG 2.1 AA.",
    fix: "Add an alt prop to every Next.js <Image>. For informative images, describe what's shown. For purely decorative images, use alt='' so screen readers skip them.",
    codeExample: `import Image from 'next/image'

// Informative image — describe the content
<Image
  src="/team.jpg"
  alt="The Acme engineering team at their 2024 offsite"
  width={800}
  height={400}
/>

// Decorative image — empty alt, add aria-hidden
<Image src="/divider.svg" alt="" aria-hidden width={200} height={4} />`,
    docsUrl: "https://nextjs.org/docs/app/api-reference/components/image#alt",
  },

  "color-contrast": {
    title: "Fix color contrast in your design tokens",
    category: "accessibility",
    impact: "medium",
    problem: "Text or interactive elements don't have sufficient contrast against their background. WCAG AA requires 4.5:1 for normal text and 3:1 for large text (18px+ or bold 14px+).",
    fix: "Check your CSS custom properties or Tailwind config for foreground/background color pairs. Verify with a contrast tool. Re-check dark mode separately — a pair that passes in light often fails in dark.",
    codeExample: `/* globals.css — verify these pairs with a contrast checker */
:root {
  --text:   #0f172a; /* on --surface #ffffff → 19.1:1 ✓ */
  --text-2: #64748b; /* on --surface #ffffff → 5.9:1  ✓ */
}

@media (prefers-color-scheme: dark) {
  :root {
    --text:   #f1f5f9; /* on --surface #0f172a → 16.5:1 ✓ */
    --text-2: #94a3b8; /* on --surface #0f172a → 5.8:1  ✓ */
  }
}`,
    docsUrl: "https://web.dev/color-contrast/",
  },
};

export function getFixesForAudits(
  auditIds: string[],
  savingsMap: Record<string, number>,
  auditItemsMap: Record<string, AuditItem[]> = {}
): NextjsFix[] {
  return auditIds
    .filter((id) => NEXTJS_FIX_MAP[id])
    .map((id) => ({
      audit: id,
      savingsMs: savingsMap[id],
      auditItems: auditItemsMap[id],
      ...NEXTJS_FIX_MAP[id],
    }))
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.impact] - order[b.impact];
    });
}

const PASSING_LABELS: Record<string, string> = {
  // Performance
  "uses-optimized-images": "Images optimized with next/image",
  "uses-text-compression": "Text compression enabled",
  "render-blocking-resources": "No render-blocking fonts or CSS",
  "uses-rel-preconnect": "Preconnect hints in place",
  "unused-javascript": "JavaScript bundle is lean",
  "unused-css-rules": "No significant unused CSS",
  "efficient-animated-content": "No unoptimized GIFs or animations",
  "uses-long-cache-ttl": "Static assets cached aggressively",
  "largest-contentful-paint-element": "LCP image loads with priority",
  "uses-passive-event-listeners": "Event listeners are passive",
  "dom-size": "DOM size is manageable",
  "server-response-time": "Server responds quickly (TTFB)",
  "font-display": "Fonts use font-display: swap",
  "preload-lcp-image": "LCP image is preloaded",
  "third-party-summary": "Third-party scripts are lightweight",
  "bootup-time": "JavaScript execution time is low",
  // SEO
  "meta-description": "Meta description is present",
  "document-title": "Page title is set",
  "html-has-lang": "HTML lang attribute is set",
  "canonical": "Canonical URL is declared",
  "robots-txt": "robots.txt is valid",
  "link-text": "Link text is descriptive",
  "structured-data": "Structured data is valid",
  // Accessibility
  "image-alt": "All images have alt text",
  "color-contrast": "Color contrast meets WCAG AA",
};

export function getPassingChecks(auditIds: string[]): PassingCheck[] {
  return auditIds
    .filter((id) => PASSING_LABELS[id])
    .map((id) => ({ audit: id, title: PASSING_LABELS[id] }));
}
