import { ImageResponse } from "next/og";

export const alt = "Nextvital — Next.js Performance Analyzer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f172a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: "#f1f5f9",
            letterSpacing: "-3px",
            display: "flex",
          }}
        >
          <span>Next</span>
          <span style={{ color: "#0ea5e9" }}>vital</span>
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#94a3b8",
            maxWidth: 700,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Paste your Next.js URL. Get performance fixes written for Next.js.
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 16,
            color: "#475569",
            display: "flex",
            gap: 32,
          }}
        >
          <span>PageSpeed Insights</span>
          <span>·</span>
          <span>Performance · SEO · Accessibility</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
