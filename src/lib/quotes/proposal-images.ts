import 'server-only';
import { deflateSync, inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFObject } from 'pdf-lib';

/**
 * The pictures on one page of an uploaded design proposal, lifted out whole: JPEGs as they are, and the plain RGB or grey images
 * (the roof design render) re-wrapped as PNG. Logos, banners and anything with transparency or an unusual colour space are left
 * out. Returned largest first, with where it sat in the page's own order, so the caller can tell the roof picture (the big wide one)
 * from the product photos (smaller, portrait) and the sun-path diagram.
 */
export type LiftedImage = { page: number; width: number; height: number; mime: 'image/jpeg' | 'image/png'; bytes: Uint8Array; order: number };

const name = (d: PDFDict, k: string) => d.get(PDFName.of(k));
const num = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : 0);

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A PNG from decoded pixel rows. `rows` has a filter byte at the start of every row already when a PDF predictor was used. */
function png(width: number, height: number, channels: 1 | 3, rows: Uint8Array, filtered: boolean): Uint8Array {
  const stride = width * channels;
  let idat = rows;
  if (!filtered) {
    idat = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) idat.set(rows.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const head = new Uint8Array(13);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  head[8] = 8;
  head[9] = channels === 3 ? 2 : 0;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(idat)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function lift(doc: PDFDocument, o: PDFObject, page: number, order: number): LiftedImage | null {
  if (!(o instanceof PDFRawStream)) return null;
  const d = o.dict;
  if (name(d, 'Subtype')?.toString() !== '/Image' || d.get(PDFName.of('SMask')) || d.get(PDFName.of('Mask'))) return null;
  const width = num(d.get(PDFName.of('Width')));
  const height = num(d.get(PDFName.of('Height')));
  if (width < 200 || height < 100) return null;
  const f = d.get(PDFName.of('Filter'));
  const filter = f instanceof PDFArray ? f.lookup(0)?.toString() : f?.toString();
  if (filter === '/DCTDecode') return { page, width, height, mime: 'image/jpeg', bytes: o.contents, order };
  if (filter !== '/FlateDecode' || num(d.get(PDFName.of('BitsPerComponent'))) !== 8) return null;
  // Plain RGB or grey, or an ICC profile (the number of colours it says it has: 3 for RGB, 1 for grey).
  const csObj = d.get(PDFName.of('ColorSpace'));
  const cs = csObj?.toString();
  let channels: 0 | 1 | 3 = 0;
  if (csObj instanceof PDFArray && csObj.lookup(0)?.toString() === '/ICCBased') {
    const icc = doc.context.lookup(csObj.get(1));
    const n = icc && 'dict' in icc ? num((icc as PDFRawStream).dict.get(PDFName.of('N'))) : 0;
    channels = n === 3 ? 3 : n === 1 ? 1 : 0;
  } else channels = cs === '/DeviceRGB' ? 3 : cs === '/DeviceGray' ? 1 : 0;
  if (!channels) return null;
  const dp = d.get(PDFName.of('DecodeParms'));
  const parms = dp instanceof PDFDict ? dp : dp instanceof PDFArray ? (doc.context.lookup(dp.get(0)) as PDFDict | undefined) : undefined;
  const predictor = parms instanceof PDFDict ? num(parms.get(PDFName.of('Predictor'))) : 1;
  try {
    const raw = new Uint8Array(inflateSync(o.contents));
    const filtered = predictor >= 10;
    if (raw.length !== (width * channels + (filtered ? 1 : 0)) * height) return null;
    return { page, width, height, mime: 'image/png', bytes: png(width, height, channels, raw, filtered), order };
  } catch {
    return null;
  }
}

/** Every liftable picture on a 1-based page, biggest first. Pictures used on every page (banners, logos) are small or wide and skipped. */
export async function liftPageImages(bytes: Uint8Array, pageNumber: number): Promise<LiftedImage[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pg = doc.getPages()[pageNumber - 1];
  if (!pg) return [];
  const xo = pg.node.Resources()?.lookup(PDFName.of('XObject'));
  if (!(xo instanceof PDFDict)) return [];
  const seen = new Set<string>();
  const out: LiftedImage[] = [];
  let order = 0;
  for (const [, v] of xo.entries()) {
    const key = v instanceof PDFRef ? v.toString() : String(order);
    if (seen.has(key)) continue;
    seen.add(key);
    const obj = doc.context.lookup(v);
    const img = obj ? lift(doc, obj, pageNumber, order++) : null;
    // The wide banners (the header artwork, the brand strip) are over 2000 px wide and not part of the design.
    if (img && img.width < 2000 && img.width / img.height < 6) out.push(img);
  }
  return out.sort((a, b) => b.width * b.height - a.width * a.height);
}

export type OptionPictures = { roof?: LiftedImage; inverter?: LiftedImage; battery?: LiftedImage; sunpath?: LiftedImage };

/**
 * The pictures for one system option, from its own page: the roof design (the big wide one), then the product photos in the order the
 * page draws them (inverter, then battery), and the sun-path diagram from the few pages after it (a JPEG about 800 px wide, 3:2 or so).
 */
export async function picturesForOption(bytes: Uint8Array, optionPage: number, pageCount = 40): Promise<OptionPictures> {
  const own = await liftPageImages(bytes, optionPage);
  const roof = own.find((i) => i.width >= 1000 && i.width / i.height > 1.8);
  const products = own.filter((i) => i !== roof && i.mime === 'image/jpeg' && i.height > i.width).sort((a, b) => a.order - b.order);
  let sunpath: LiftedImage | undefined;
  for (let pg = optionPage + 1; pg <= Math.min(optionPage + 5, pageCount) && !sunpath; pg++) {
    sunpath = (await liftPageImages(bytes, pg)).find((i) => i.mime === 'image/jpeg' && i.width >= 600 && i.width <= 1100 && i.width / i.height > 1.4 && i.width / i.height < 1.9);
  }
  return { roof, inverter: products[0], battery: products[1], sunpath };
}
