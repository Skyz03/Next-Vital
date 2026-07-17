import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
  openGraph: {
    title: "Nextvital",
    description: "Lighthouse results, interpreted for Next.js.",
    url: "/",
    siteName: "Nextvital",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nextvital — Next.js Performance Analyzer",
    description: "Paste your Next.js URL. Get actionable performance fixes for Next.js.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
