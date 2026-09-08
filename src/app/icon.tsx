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
          background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 700,
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-0.5px",
        }}
      >
        Nv
      </div>
    ),
    { ...size }
  );
}
