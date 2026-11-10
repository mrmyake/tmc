import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { qrMatrix } from "../../src/lib/invoice-payments/qr.ts";

// De QR in de PDF moet de betaal-URL bevatten: render de matrix als beeld en
// decodeer hem terug met een onafhankelijke decoder (jsQR).

const require = createRequire(import.meta.url);
const jsQR = require("jsqr") as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data: string } | null;

function decode(matrix: boolean[][]): string | null {
  const scale = 8;
  const quiet = 4;
  const n = matrix.length;
  const side = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx;
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return jsQR(data, side, side)?.data ?? null;
}

test("de QR decodeert terug naar de betaal-URL", () => {
  const url =
    "https://www.themovementclub.nl/factuur/betalen/3d817839-2d0f-4221-a5e9-3cc76ebe9f5d";
  const matrix = qrMatrix(url);
  assert.ok(matrix.length >= 21);
  assert.equal(matrix.length, matrix[0].length);
  assert.equal(decode(matrix), url);
});

test("ook een lange preview-URL met branch-host decodeert", () => {
  const url =
    "https://themovementclub-git-feat-factuur-online-betalen-iljas-projects-8d5cabb3.vercel.app/factuur/betalen/3d817839-2d0f-4221-a5e9-3cc76ebe9f5d";
  assert.equal(decode(qrMatrix(url)), url);
});
