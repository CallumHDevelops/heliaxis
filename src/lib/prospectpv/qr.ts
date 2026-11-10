/**
 * QR codes rendered as a single SVG path (crisp at any print size, no images,
 * synchronous so templates can render it inline). The QR encodes only the
 * landing URL (spec 7.1).
 */
import QRCode from 'qrcode';

export type QrMatrix = { size: number; path: string };

export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = modules.size;
  let path = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (modules.get(y, x)) {
        const start = x;
        while (x < size && modules.get(y, x)) x++;
        path += `M${start} ${y}h${x - start}v1h-${x - start}z`;
      } else x++;
    }
  }
  return { size, path };
}
