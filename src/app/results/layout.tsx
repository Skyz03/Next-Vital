import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit Results",
  description: "Lighthouse audit results interpreted as actionable Next.js fixes for performance, SEO, and accessibility.",
};

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
