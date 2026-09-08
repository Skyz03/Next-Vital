import { ImageResponse } from "next/og";

export const alt = "Nextvital — Next.js Performance Analyzer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
          background: "#080b12",
        }}
      >
        {/* Ambient radial glows */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(ellipse 55% 50% at 15% 20%, rgba(124,58,237,0.35) 0%, transparent 65%), radial-gradient(ellipse 50% 45% at 85% 80%, rgba(6,182,212,0.28) 0%, transparent 65%)",
          }}
        />

        {/* Content stack */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
          }}
        >
          {/* Logo badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 20px",
              borderRadius: 100,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              fontSize: 16,
              color: "#94a3b8",
              letterSpacing: 1,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                display: "flex",
              }}
            />
            <span>Powered by PageSpeed Insights</span>
          </div>

          {/* Wordmark */}
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: "-4px",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#f1f5f9" }}>Next</span>
            <span style={{ color: "#7c3aed" }}>vital</span>
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              fontSize: 30,
              color: "#94a3b8",
              maxWidth: 700,
              textAlign: "center",
              lineHeight: 1.4,
              fontWeight: 400,
            }}
          >
            <span>Lighthouse results, interpreted for Next.js.</span>
            <span style={{ color: "#cbd5e1", fontWeight: 500 }}>
              Actionable fixes — not generic advice.
            </span>
          </div>

          {/* Feature pills */}
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                borderRadius: 100,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 18,
                color: "#e2e8f0",
                fontWeight: 500,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "flex" }} />
              <span>Performance</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                borderRadius: 100,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 18,
                color: "#e2e8f0",
                fontWeight: 500,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#06b6d4", display: "flex" }} />
              <span>SEO</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                borderRadius: 100,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 18,
                color: "#e2e8f0",
                fontWeight: 500,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#a78bfa", display: "flex" }} />
              <span>Accessibility</span>
            </div>
          </div>
        </div>

        {/* Bottom URL strip */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            display: "flex",
            fontSize: 18,
            color: "#475569",
          }}
        >
          nextvital.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
