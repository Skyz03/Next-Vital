import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nextvital — Next.js Performance Analyzer",
  description: "Paste your Next.js app URL. Get performance fixes written specifically for Next.js.",
  openGraph: {
    title: "Nextvital",
    description: "Lighthouse results, interpreted for Next.js.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
