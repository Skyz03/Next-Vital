import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit results",
};

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
