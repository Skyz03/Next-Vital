import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nextvital — Next.js Performance Analyzer",
    short_name: "Nextvital",
    description: "Lighthouse audits, interpreted for Next.js. Get actionable fixes for performance, SEO, and accessibility.",
    start_url: "/",
    display: "standalone",
    background_color: "#080b12",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon.png",       sizes: "32x32",   type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
