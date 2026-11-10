import QRCode from "qrcode";

/**
 * QR-matrix voor een URL, als vierkant raster van booleans (true = donkere
 * module). Pure JS (qrcode.create), geen canvas en geen afbeelding: de PDF
 * tekent er vectorvlakjes van, dus scherp bij elke printgrootte. Foutcorrectie
 * M: genoeg marge voor print en een telefooncamera, zonder de code onnodig
 * dicht te maken.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(qr.modules.get(x, y) === 1);
    rows.push(row);
  }
  return rows;
}
