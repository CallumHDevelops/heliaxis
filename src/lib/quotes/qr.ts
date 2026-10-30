import 'server-only';
import QRCode from 'qrcode';
import type { Drawing } from '@/lib/documents/pdf-kit';
import { INK } from '@/lib/documents/pdf-kit';
import { rgb } from 'pdf-lib';

/** A QR code for a link, drawn as vector squares in the PDF (so it prints and zooms sharply): `size` points across, quiet zone included. */
export function drawQr(d: Drawing, url: string, x: number, y: number, size: number) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  d.rect(x, y, size, size, { fill: rgb(1, 1, 1), border: rgb(0.85, 0.83, 0.79), line: 0.5 });
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(r, c)) d.rect(x + (c + quiet) * cell, y + size - (r + quiet + 1) * cell, cell + 0.15, cell + 0.15, { fill: INK });
  }
}
