/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Printer templates (PDF): read the page geometry, detect trim/bleed/safe, render page images.
 *
 * Everything is measured the way the template LOOKS (and the way pdf.js renders it): the visible
 * page (CropBox ∩ MediaBox), turned by its /Rotate, in mm (× /UserUnit), from its top-left.
 *
 * Geometry comes from, in order of trust:
 *  1. the PDF's own TrimBox / BleedBox (e.g. InDesign die-line templates; a press PDF with crop
 *     marks, where the sheet is the BleedBox and the slug round it is left off),
 *  2. the printer's dimension text (e.g. instantprint: "3020mm (W) x 2320mm (H) With Bleed",
 *     "This template is set up at 25% scale"),
 *  3. sensible defaults the user can adjust.
 *
 * The design is ALWAYS set up at the real printed size: a template drawn at 25% scale gives a
 * 3020 × 2320 mm sheet, and its page image is stretched over it (geometry.tplBox says where), so
 * its lines sit on real millimetres and the print PDF comes out at full size.
 */
import type { Box, PageGeometry } from '@/lib/design/types';
import { matchFormat, zonesOnTrim } from './formats';

const MM = 25.4 / 72;

export type TemplateInfo = {
  title: string | null;
  pages: number;
  /** The 1-based page this was read from. */
  page: number;
  geometry: PageGeometry;
  /** Human-readable notes on what was detected. */
  detected: string[];
  /** How sure we are about trim/bleed. */
  confidence: 'high' | 'medium' | 'low';
  /** The scale the template is drawn at (0.25 = 25%); the geometry is already at full size. */
  scale: number;
};

/** Thrown for a PDF the studio can't use at all (shown to the user as is). */
export class TemplateError extends Error {}

let pdfjsP: Promise<any> | null = null;
export function pdfjs(): Promise<any> {
  pdfjsP ??= import('pdfjs-dist').then((m: any) => {
    m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return m;
  });
  return pdfjsP;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** A PDF rectangle in user space (y up from the bottom-left), normalised. */
export type PBox = { x: number; y: number; width: number; height: number };
const norm = (b: PBox): PBox => ({
  x: Math.min(b.x, b.x + b.width),
  y: Math.min(b.y, b.y + b.height),
  width: Math.abs(b.width),
  height: Math.abs(b.height),
});
const intersect = (a: PBox, b: PBox): PBox | null => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x, h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
};
const within = (a: Box, b: Box, tol = 0.2) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;

export type PageFrame = {
  /** /Rotate, clockwise: 0, 90, 180 or 270. */
  rot: number;
  /** The visible area (CropBox ∩ MediaBox) in user space: exactly what pdf.js renders. */
  view: PBox;
  /** mm per PDF unit (/UserUnit included). */
  k: number;
  /** The page as shown (rotated), mm. */
  wMm: number;
  hMm: number;
  /** A PDF box → the shown page's mm, from its top-left. */
  toShown(b: PBox): Box;
  /** Back: a rectangle in the shown page's mm → user space. */
  toUser(r: Box): PBox;
};

/** How a pdf-lib page is shown: its visible box, rotation and unit, with converters both ways. */
export function pageFrame(page: any, PDFName: any): PageFrame {
  const media = norm(page.getMediaBox());
  const cropRaw = page.node.CropBox?.();
  const crop = cropRaw ? norm(cropRaw.asRectangle()) : null;
  const view = (crop && intersect(media, crop)) || media;
  let rot = (((page.getRotation()?.angle ?? 0) % 360) + 360) % 360;
  if (rot % 90) rot = 0;
  let uu = 1;
  try {
    const u = page.node.get(PDFName.of('UserUnit'));
    const n = typeof u?.asNumber === 'function' ? u.asNumber() : Number(u?.numberValue ?? NaN);
    if (Number.isFinite(n) && n > 0 && n <= 75000) uu = n;
  } catch {
    /* no UserUnit */
  }
  const k = MM * uu;
  const turned = rot === 90 || rot === 270;
  const Vw = view.width, Vh = view.height;
  /** user point → shown point (PDF units, y down from the shown top-left) */
  const fwd = (px: number, py: number): [number, number] => {
    const ux = px - view.x, uy = py - view.y;
    if (rot === 90) return [uy, ux];
    if (rot === 180) return [Vw - ux, uy];
    if (rot === 270) return [Vh - uy, Vw - ux];
    return [ux, Vh - uy];
  };
  const back = (dx: number, dy: number): [number, number] => {
    let ux: number, uy: number;
    if (rot === 90) [ux, uy] = [dy, dx];
    else if (rot === 180) [ux, uy] = [Vw - dx, dy];
    else if (rot === 270) [ux, uy] = [Vw - dy, Vh - dx];
    else [ux, uy] = [dx, Vh - dy];
    return [ux + view.x, uy + view.y];
  };
  const span = (pts: [number, number][]) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  return {
    rot,
    view,
    k,
    wMm: (turned ? Vh : Vw) * k,
    hMm: (turned ? Vw : Vh) * k,
    toShown(b) {
      const s = span([fwd(b.x, b.y), fwd(b.x + b.width, b.y), fwd(b.x, b.y + b.height), fwd(b.x + b.width, b.y + b.height)]);
      return { x: s.x0 * k, y: s.y0 * k, w: (s.x1 - s.x0) * k, h: (s.y1 - s.y0) * k };
    },
    toUser(r) {
      const x0 = r.x / k, y0 = r.y / k, x1 = (r.x + r.w) / k, y1 = (r.y + r.h) / k;
      const s = span([back(x0, y0), back(x1, y0), back(x0, y1), back(x1, y1)]);
      return { x: s.x0, y: s.y0, width: s.x1 - s.x0, height: s.y1 - s.y0 };
    },
  };
}

/* ---------- the printer's text ---------- */

// A number as printers write it: 3020, 2,960 or 7.5 — never the tail of a longer number.
const N = String.raw`(?<![\d.,])((?:\d{1,3}(?:,\d{3})+|\d{1,5})(?:\.\d+)?)`;
const num = (s: string) => Number(s.replace(/,/g, ''));
const BY = String.raw`\s*mm\s*\(W\)\s*[x×X*]\s*`;
const H_ = String.raw`\s*mm\s*\(H\)`;

/** "2960mm (W) x 2260mm (H) Finished Size" (instantprint), or with the label first ("Finished Size: …"). */
function dims(text: string, label: string, labelFirst: boolean) {
  const re = labelFirst
    ? new RegExp(`${label}\\s*[:\\-–]?\\s*${N}${BY}${N}${H_}`, 'i')
    : new RegExp(`${N}${BY}${N}${H_}\\s*[:\\-–]?\\s*${label}`, 'i');
  const m = re.exec(text);
  return m ? { w: num(m[1]), h: num(m[2]) } : null;
}

/** pdf.js: the page's text, and the document title (decrypted — pdf-lib's isn't, for a locked PDF). */
async function readText(bytes: Uint8Array, pageNo: number): Promise<{ text: string; title: string | null }> {
  const lib = await pdfjs();
  let pdf: any;
  try {
    pdf = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new TemplateError('This PDF is password-protected — ask the printer for an unlocked template.');
    throw e;
  }
  try {
    const p = await pdf.getPage(pageNo);
    const tc = await p.getTextContent();
    const text = tc.items.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ');
    const meta = await pdf.getMetadata().catch(() => null);
    const t = typeof meta?.info?.Title === 'string' ? meta.info.Title.trim() : '';
    return { text, title: t || null };
  } finally {
    pdf.destroy?.();
  }
}

export async function readTemplate(bytes: Uint8Array, pageNo = 1): Promise<TemplateInfo> {
  const { PDFDocument, PDFName } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPageCount();
  const pn = Math.min(Math.max(1, Math.floor(pageNo) || 1), pages);
  const page = doc.getPage(pn - 1);
  const fr = pageFrame(page, PDFName);
  const detected: string[] = [];
  let confidence: TemplateInfo['confidence'] = 'low';
  if (fr.rot) detected.push(`The page is turned ${fr.rot}° in the PDF — it’s used the way it’s shown.`);

  // All in the shown page's mm, at the template's own scale, from its top-left.
  const pageBox: Box = { x: 0, y: 0, w: fr.wMm, h: fr.hMm };
  let sheet: Box = pageBox;
  let trim: Box | null = null;
  let slugged = false;

  // 1) The PDF's own boxes. Only entries the PDF really has (pdf-lib's getTrimBox() falls back to
  //    the CropBox), clipped to the visible page, and big enough to mean something.
  const real = (entry: any): Box | null => {
    let r: PBox;
    try {
      if (!entry) return null;
      r = norm(entry.asRectangle());
    } catch {
      return null; // a malformed box entry
    }
    const v = intersect(r, fr.view);
    if (!v) return null;
    const b = fr.toShown(v);
    return b.w >= 1 && b.h >= 1 ? b : null;
  };
  const tb = real(page.node.TrimBox());
  if (tb) {
    // A press PDF with printer's marks: the sheet is the BleedBox; the slug round it is left off.
    const bb = real(page.node.BleedBox());
    if (bb && within(tb, bb) && (bb.w < pageBox.w - 0.2 || bb.h < pageBox.h - 0.2)) {
      sheet = bb;
      slugged = true;
    }
    if (Math.abs(tb.w - sheet.w) > 0.2 || Math.abs(tb.h - sheet.h) > 0.2) {
      trim = tb;
      confidence = 'high';
    } else slugged = false;
  }
  if (!trim) sheet = pageBox;

  // 2) The printer's dimension text.
  const { text, title: pdfTitle } = await readText(bytes, pn).catch((e) => {
    if (e instanceof TemplateError) throw e;
    return { text: '', title: null as string | null }; // text detection is best-effort
  });
  // Labels after the sizes (instantprint) or before them: read both ways, keep the reading that finds
  // more of the three (a label-first sheet read the other way pairs each size with the wrong label).
  const reading = (labelFirst: boolean) => {
    const r = { withBleed: dims(text, 'With Bleed', labelFirst), finished: dims(text, 'Finished Size', labelFirst), safeZone: dims(text, 'Safe Zone', labelFirst) };
    const found = [r.withBleed, r.finished, r.safeZone].filter(Boolean).length;
    const sane = (!r.withBleed || !r.finished || r.withBleed.w > r.finished.w) && (!r.finished || !r.safeZone || r.finished.w > r.safeZone.w);
    return { ...r, score: found + (sane ? 0.5 : 0) };
  };
  const a = reading(false), b = reading(true);
  const { withBleed, finished, safeZone } = b.score > a.score ? b : a;
  const pctM = new RegExp(`${N}\\s*%\\s*scale`, 'i').exec(text);
  const pct = pctM ? num(pctM[1]) : null;

  // Real mm per template mm: the stated scale, else the "with bleed" size against the sheet.
  let k = 1;
  if (pct && pct >= 5 && pct < 99.5) k = 100 / pct;
  else if (!pct && withBleed) {
    const kk = withBleed.w / sheet.w;
    if (kk > 1.01 && kk <= 20 && Math.abs(withBleed.h / sheet.h - kk) / kk < 0.02) k = kk;
  }
  const S = (b: Box): Box => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k });
  const pageR = S(pageBox);
  let media = S(sheet);
  let trimR = trim ? S(trim) : null;
  const pctText = `${round(100 / k, 1)}%`;
  if (k > 1.01) detected.push(`The template is drawn at ${pctText} scale — your design is set up at full size and the template is scaled up to match.`);

  if (trimR) {
    detected.push(
      `Trim box ${round(trimR.w, 1)} × ${round(trimR.h, 1)} mm with ${round(trimR.x - media.x, 1)} mm bleed (from the PDF${slugged ? '; the crop marks and slug outside its bleed box are left off' : ''}).`,
    );
  } else if (withBleed && finished && finished.w < withBleed.w && finished.h < withBleed.h) {
    const tol = (v: number) => Math.max(1, v * 0.005);
    if (Math.abs(pageR.w - withBleed.w) <= tol(withBleed.w) && Math.abs(pageR.h - withBleed.h) <= tol(withBleed.h)) {
      media = pageR;
      confidence = 'high';
    } else if (pageR.w >= withBleed.w && pageR.h >= withBleed.h) {
      // the page has a margin round the artwork (notes outside it): the sheet is the bleed area in the middle
      media = { x: (pageR.w - withBleed.w) / 2, y: (pageR.h - withBleed.h) / 2, w: withBleed.w, h: withBleed.h };
      confidence = 'medium';
      detected.push('The page is bigger than the printer’s “with bleed” size, so that size is centred on it — check the guides sit on the template’s own lines.');
    } else {
      media = pageR;
      confidence = 'medium';
      detected.push('The page is smaller than the printer’s “with bleed” size — check the numbers below.');
    }
    trimR = { x: media.x + (media.w - finished.w) / 2, y: media.y + (media.h - finished.h) / 2, w: finished.w, h: finished.h };
    detected.push(`Printer spec found: ${finished.w} × ${finished.h} mm finished, ${withBleed.w} × ${withBleed.h} mm with bleed (${round((withBleed.w - finished.w) / 2, 1)} mm bleed).`);
  } else if (!withBleed) {
    const bm = new RegExp(`${N}\\s*mm\\s*bleed`, 'i').exec(text);
    const b = bm ? num(bm[1]) : 0;
    if (b > 0 && b < Math.min(media.w, media.h) / 4) {
      trimR = { x: media.x + b, y: media.y + b, w: media.w - 2 * b, h: media.h - 2 * b };
      detected.push(`“${bm![0]}” found in the template.`);
      confidence = 'medium';
    }
  }

  // Everything relative to the sheet (media), as the document keeps it.
  const tr: Box = trimR
    ? { x: round(trimR.x - media.x), y: round(trimR.y - media.y), w: round(trimR.w), h: round(trimR.h) }
    : { x: 0, y: 0, w: round(media.w), h: round(media.h) };
  const okSafe = (v: number) => Number.isFinite(v) && v > 0 && v < Math.min(tr.w, tr.h) / 2;
  let safe: number | null = null;
  if (safeZone) {
    const v = ((finished?.w ?? tr.w) - safeZone.w) / 2;
    if (okSafe(v)) {
      safe = round(v);
      detected.push(`Safe zone ${safe} mm inside the cut (from the template text).`);
    }
  }
  if (safe == null) {
    const sm = new RegExp(String.raw`safe\s*(?:zone|area)[^.]{0,60}?${N}\s*mm`, 'i').exec(text);
    const v = sm ? num(sm[1]) : NaN;
    if (okSafe(v)) {
      safe = v;
      detected.push(`Safe area ${safe} mm (from the template text).`);
    }
  }

  if (confidence === 'low') {
    detected.push('No trim/bleed found in the PDF — treating the whole page as the finished size. Adjust below if your printer says otherwise.');
  }

  const sameAsPage = Math.abs(media.x) < 0.01 && Math.abs(media.y) < 0.01 && Math.abs(media.w - pageR.w) < 0.01 && Math.abs(media.h - pageR.h) < 0.01;
  const geometry: PageGeometry = {
    mediaW: round(media.w),
    mediaH: round(media.h),
    trim: tr,
    safe: 3,
    note: k > 1.01 ? `Printer template drawn at ${pctText} — set up at full size.` : null,
    ...(sameAsPage ? {} : { tplBox: { x: round(-media.x), y: round(-media.y), w: round(pageR.w), h: round(pageR.h) } }),
  };
  const known = matchFormat(geometry);
  if (safe == null && known && okSafe(known.safe)) safe = known.safe;
  geometry.safe = safe ?? (okSafe(3) ? 3 : 0);
  if (known?.zones?.length) {
    geometry.zones = zonesOnTrim(known, tr);
    detected.push(`Same size as our ${known.label} — its ${known.zones.some((z) => z.kind === 'wrap') ? 'wrap-round' : 'no-go'} zones are marked for you.`);
  }

  return {
    // pdf-lib reads an encrypted PDF's title still encrypted (garbage): only trust pdf.js's then.
    title: pdfTitle ?? (doc.isEncrypted ? null : doc.getTitle()?.trim() || null),
    pages,
    page: pn,
    geometry,
    detected,
    confidence,
    scale: round(1 / k, 4),
  };
}

/**
 * Turn the template's white paper transparent (edges faded), so its die-lines and notes can sit
 * on top of any design — a multiply blend would lose them on a dark background.
 */
function knockOutWhite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const lo = Math.min(d[i], d[i + 1], d[i + 2]);
    if (lo > 232) d[i + 3] = Math.round((d[i + 3] * (255 - lo)) / 23);
  }
  ctx.putImageData(img, 0, 0);
}

/** Render a template page to a transparent canvas (longest side ≈ maxPx), white knocked out. */
export async function renderTemplate(bytes: Uint8Array, pageNo = 1, maxPx = 4096): Promise<HTMLCanvasElement> {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const page = await pdf.getPage(Math.max(1, pageNo));
    const base = page.getViewport({ scale: 1 });
    const scale = maxPx / Math.max(base.width, base.height);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width);
    cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp, background: 'rgba(0,0,0,0)', annotationMode: lib.AnnotationMode?.DISABLE }).promise;
    knockOutWhite(ctx, cv.width, cv.height);
    return cv;
  } finally {
    pdf.destroy?.();
  }
}
