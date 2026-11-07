import { ImageResponse } from "next/og";

export const alt = "Welke yoga past bij jou? The Movement Club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// COPY: confirm met Marlon
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0E0C0B",
          color: "#F4EFE6",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#B9986A",
          }}
        >
          Yoga bij The Movement Club
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 92,
            lineHeight: 1.05,
            fontFamily: "Georgia, serif",
          }}
        >
          Welke yoga past bij jou?
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 32, color: "#B3AC9E" }}>
          8 vragen, direct je uitslag
        </div>
      </div>
    ),
    size,
  );
}
