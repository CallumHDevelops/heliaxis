/**
 * Drawings on survey photos (the cut-out panel area, cable routes, "battery here").
 *
 * Stored as vectors in crm_photos.markup, every coordinate 0..1 of the photo's width and height, so a
 * drawing fits the photo at any size (phone, report, print). Stroke widths and text sizes are a
 * fraction of the photo's longer side. A flattened JPEG (photo + drawing) is kept beside the photo
 * as crm_photos.markup_path for places that just want a picture.
 *
 *   { v: 1, items: [ { t: 'path', c: '#F8BC1E', w: 0.006, pts: [x0, y0, x1, y1, …] },
 *                    { t: 'arrow', c: '#E02424', w: 0.006, a: [x, y], b: [x, y] },
 *                    { t: 'text', c: '#F8BC1E', a: [x, y], s: 'Battery here', size: 0.04 } ] }
 *
 * No runtime imports: shared by the phone form, the APIs and the report. The canvas helpers at the
 * bottom only run in the browser.
 */

export type Pt = [number, number];
export type MarkupPath = { t: 'path'; c: string; w: number; pts: number[] };
export type MarkupArrow = { t: 'arrow'; c: string; w: number; a: Pt; b: Pt };
export type MarkupText = { t: 'text'; c: string; a: Pt; s: string; size: number };
export type MarkupItem = MarkupPath | MarkupArrow | MarkupText;
export type Markup = { v: 1; items: MarkupItem[] };

/** Solar yellow and red. */
export const MARKUP_COLOURS = ['#F8BC1E', '#E02424'] as const;
export const MARKUP_MAX_BYTES = 50_000;
const MAX_ITEMS = 300;
const MAX_PATH_NUMBERS = 4000;
const MAX_TEXT = 80;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** 4 decimals is under a pixel on a 2000 px photo, and keeps the JSON small. */
const round = (n: number) => Math.round(n * 10_000) / 10_000;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const coord = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : round(clamp(n, 0, 1));
};
const pt = (v: unknown): Pt | null => {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const x = coord(v[0]);
  const y = coord(v[1]);
  return x == null || y == null ? null : [x, y];
};
const colour = (v: unknown): string => {
  const c = typeof v === 'string' ? v.toUpperCase() : '';
  return (MARKUP_COLOURS as readonly string[]).includes(c) ? c : MARKUP_COLOURS[0];
};
const width = (v: unknown) => round(clamp(num(v) ?? 0.006, 0.001, 0.05));

/** A tidy, size-limited copy of a drawing from the phone, or null if there's nothing usable. */
export function cleanMarkup(x: unknown): Markup | null {
  if (!x || typeof x !== 'object') return null;
  const raw = (x as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;
  const items: MarkupItem[] = [];
  for (const r of raw.slice(0, MAX_ITEMS)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (o.t === 'path' && Array.isArray(o.pts)) {
      const pts: number[] = [];
      for (const v of o.pts.slice(0, MAX_PATH_NUMBERS)) {
        const n = coord(v);
        if (n == null) break;
        pts.push(n);
      }
      if (pts.length % 2) pts.pop();
      if (pts.length >= 2) items.push({ t: 'path', c: colour(o.c), w: width(o.w), pts });
    } else if (o.t === 'arrow') {
      const a = pt(o.a);
      const b = pt(o.b);
      if (a && b) items.push({ t: 'arrow', c: colour(o.c), w: width(o.w), a, b });
    } else if (o.t === 'text') {
      const a = pt(o.a);
      const s = typeof o.s === 'string' ? o.s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '';
      if (a && s) items.push({ t: 'text', c: colour(o.c), a, s, size: round(clamp(num(o.size) ?? 0.04, 0.01, 0.2)) });
    }
  }
  return items.length ? { v: 1, items } : null;
}

export const markupBytes = (m: Markup | null): number => (m ? JSON.stringify(m).length : 0);
export const hasDrawing = (m: unknown): boolean => !!cleanMarkup(m);

/** Where a photo's flattened drawing is kept: next to the photo, ".markup.jpg". */
export const markupPathFor = (storagePath: string): string => storagePath.replace(/\.[a-z0-9]+$/i, '') + '.markup.jpg';

/* ── Geometry, in pixels, for SVG (the report) and canvas (the editor and the flattened JPEG) ── */

export type Shape =
  | { kind: 'line'; d: string; stroke: string; width: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; fill: string; outline: number };

/** The arrow head's two side points, for a shaft from a to b (pixels). */
export function arrowHead(a: Pt, b: Pt, strokePx: number): [Pt, Pt] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const len = Math.max(12, strokePx * 4);
  const spread = Math.PI / 7;
  return [
    [b[0] - len * Math.cos(ang - spread), b[1] - len * Math.sin(ang - spread)],
    [b[0] - len * Math.cos(ang + spread), b[1] - len * Math.sin(ang + spread)],
  ];
}

const f1 = (n: number) => Math.round(n * 10) / 10;

/** A drawing as SVG-ready shapes for a W × H picture (path data and text positions in pixels). */
export function markupShapes(m: Markup | null, W: number, H: number): Shape[] {
  if (!m) return [];
  const long = Math.max(W, H);
  const out: Shape[] = [];
  for (const it of m.items) {
    if (it.t === 'path') {
      const p: string[] = [];
      for (let i = 0; i + 1 < it.pts.length; i += 2) p.push(`${i ? 'L' : 'M'}${f1(it.pts[i] * W)} ${f1(it.pts[i + 1] * H)}`);
      if (it.pts.length === 2) p.push(`l0.1 0`); // a dot
      out.push({ kind: 'line', d: p.join(' '), stroke: it.c, width: f1(it.w * long) });
    } else if (it.t === 'arrow') {
      const a: Pt = [it.a[0] * W, it.a[1] * H];
      const b: Pt = [it.b[0] * W, it.b[1] * H];
      const sw = it.w * long;
      const [l, r] = arrowHead(a, b, sw);
      out.push({
        kind: 'line',
        d: `M${f1(a[0])} ${f1(a[1])} L${f1(b[0])} ${f1(b[1])} M${f1(l[0])} ${f1(l[1])} L${f1(b[0])} ${f1(b[1])} L${f1(r[0])} ${f1(r[1])}`,
        stroke: it.c,
        width: f1(sw),
      });
    } else {
      const size = it.size * long;
      out.push({ kind: 'text', x: f1(it.a[0] * W), y: f1(it.a[1] * H), text: it.s, size: f1(size), fill: it.c, outline: f1(Math.max(2, size / 8)) });
    }
  }
  return out;
}

/** Draw onto a canvas already holding the W × H photo. Dark outlines keep yellow readable on a bright sky. */
export function drawMarkup(ctx: CanvasRenderingContext2D, m: Markup | null, W: number, H: number): void {
  for (const s of markupShapes(m, W, H)) {
    ctx.save();
    if (s.kind === 'line') {
      const path = new Path2D(s.d);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = s.width + Math.max(2, s.width * 0.6);
      ctx.stroke(path);
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.stroke(path);
    } else {
      ctx.font = `700 ${s.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = s.outline;
      ctx.strokeText(s.text, s.x, s.y);
      ctx.fillStyle = s.fill;
      ctx.fillText(s.text, s.x, s.y);
    }
    ctx.restore();
  }
}

/**
 * The photo with its drawing as one JPEG (long side ≤ 2000 px, quality 0.82), in the browser.
 * `src` is the photo (a Blob from the queue, or a signed URL for an uploaded photo).
 */
export async function flattenMarkup(src: Blob | string, m: Markup | null, maxSide = 2000, quality = 0.82): Promise<Blob> {
  let blob: Blob;
  if (typeof src === 'string') {
    const r = await fetch(src, { cache: 'no-store' });
    if (!r.ok) throw new Error('Couldn’t load the photo');
    blob = await r.blob();
  } else blob = src;
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const W = Math.round(bmp.width * scale);
  const H = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bmp, 0, 0, W, H);
  bmp.close();
  drawMarkup(ctx, m, W, H);
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!out) throw new Error('Couldn’t save the drawing');
  return out;
}
