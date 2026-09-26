import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 42,
          background: "#000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 90,
          fontWeight: 800,
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-4px",
        }}
      >
        Nv
      </div>
    ),
    { ...size }
  );
}
