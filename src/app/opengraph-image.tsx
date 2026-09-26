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
          background: "#FAFAFA",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
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
              background: "#FFFFFF",
              border: "1px solid rgba(0,0,0,0.08)",
              fontSize: 16,
              color: "#6B7280",
              letterSpacing: 1,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#16A34A",
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
            <span style={{ color: "#171717" }}>Nextvital</span>
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              fontSize: 30,
              color: "#6B7280",
              maxWidth: 700,
              textAlign: "center",
              lineHeight: 1.4,
              fontWeight: 400,
            }}
          >
            <span>Lighthouse results, interpreted for Next.js.</span>
            <span style={{ color: "#171717", fontWeight: 500 }}>
              Actionable fixes — not generic advice.
            </span>
          </div>

          {/* Feature pills */}
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            {[
              { label: "Performance", dot: "#16A34A" },
              { label: "SEO", dot: "#000000" },
              { label: "Accessibility", dot: "#D97706" },
            ].map(({ label, dot }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 20px",
                  borderRadius: 100,
                  background: "#FFFFFF",
                  border: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 18,
                  color: "#171717",
                  fontWeight: 500,
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: dot, display: "flex" }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom URL strip */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            display: "flex",
            fontSize: 18,
            color: "#6B7280",
          }}
        >
          nextvital.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
