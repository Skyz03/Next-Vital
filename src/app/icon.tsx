import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "#000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 800,
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-1px",
        }}
      >
        N
      </div>
    ),
    { ...size }
  );
}
