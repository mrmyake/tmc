import { Svg, Rect } from "@react-pdf/renderer";
import * as React from "react";

/**
 * QR-code als vector in react-pdf: een witte achtergrond met stille zone
 * (4 modules, de norm) en per rij aaneengesloten donkere modules als een
 * Rect. Geen afbeelding en geen canvas, dus scherp en betrouwbaar op Vercel.
 */
export function QrCode({
  matrix,
  size,
}: {
  matrix: boolean[][];
  size: number;
}) {
  const n = matrix.length;
  const quiet = 4;
  const total = n + quiet * 2;
  const rects: React.ReactElement[] = [];
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!matrix[y][x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < n && matrix[y][end]) end++;
      rects.push(
        <Rect
          key={`${y}-${x}`}
          x={x + quiet}
          y={y + quiet}
          width={end - x}
          height={1}
          fill="#0E0C0B"
        />,
      );
      x = end;
    }
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`}>
      <Rect x={0} y={0} width={total} height={total} fill="#FFFFFF" />
      {rects}
    </Svg>
  );
}
