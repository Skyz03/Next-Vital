import { ImageResponse } from "next/og";
import { getPermalink } from "@/lib/cache";

export const alt = "Nextvital audit report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function scoreColor(score: number): string {
  if (score >= 90) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function truncateUrl(url: string, max = 44): string {
  try {
    const u = new URL(url);
    const short = u.hostname + (u.pathname === "/" ? "" : u.pathname);
    return short.length > max ? short.slice(0, max - 1) + "…" : short;
  } catch {
    return url.length > max ? url.slice(0, max - 1) + "…" : url;
  }
}

interface Props {
  params: { id: string };
}

export default async function OGImage({ params }: Props) {
  const report = await getPermalink(params.id);

  // Fallback: mimic the root OG design when the permalink has expired
  const scores = report
    ? [
        { label: "Performance", value: report.performanceScore },
        ...(report.seoScore != null ? [{ label: "SEO", value: report.seoScore }] : []),
        ...(report.accessibilityScore != null ? [{ label: "Accessibility", value: report.accessibilityScore }] : []),
      ]
    : null;

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

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 40,
          }}
        >
          {/* Wordmark */}
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: "-3px",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#f1f5f9" }}>Next</span>
            <span style={{ color: "#7c3aed" }}>vital</span>
          </div>

          {scores ? (
            <>
              {/* Score bubbles */}
              <div style={{ display: "flex", gap: 40 }}>
                {scores.map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 140,
                        height: 140,
                        borderRadius: "50%",
                        border: `6px solid ${scoreColor(value)}`,
                        fontSize: 56,
                        fontWeight: 800,
                        color: scoreColor(value),
                        background: `color-mix(in srgb, ${scoreColor(value)} 8%, transparent)`,
                      }}
                    >
                      {value}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        fontSize: 20,
                        color: "#94a3b8",
                        fontWeight: 500,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: "#cbd5e1",
                  fontWeight: 500,
                }}
              >
                {truncateUrl(report!.url)}
              </div>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                color: "#94a3b8",
                textAlign: "center",
              }}
            >
              This report has expired
            </div>
          )}
        </div>

        {/* Bottom strip */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            display: "flex",
            fontSize: 16,
            color: "#475569",
            letterSpacing: 1,
          }}
        >
          Lighthouse audit · interpreted for Next.js
        </div>
      </div>
    ),
    { ...size }
  );
}
