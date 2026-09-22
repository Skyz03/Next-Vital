"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    id: "home",
    label: "New Audit",
    href: "/",
    paths: ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M9 22V12h6v10"],
  },
  {
    id: "results",
    label: "Results",
    href: "/results",
    paths: ["M18 20V10M12 20V4M6 20v-6"],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    paths: ["M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"],
  },
];

export default function LeftNav() {
  const pathname = usePathname();

  function isActive(id: string) {
    if (id === "home") return pathname === "/";
    if (id === "results")
      return pathname.startsWith("/results") || pathname.startsWith("/r/");
    if (id === "dashboard") return pathname === "/dashboard";
    return false;
  }

  return (
    <nav
      className="glass flex flex-col items-center py-5 gap-2 shrink-0"
      style={{ width: 64, zIndex: 20 }}
    >
      {/* Logo mark */}
      <Link href="/" className="mb-4 focus-brand rounded-xl" aria-label="Nextvital home">
        <div className="w-9 h-9 rounded-xl btn-gradient flex items-center justify-center">
          <span className="text-white text-sm font-bold select-none">N</span>
        </div>
      </Link>

      {NAV_ITEMS.map((item) => {
        const active = isActive(item.id);
        return (
          <div key={item.id} className="relative group">
            <Link
              href={item.href}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 focus-brand"
              style={{
                backgroundColor: active
                  ? "color-mix(in srgb, var(--brand-from) 20%, transparent)"
                  : "transparent",
                color: active ? "var(--brand-from)" : "var(--text-2)",
              }}
              aria-label={item.label}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {item.paths.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </svg>
            </Link>

            {/* Tooltip */}
            <div
              className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2 py-1 glass rounded-md text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{ color: "var(--text)", zIndex: 50 }}
            >
              {item.label}
            </div>
          </div>
        );
      })}

      {/* GitHub — pinned to bottom */}
      <div className="mt-auto relative group">
        <a
          href="https://github.com/Skyz03/Next-Vital"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 focus-brand"
          style={{ color: "var(--text-2)" }}
          aria-label="GitHub repository"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        </a>
        <div
          className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2 py-1 glass rounded-md text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ color: "var(--text)", zIndex: 50 }}
        >
          GitHub
        </div>
      </div>
    </nav>
  );
}
