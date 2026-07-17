import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-[var(--text)]">404</h1>
      <p className="text-sm text-[var(--text-2)]">Page not found.</p>
      <Link href="/" className="text-xs text-[var(--brand)] hover:underline">
        ← Back to Nextvital
      </Link>
    </div>
  );
}
