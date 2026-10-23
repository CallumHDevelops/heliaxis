/**
 * Image file details the PDF and PNG/JPG exports need: a phone photo's EXIF orientation (a PDF never
 * applies it, browsers always do) and the resolution written into an exported PNG/JPG.
 */

/**
 * A JPEG's EXIF Orientation (1 = stored upright). Phone cameras save portrait shots sideways with
 * this tag; browsers apply it on screen and on a canvas, but a PDF never does.
 */
export function jpegOrientation(b: Uint8Array): number {
  let i = 2;
  while (i + 10 < b.length && b[i] === 0xff) {
    const mk = b[i + 1];
    if (mk === 0xda || mk === 0xd9) break; // image data starts: no EXIF
    if (mk === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10; // TIFF header, after "Exif\0\0"
      const le = b[t] === 0x49;
      const u16 = (p: number) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
      const ifd = t + (le ? u16(t + 4) + u16(t + 6) * 65536 : u16(t + 4) * 65536 + u16(t + 6));
      const n = u16(ifd);
      for (let k = 0; k < n && ifd + 14 + k * 12 <= b.length; k++) {
        if (u16(ifd + 2 + k * 12) === 0x0112) return u16(ifd + 10 + k * 12);
      }
      return 1;
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return 1;
}

/* ---------- resolution: PNG pHYs, JPEG JFIF density ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function b64ToBytes(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
/** A data: URL of a PNG or JPEG with its resolution set to `dpi` (as is, if the file isn't what's expected). */
export function withDpi(url: string, dpi: number): string {
  // (a very big image is left as it is: decoding it again would double the memory it takes)
  if (!(dpi > 0) || url.length > 60_000_000) return url;
  const m = /^data:(image\/(?:png|jpeg));base64,(.*)$/.exec(url);
  if (!m) return url;
  const b = b64ToBytes(m[2]);
  if (m[1] === 'image/png') {
    // a pHYs chunk (pixels per metre) right after IHDR, which always comes first and is 25 bytes
    if (b.length < 33 || b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return url;
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // unit: metre
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const out = new Uint8Array(b.length + 21);
    out.set(b.subarray(0, 33), 0);
    out.set(chunk, 33);
    out.set(b.subarray(33), 54);
    return `data:image/png;base64,${bytesToB64(out)}`;
  }
  // JPEG: the JFIF APP0 segment's density, in dots per inch
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46) {
    const d = Math.min(65535, dpi);
    b[13] = 1;
    b[14] = d >> 8;
    b[15] = d & 0xff;
    b[16] = d >> 8;
    b[17] = d & 0xff;
    return `data:image/jpeg;base64,${bytesToB64(b)}`;
  }
  return url;
}
