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
          background: "#FAFAFA",
        }}
      >

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
            <span style={{ color: "#171717" }}>Nextvital</span>
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
                        color: "#6B7280",
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
                  color: "#171717",
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
            color: "#6B7280",
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
