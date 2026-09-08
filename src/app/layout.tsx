import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Nextvital — Next.js Performance Analyzer",
    template: "%s · Nextvital",
  },
  description: "Paste your Next.js app URL. Get performance fixes written specifically for Next.js — not generic Lighthouse advice.",
  keywords: ["Next.js", "performance", "Lighthouse", "PageSpeed Insights", "Core Web Vitals", "web performance analyzer", "Next.js optimization"],
  creator: "Nextvital",
  category: "technology",
  openGraph: {
    title: "Nextvital",
    description: "Lighthouse results, interpreted for Next.js.",
    url: "/",
    siteName: "Nextvital",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nextvital — Next.js Performance Analyzer",
    description: "Paste your Next.js URL. Get actionable performance fixes for Next.js.",
  },
  alternates: {
    canonical: "/",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Nextvital",
  description: "Lighthouse audits interpreted for Next.js. Actionable fixes for performance, SEO, and accessibility.",
  url: appUrl,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#7c3aed" />
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="relative">
        <div className="nova-glow" aria-hidden="true" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
