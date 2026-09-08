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
          background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 88,
          fontWeight: 700,
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-3px",
        }}
      >
        Nv
      </div>
    ),
    { ...size }
  );
}
