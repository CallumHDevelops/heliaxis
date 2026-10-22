// Design studio: what a printer's template PDF turns into, and the file paths the API will sign.
// The owner imports a printer's template ("Straight Fabric Pop-Up 3 x 3" from instantprint, drawn at
// 25% scale), designs over it at the REAL size (2960 × 2260 mm finished, 3020 × 2320 mm with bleed)
// and exports a full-size print PDF. This checks the geometry the studio reads from templates made
// the ways printers make them: their dimension text (at 25% and 100%, labels before or after, "×",
// "2,960"), TrimBox/BleedBox (with a slug of crop marks), /Rotate, a cropped page, /UserUnit, a
// broken TrimBox and a multi-page PDF; that /api/design/file only signs paths the server made (no
// "%2e%2e" walk out of the bucket); saved geometry sanity; and phone photos' EXIF orientation.
// Usage: node --experimental-strip-types scripts/test-design-studio.mjs
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  'server-only': 'export {}',
  'next/server': 'export class NextResponse extends Response { static json(b, i) { return new Response(JSON.stringify(b), i); } }',
  '@/lib/auth': 'export async function requirePortal() { return null; }',
  '@/lib/supabase/admin': 'export const createAdminClient = () => null;',
  '@/lib/schema-ready': 'export async function schemaReady() { return { design: true }; }',
};
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
    // pdf.js in Node: the legacy build (the studio loads the browser build)
    if (specifier === 'pdfjs-dist') return next('pdfjs-dist/legacy/build/pdf.mjs', context);
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      return next(`${spec}.ts`, context);
    }
  },
});
// pdf.js's own warnings (no standard-font data in Node: text is still read) aren't results
const log = console.log;
console.log = (...a) => (typeof a[0] === 'string' && a[0].startsWith('Warning: ') ? undefined : log(...a));
// pdf.js runs its "worker" in this thread when this is set (no worker file to fetch)
globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFNumber } = await import('pdf-lib');
const { readTemplate } = await import(`${SRC}app/admin/design/lib/template.ts`);
const { okPath, cleanGeometry, safeName } = await import(`${SRC}lib/design/server.ts`);
const { jpegOrientation, withDpi } = await import(`${SRC}app/admin/design/lib/image-meta.ts`);

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const PT = 72 / 25.4;
const mm = (v) => v * PT;
const shape = (i) => {
  const g = i.geometry;
  const r = (n) => Math.round(n * 100) / 100;
  return { media: [r(g.mediaW), r(g.mediaH)], trim: [r(g.trim.x), r(g.trim.y), r(g.trim.w), r(g.trim.h)], safe: g.safe, ...(g.tplBox ? { tplBox: [g.tplBox.x, g.tplBox.y, g.tplBox.w, g.tplBox.h] } : {}) };
};
const read = async (bytes, page = 1) => readTemplate(new Uint8Array(bytes), page);

/** An instantprint-style template: coloured bleed band, cut and safe lines, the dimension text. */
async function printerTemplate({ scale = 0.25, margin = 0, lines, note = 'This template is set up at 25% scale', boxes = false, pdf } = {}) {
  const doc = pdf ?? (await PDFDocument.create());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const BW = 3020 * scale, BH = 2320 * scale, W = BW + 2 * margin, H = BH + 2 * margin;
  const page = doc.addPage([mm(W), mm(H)]);
  page.drawRectangle({ x: mm(margin), y: mm(margin), width: mm(BW), height: mm(BH), color: rgb(0.93, 0.36, 0.42) });
  page.drawRectangle({ x: mm(margin + 30 * scale), y: mm(margin + 30 * scale), width: mm(2960 * scale), height: mm(2260 * scale), color: rgb(1, 1, 1) });
  if (boxes) {
    page.setBleedBox(mm(margin), mm(margin), mm(BW), mm(BH));
    page.setTrimBox(mm(margin + 30 * scale), mm(margin + 30 * scale), mm(2960 * scale), mm(2260 * scale));
  }
  let y = H - margin - 80 * scale;
  for (const s of [
    'Straight Fabric Pop-Up 3 x 3',
    ...(lines ?? ['2900mm (W) x 2200mm (H) Safe Zone', '2960mm (W) x 2260mm (H) Finished Size', '3020mm (W) x 2320mm (H) With Bleed']),
    ...(note ? [note] : []),
  ]) {
    page.drawText(s, { x: mm(margin + 80 * scale), y: mm(y), size: Math.max(8, mm(BW) / 70), font });
    y -= 60 * scale;
  }
  return pdf ? doc : doc.save();
}
const POPUP = { media: [3020, 2320], trim: [30, 30, 2960, 2260], safe: 30 };

/* ---------- the owner's template: real size, whatever the printer drew it at ---------- */
{
  const i = await read(await printerTemplate());
  eq('pop-up 3x3 at 25%: the design is the real 3020 × 2320 mm sheet, cut 2960 × 2260 at 30 mm, safe 30', shape(i), POPUP);
  eq('pop-up 3x3 at 25%: detected with high confidence, scale 25%', [i.confidence, i.scale], ['high', 0.25]);
  eq('pop-up 3x3 at 25%: matched to the pop-up format, its wrap-round panels marked (389.52 mm a side)', i.geometry.zones?.map((z) => [Math.round(z.box.x * 100) / 100, z.box.w]), [[30, 389.52], [2600.48, 389.52]]);
  eq('pop-up 3x3 at 100%: the same design', shape(await read(await printerTemplate({ scale: 1, note: null }))), POPUP);
  eq('pop-up 3x3, no "% scale" line: the scale comes from the "with bleed" size', shape(await read(await printerTemplate({ note: null }))), POPUP);
  eq('labels before the sizes ("Finished Size: 2960mm (W) x …")', shape(await read(await printerTemplate({ lines: ['Safe Zone: 2900mm (W) x 2200mm (H)', 'Finished Size: 2960mm (W) x 2260mm (H)', 'With Bleed: 3020mm (W) x 2320mm (H)'] }))), POPUP);
  eq('thousands separators ("2,960mm")', shape(await read(await printerTemplate({ lines: ['2,900mm (W) x 2,200mm (H) Safe Zone', '2,960mm (W) x 2,260mm (H) Finished Size', '3,020mm (W) x 2,320mm (H) With Bleed'] }))), POPUP);
  eq('a TrimBox/BleedBox at 25% too (InDesign export)', shape(await read(await printerTemplate({ boxes: true }))), POPUP);
  const m = await read(await printerTemplate({ margin: 30 }));
  eq('a white margin round the artwork: the sheet is the bleed area, the template page placed round it', shape(m), { ...POPUP, tplBox: [-120, -120, 3260, 2560] });
}

/* ---------- boxes ---------- */
async function card({ media = [91, 61], trim, bleed, crop, rotate, userUnit, origin = [0, 0] }) {
  const doc = await PDFDocument.create();
  const u = userUnit ?? 1;
  const page = doc.addPage([mm(media[0]) / u, mm(media[1]) / u]);
  const [ox, oy] = origin;
  if (ox || oy) page.setMediaBox(ox, oy, mm(media[0]) / u, mm(media[1]) / u);
  const box = (b) => [ox + mm(b[0]) / u, oy + mm(media[1] - b[1] - b[3]) / u, mm(b[2]) / u, mm(b[3]) / u];
  if (rotate) page.setRotation(degrees(rotate));
  if (userUnit) page.node.set(PDFName.of('UserUnit'), PDFNumber.of(userUnit));
  if (bleed) page.setBleedBox(...box(bleed));
  if (trim) page.setTrimBox(...box(trim));
  if (crop) page.setCropBox(...box(crop));
  page.drawRectangle({ x: ox, y: oy, width: mm(media[0]) / u, height: mm(3) / u, color: rgb(0.9, 0.3, 0.4) });
  return doc.save();
}
{
  const i = await read(await card({ trim: [3, 3, 85, 55] }));
  eq('business card TrimBox: 85 × 55 at 3 mm, the card format’s 4 mm safe area', shape(i), { media: [91, 61], trim: [3, 3, 85, 55], safe: 4 });
  eq('… with the MediaBox not at 0,0', shape(await read(await card({ trim: [3, 3, 85, 55], origin: [100, 200] }))), { media: [91, 61], trim: [3, 3, 85, 55], safe: 4 });
  eq('crop marks: MediaBox 111 × 81, BleedBox 91 × 61, TrimBox 85 × 55 → 3 mm bleed, the slug left off', shape(await read(await card({ media: [111, 81], bleed: [10, 10, 91, 61], trim: [13, 13, 85, 55] }))), { media: [91, 61], trim: [3, 3, 85, 55], safe: 4, tplBox: [-10, -10, 111, 81] });
  eq('/Rotate 90: a landscape card stored portrait reads landscape, as every viewer shows it', shape(await read(await card({ media: [61, 91], trim: [3, 3, 55, 85], rotate: 90 }))), { media: [91, 61], trim: [3, 3, 85, 55], safe: 4 });
  eq('/Rotate 90 with an uneven TrimBox lands where pdf.js puts it (the bottom margin becomes the left)', shape(await read(await card({ media: [60, 100], trim: [2, 3, 52, 90], rotate: 90 }))).trim, [7, 2, 90, 52]);
  eq('/Rotate 270 likewise (the top margin becomes the left)', shape(await read(await card({ media: [60, 100], trim: [2, 3, 52, 90], rotate: 270 }))).trim, [3, 6, 90, 52]);
  const c = await read(await card({ media: [120, 90], crop: [10, 12, 91, 61] }));
  eq('a CropBox (cropped in Acrobat): the visible 91 × 61 page, not a "10 mm bleed" trim', [shape(c), c.confidence], [{ media: [91, 61], trim: [0, 0, 91, 61], safe: 3 }, 'low']);
  eq('/UserUnit 10: a 6 m banner reads 6020 × 2020, not a tenth of it', shape(await read(await card({ media: [6020, 2020], trim: [10, 10, 6000, 2000], userUnit: 10 }))), { media: [6020, 2020], trim: [10, 10, 6000, 2000], safe: 3 });
  const z = await read(await card({ media: [216, 303], trim: [0, 303, 0, 0] }));
  eq('a TrimBox of [0 0 0 0] is ignored, not a 0 × 0 mm card', [shape(z).trim, z.confidence], [[0, 0, 216, 303], 'low']);
}

/* ---------- pages ---------- */
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([mm(210), mm(297)]).drawText('Artwork guidelines — your template is on page 2.', { x: 40, y: 700, size: 12, font });
  await printerTemplate({ pdf: doc });
  const bytes = await doc.save();
  const p1 = await read(bytes, 1);
  eq('instructions sheet first: page 1 reads as an A4 page at low confidence', [shape(p1).media, p1.confidence, p1.pages], [[210, 297], 'low', 2]);
  const p2 = await read(bytes, 2);
  eq('… and page 2 is the pop-up template at full size', [shape(p2), p2.page], [POPUP, 2]);
}

/* ---------- file paths the API will sign ---------- */
{
  const good = ['templates/1761130000000-Straight-Fabric-Pop-Up-3-x-3-instantprint.pdf', 'uploads/1761130000000-logo-white_v2.svg', 'thumbs/0b0e9c1e-2f4f-4b51-9a57-6f2d1b7c9e10.jpg'];
  const bad = [
    'templates/%2e%2e/%2e%2e/crm-docs/projects/x/handover/pack-v1.pdf',
    'templates/.%2e/.%2E/crm-docs/a.pdf',
    'templates/.\t./.\n./crm-docs/a.pdf',
    'templates/../crm-docs/a.pdf',
    'templates/a/../../b.pdf',
    'templates\\..\\x.pdf',
    '/templates/a.pdf',
    'crm-docs/projects/a.pdf',
    'templates/',
    'templates/.hidden',
    'templates/a b.pdf',
    'templates/Pop-up...pdf',
  ];
  eq('okPath: the names the server makes pass', good.map(okPath), good.map(() => true));
  eq('okPath: no encoded or whitespace ".." (or any other folder) gets through', bad.map(okPath), bad.map(() => false));
  eq('safeName never makes a name okPath would refuse', ['Pop-up...pdf', '../../etc', 'a b%2e%2e.pdf', '.hidden'].map((n) => okPath(`templates/1-${safeName(n)}`)), [true, true, true, true]);
}

/* ---------- saved geometry ---------- */
{
  const g = { mediaW: 91, mediaH: 61, trim: { x: 3, y: 3, w: 85, h: 55 }, safe: 4 };
  eq('cleanGeometry: a business card is fine', !!cleanGeometry(g), true);
  eq('cleanGeometry: a 960 mm safe area on a 740 mm sheet (a misread "2960mm") is refused', cleanGeometry({ ...g, mediaW: 755, mediaH: 580, trim: { x: 7.5, y: 7.5, w: 740, h: 565 }, safe: 960 }), null);
  eq('cleanGeometry: a template placement (tplBox) is kept', cleanGeometry({ ...g, tplBox: { x: -10, y: -10, w: 111, h: 81 } })?.tplBox, { x: -10, y: -10, w: 111, h: 81 });
  eq('cleanGeometry: a broken tplBox is refused', cleanGeometry({ ...g, tplBox: { x: 'a', y: 0, w: 0, h: 1 } }), null);
}

/* ---------- photos ---------- */
{
  // A JPEG header with an EXIF APP1 holding Orientation (as phone cameras write it), in either byte order.
  const exif = (o, le) => {
    const u16 = (v) => (le ? [v & 255, v >> 8] : [v >> 8, v & 255]);
    const u32 = (v) => (le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
    const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(o), 0, 0, ...u32(0)];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const len = app1.length + 2;
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 0, 2]);
  };
  eq('EXIF orientation read from a phone JPEG (little- and big-endian)', [exif(6, true), exif(6, false), exif(3, true), exif(8, false), exif(1, true)].map(jpegOrientation), [6, 6, 3, 8, 1]);
  eq('a JPEG with no EXIF is upright', jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xda])), 1);
  // A 1×1 PNG: the exported image says its dpi, so print software opens it at its real size.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const out = Buffer.from(withDpi(png, 300).split(',')[1], 'base64');
  const chunks = [];
  for (let p = 8; p < out.length; ) {
    const n = out.readUInt32BE(p);
    chunks.push(out.toString('latin1', p + 4, p + 8));
    if (chunks.at(-1) === 'pHYs') chunks.push(out.readUInt32BE(p + 8), out[p + 16]);
    p += 12 + n;
  }
  eq('PNG export carries 300 dpi (pHYs 11811 px/m, right after IHDR)', chunks, ['IHDR', 'pHYs', 11811, 1, 'IDAT', 'IEND']);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
