import type { AuditItem, NextjsFix, PassingCheck } from "@/types/analysis";

// Map from PSI audit ID → Next.js-specific fix
// PSI audit IDs: https://github.com/GoogleChrome/lighthouse/blob/main/core/audits/

export const NEXTJS_FIX_MAP: Record<string, Omit<NextjsFix, "audit" | "savingsMs">> = {
  "uses-optimized-images": {
    title: "Replace <img> with next/image",
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
    impact: "medium",
    problem: "Your page has an extremely large DOM. This slows down style recalculation, layout, and rendering.",
    fix: "For long lists, use a virtualization library like @tanstack/virtual. For data tables, add server-side pagination. Avoid rendering large off-screen content.",
    codeExample: `// @tanstack/virtual for long lists
import { useVirtualizer } from '@tanstack/react-virtual'`,
    docsUrl: "https://tanstack.com/virtual/latest",
  },

  "server-response-time": {
    title: "Move data fetching to Server Components or add ISR",
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
};

export function getPassingChecks(auditIds: string[]): PassingCheck[] {
  return auditIds
    .filter((id) => PASSING_LABELS[id])
    .map((id) => ({ audit: id, title: PASSING_LABELS[id] }));
}
