/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Print-ready vector PDF export (and PNG/JPG raster export).
 *
 * Every page is re-loaded into an off-screen fabric canvas (so text has real layout), then each
 * object becomes raw PDF operators in a y-down "design space" (1 unit = 1 pt, origin = media
 * top-left) set up by one flip matrix. Text is converted to OUTLINES with fontkit, reproducing
 * fabric's own line layout so print matches screen. Shapes stay vector; photos are embedded at
 * native resolution; the brand background's glow is a native radial shading. Anything we can't
 * express as vector is rasterised at print resolution and reported in `warnings`.
 *
 * Notes from research (pdf-lib 1.17.1): appendQuadraticCurve is wrong (emits `v`), so quadratics
 * are converted to cubics here; embedPdf/embedPage need an explicit bbox for non-zero MediaBox
 * origins; borderColor without width emits a 0-width hairline (never do that).
 */
import {
  BlendMode,
  LineCapStyle,
  LineJoinStyle,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  appendBezierCurve,
  clip,
  closePath,
  cmyk,
  concatTransformationMatrix,
  drawObject,
  endPath,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setDashPattern,
  setFillingColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  type Color,
  type PDFPage,
} from 'pdf-lib';
import type { DesignDoc } from '@/lib/design/types';
import { PT_PER_MM } from '@/lib/design/types';
import { hexToCmyk, matchBrand, type CMYK } from './brand';
import { fontChain, fontFor, normWeight } from './fonts';
import { LABEL_BASELINE, gridMask, gridPitch, type FabricNS } from './engine';

export type ExportOptions = {
  cmyk: boolean;
  cropMarks: boolean;
  /** Large solid Ink areas print as a rich black build (prints deeper than 0/6/27/87). */
  richBlack: boolean;
  richBlackCmyk: CMYK;
  /** Small dark text → 100% K with overprint (no registration fringing). */
  blackText: boolean;
  /** Brand colour id → CMYK overrides (from Print colours). */
  printColours?: Record<string, CMYK>;
  includeTemplate: boolean;
  templateBytes?: Uint8Array | null;
  title: string;
  /** Resolution for anything rasterised (pt → px at this dpi). */
  rasterDpi: number;
};

export type ExportResult = { bytes: Uint8Array; warnings: string[] };

const KAPPA = 0.5522847498;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
type Op = PDFOperator;
type M6 = [number, number, number, number, number, number];

function parseColour(f: FabricNS, v: unknown): { r: number; g: number; b: number; a: number; hex: string } | null {
  if (typeof v !== 'string' || !v || v === 'none' || v === 'transparent') return null;
  try {
    const c = new f.Color(v);
    const [r, g, b, a] = c.getSource();
    if (a === 0) return null;
    return { r, g, b, a: a ?? 1, hex: '#' + c.toHex().toUpperCase() };
  } catch {
    return null;
  }
}

/** Per-page drawing context: operator buffer + resource caches. */
class PageCtx {
  ops: Op[] = [];
  private gs = new Map<string, PDFName>();
  private xo = new Map<any, PDFName>();
  private sh = 0;
  constructor(public pdf: PDFDocument, public page: PDFPage) {}
  flush() {
    if (this.ops.length) this.page.pushOperators(...this.ops);
    this.ops = [];
  }
  extGState(ca: number, CA: number, overprint = false, multiply = false): PDFName | null {
    if (ca >= 0.999 && CA >= 0.999 && !overprint && !multiply) return null;
    const key = `${r3(ca)}|${r3(CA)}|${overprint ? 1 : 0}|${multiply ? 1 : 0}`;
    let n = this.gs.get(key);
    if (!n) {
      const dict: Record<string, unknown> = { Type: 'ExtGState', ca: r3(ca), CA: r3(CA) };
      if (overprint) Object.assign(dict, { OP: true, op: true, OPM: 1 });
      if (multiply) dict.BM = BlendMode.Multiply;
      n = this.page.node.newExtGState('GS', this.pdf.context.obj(dict as any) as unknown as PDFDict);
      this.gs.set(key, n);
    }
    return n;
  }
  xobject(ref: any): PDFName {
    let n = this.xo.get(ref);
    if (!n) {
      n = this.page.node.newXObject('Im', ref);
      this.xo.set(ref, n);
    }
    return n;
  }
  /** Register a shading dictionary in the page's resources; returns its name. */
  shading(dict: Record<string, unknown>): PDFName {
    const res = this.page.node.Resources() as PDFDict;
    let shDict = res.lookupMaybe(PDFName.of('Shading'), PDFDict);
    if (!shDict) {
      shDict = this.pdf.context.obj({}) as PDFDict;
      res.set(PDFName.of('Shading'), shDict);
    }
    const name = PDFName.of(`Sh${++this.sh}`);
    shDict.set(name, this.pdf.context.register(this.pdf.context.obj(dict as any)));
    return name;
  }
}

export async function exportPdf(
  f: FabricNS,
  doc: DesignDoc,
  pageJsons: Record<string, unknown>[],
  opts: ExportOptions,
): Promise<ExportResult> {
  const warnings = new Set<string>();
  const PT = PT_PER_MM;
  const g = doc.geometry;
  const W = g.mediaW * PT;
  const H = g.mediaH * PT;
  const bleedMm = Math.max(g.trim.x, g.trim.y, g.mediaW - g.trim.x - g.trim.w, g.mediaH - g.trim.y - g.trim.h);
  const markOff = Math.max(bleedMm, 3) * PT;
  const markLen = 5 * PT;
  const slug = opts.cropMarks ? markOff + markLen + 4 * PT : 0;

  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title || 'Heliaxis design');
  pdf.setCreator('Heliaxis Design Studio');
  pdf.setProducer('Heliaxis Design Studio');
  pdf.setCreationDate(new Date());

  // Optional: the printer template itself, embedded as vector.
  let tpl: any = null;
  if (opts.includeTemplate && opts.templateBytes && doc.template) {
    try {
      const src = await PDFDocument.load(opts.templateBytes, { ignoreEncryption: true });
      const sp = src.getPage(Math.max(0, (doc.template.page ?? 1) - 1));
      const mb = sp.getMediaBox();
      tpl = await pdf.embedPage(sp, { left: mb.x, bottom: mb.y, right: mb.x + mb.width, top: mb.y + mb.height });
    } catch {
      warnings.add('The template PDF couldn’t be embedded, so it was left out.');
    }
  }

  /* ---------- colour ---------- */
  type Paint = { color: Color; alpha: number; overprint: boolean };
  const toPaint = (
    v: unknown,
    ctx: { kind: 'fill' | 'stroke' | 'text'; areaMm2?: number; sizePt?: number },
  ): Paint | null => {
    const c = parseColour(f, v);
    if (!c) return null;
    if (!opts.cmyk) return { color: rgb(c.r / 255, c.g / 255, c.b / 255), alpha: c.a, overprint: false };
    const brand = matchBrand(c.hex);
    let k: CMYK = brand ? (opts.printColours?.[brand.id] ?? hexToCmyk(brand.hex)) : hexToCmyk(c.hex);
    let overprint = false;
    const darkInk = brand?.id === 'ink' || brand?.id === 'ink2';
    if (ctx.kind === 'text' && opts.blackText && darkInk && (ctx.sizePt ?? 99) < 12) {
      k = [0, 0, 0, 100];
      overprint = true;
    } else if (ctx.kind === 'fill' && opts.richBlack && brand?.id === 'ink' && (ctx.areaMm2 ?? 0) > 2500) {
      k = opts.richBlackCmyk;
    }
    return { color: cmyk(k[0] / 100, k[1] / 100, k[2] / 100, k[3] / 100), alpha: c.a, overprint };
  };

  /* ---------- images ---------- */
  const imgCache = new Map<string, Promise<any>>();
  const embedImage = (o: any): Promise<any> => {
    const src: string = o.getSrc?.() || o._element?.src || '';
    const key = src || `el-${o.id}`;
    if (!imgCache.has(key)) {
      imgCache.set(
        key,
        (async () => {
          let bytes: Uint8Array | null = null;
          try {
            if (src && !src.startsWith('data:')) {
              const res = await fetch(src, { credentials: 'same-origin' });
              if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
            } else if (src.startsWith('data:')) {
              bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
            }
          } catch {
            bytes = null;
          }
          if (bytes && bytes[0] === 0xff && bytes[1] === 0xd8) return pdf.embedJpg(bytes);
          if (bytes && bytes[0] === 0x89 && bytes[1] === 0x50) return pdf.embedPng(bytes);
          // WebP / GIF / anything else: re-encode losslessly via a canvas at native size.
          const el: HTMLImageElement | HTMLCanvasElement = o.getElement();
          const nw = (el as HTMLImageElement).naturalWidth || el.width;
          const nh = (el as HTMLImageElement).naturalHeight || el.height;
          const cv = document.createElement('canvas');
          cv.width = nw;
          cv.height = nh;
          cv.getContext('2d')!.drawImage(el, 0, 0, nw, nh);
          return pdf.embedPng(cv.toDataURL('image/png'));
        })(),
      );
    }
    return imgCache.get(key)!;
  };

  /* ---------- path helpers (design space, y-down) ---------- */
  const rectOps = (x: number, y: number, w: number, h: number, rx = 0, ry = 0): Op[] => {
    rx = Math.min(Math.abs(rx), w / 2);
    ry = Math.min(Math.abs(ry), h / 2);
    if (!rx && !ry) return [rectangle(r3(x), r3(y), r3(w), r3(h))];
    const kx = rx * KAPPA, ky = ry * KAPPA;
    return [
      moveTo(r3(x + rx), r3(y)),
      lineTo(r3(x + w - rx), r3(y)),
      appendBezierCurve(r3(x + w - rx + kx), r3(y), r3(x + w), r3(y + ry - ky), r3(x + w), r3(y + ry)),
      lineTo(r3(x + w), r3(y + h - ry)),
      appendBezierCurve(r3(x + w), r3(y + h - ry + ky), r3(x + w - rx + kx), r3(y + h), r3(x + w - rx), r3(y + h)),
      lineTo(r3(x + rx), r3(y + h)),
      appendBezierCurve(r3(x + rx - kx), r3(y + h), r3(x), r3(y + h - ry + ky), r3(x), r3(y + h - ry)),
      lineTo(r3(x), r3(y + ry)),
      appendBezierCurve(r3(x), r3(y + ry - ky), r3(x + rx - kx), r3(y), r3(x + rx), r3(y)),
      closePath(),
    ];
  };
  const ellipseOps = (cx: number, cy: number, rx: number, ry: number): Op[] => {
    const kx = rx * KAPPA, ky = ry * KAPPA;
    return [
      moveTo(r3(cx + rx), r3(cy)),
      appendBezierCurve(r3(cx + rx), r3(cy + ky), r3(cx + kx), r3(cy + ry), r3(cx), r3(cy + ry)),
      appendBezierCurve(r3(cx - kx), r3(cy + ry), r3(cx - rx), r3(cy + ky), r3(cx - rx), r3(cy)),
      appendBezierCurve(r3(cx - rx), r3(cy - ky), r3(cx - kx), r3(cy - ry), r3(cx), r3(cy - ry)),
      appendBezierCurve(r3(cx + kx), r3(cy - ry), r3(cx + rx), r3(cy - ky), r3(cx + rx), r3(cy)),
      closePath(),
    ];
  };
  /** fabric path commands (absolute M L C Q Z after parsing) → operators, offset by -pathOffset. */
  const fabricPathOps = (cmds: any[], ox: number, oy: number): Op[] => {
    const out: Op[] = [];
    let cx = 0, cy = 0, sx = 0, sy = 0;
    for (const c of cmds) {
      const t = c[0];
      if (t === 'M') { cx = sx = c[1] - ox; cy = sy = c[2] - oy; out.push(moveTo(r3(cx), r3(cy))); }
      else if (t === 'L') { cx = c[1] - ox; cy = c[2] - oy; out.push(lineTo(r3(cx), r3(cy))); }
      else if (t === 'C') {
        out.push(appendBezierCurve(r3(c[1] - ox), r3(c[2] - oy), r3(c[3] - ox), r3(c[4] - oy), r3(c[5] - ox), r3(c[6] - oy)));
        cx = c[5] - ox; cy = c[6] - oy;
      } else if (t === 'Q') {
        const qx = c[1] - ox, qy = c[2] - oy, x = c[3] - ox, y = c[4] - oy;
        out.push(appendBezierCurve(r3(cx + (2 / 3) * (qx - cx)), r3(cy + (2 / 3) * (qy - cy)), r3(x + (2 / 3) * (qx - x)), r3(y + (2 / 3) * (qy - y)), r3(x), r3(y)));
        cx = x; cy = y;
      } else if (t === 'Z' || t === 'z') { out.push(closePath()); cx = sx; cy = sy; }
      else if (t === 'H') { cx = c[1] - ox; out.push(lineTo(r3(cx), r3(cy))); }
      else if (t === 'V') { cy = c[1] - oy; out.push(lineTo(r3(cx), r3(cy))); }
    }
    return out;
  };
  /** fontkit glyph path (font units, y-up) placed at (gx, gy) with scale k, into y-down space. */
  const glyphOps = (path: any, gx: number, gy: number, k: number): Op[] => {
    const out: Op[] = [];
    let cx = 0, cy = 0, sx = 0, sy = 0;
    const X = (v: number) => r3(gx + v * k), Y = (v: number) => r3(gy - v * k);
    for (const { command, args: a } of path.commands) {
      if (command === 'moveTo') { cx = sx = a[0]; cy = sy = a[1]; out.push(moveTo(X(a[0]), Y(a[1]))); }
      else if (command === 'lineTo') { cx = a[0]; cy = a[1]; out.push(lineTo(X(a[0]), Y(a[1]))); }
      else if (command === 'quadraticCurveTo') {
        const [qx, qy, x, y] = a;
        out.push(appendBezierCurve(X(cx + (2 / 3) * (qx - cx)), Y(cy + (2 / 3) * (qy - cy)), X(x + (2 / 3) * (qx - x)), Y(y + (2 / 3) * (qy - y)), X(x), Y(y)));
        cx = x; cy = y;
      } else if (command === 'bezierCurveTo') {
        out.push(appendBezierCurve(X(a[0]), Y(a[1]), X(a[2]), Y(a[3]), X(a[4]), Y(a[5])));
        cx = a[4]; cy = a[5];
      } else if (command === 'closePath') { out.push(closePath()); cx = sx; cy = sy; }
    }
    return out;
  };

  const det = (m: number[]) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

  /** Shape a single-line string (kerning, tracking, per-glyph font fallback) → width + ops builder. */
  const shapeRun = async (text: string, stack: string, weight: unknown, size: number, spacing = 0) => {
    const fonts = await fontChain(stack, normWeight(weight));
    if (!fonts.length) return null;
    const sp = (spacing / 1000) * size;
    const items: { path: any; x: number; y: number; k: number }[] = [];
    let pen = 0;
    const primary = fonts[0];
    const chars = [...text];
    const allIn = chars.every((ch) => primary.hasGlyphForCodePoint(ch.codePointAt(0)!));
    if (allIn && !sp) {
      const run = primary.layout(text);
      const k = size / primary.unitsPerEm;
      run.glyphs.forEach((gl: any, i: number) => {
        const p = run.positions[i];
        items.push({ path: gl.path, x: pen + p.xOffset * k, y: -p.yOffset * k, k });
        pen += p.xAdvance * k;
      });
    } else {
      chars.forEach((ch, i) => {
        const font = fonts.find((fo: any) => fo.hasGlyphForCodePoint(ch.codePointAt(0)!));
        if (!font) {
          if (!/\s/.test(ch)) warnings.add(`“${ch}” isn’t in the brand fonts and was left out — use an icon instead.`);
          pen += size * 0.3;
          return;
        }
        const k = size / font.unitsPerEm;
        const r = font.layout(ch);
        items.push({ path: r.glyphs[0].path, x: pen, y: 0, k });
        pen += r.positions[0].xAdvance * k + (i < chars.length - 1 ? sp : 0);
      });
    }
    return { width: pen, ops: (x0: number, y: number) => items.flatMap((it) => glyphOps(it.path, x0 + it.x, y + it.y, it.k)) };
  };

  /* ---------- per page ---------- */
  for (let pi = 0; pi < pageJsons.length; pi++) {
    const page = pdf.addPage([W + 2 * slug, H + 2 * slug]);
    page.setBleedBox(slug, slug, W, H);
    const trimPdfY = slug + H - (g.trim.y + g.trim.h) * PT;
    page.setTrimBox(slug + g.trim.x * PT, trimPdfY, g.trim.w * PT, g.trim.h * PT);
    const pc = new PageCtx(pdf, page);

    if (tpl && doc.template?.mode !== 'over') page.drawPage(tpl, { x: slug, y: slug, width: W, height: H });

    // Design space: flip y, origin at the media top-left; clip to the bleed box.
    pc.ops.push(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, slug, slug + H), rectangle(0, 0, r3(W), r3(H)), clip(), endPath());

    const el = document.createElement('canvas');
    const sc = new (f as any).StaticCanvas(el, { width: Math.ceil(W), height: Math.ceil(H), renderOnAddRemove: false, enableRetinaScaling: false });
    await sc.loadFromJSON(pageJsons[pi]);

    const paintPath = (ops: Op[], fillP: Paint | null, strokeP: Paint | null, o: any, m: number[], opacity: number, evenOdd = false) => {
      if (!fillP && !strokeP) return;
      const gs = pc.extGState((fillP?.alpha ?? 1) * opacity, (strokeP?.alpha ?? 1) * opacity, !!fillP?.overprint, o.globalCompositeOperation === 'multiply');
      if (gs) pc.ops.push(setGraphicsState(gs));
      if (fillP) pc.ops.push(setFillingColor(fillP.color));
      if (strokeP) {
        const lw = o.strokeUniform ? o.strokeWidth / det(m) : o.strokeWidth;
        pc.ops.push(setStrokingColor(strokeP.color), setLineWidth(r3(Math.max(lw, 0.1))));
        pc.ops.push(setLineCap(o.strokeLineCap === 'round' ? LineCapStyle.Round : o.strokeLineCap === 'square' ? LineCapStyle.Projecting : LineCapStyle.Butt));
        pc.ops.push(setLineJoin(o.strokeLineJoin === 'round' ? LineJoinStyle.Round : o.strokeLineJoin === 'bevel' ? LineJoinStyle.Bevel : LineJoinStyle.Miter));
        if (Array.isArray(o.strokeDashArray) && o.strokeDashArray.length) pc.ops.push(setDashPattern(o.strokeDashArray.map(r3), 0));
      }
      const strokeFirst = o.paintFirst === 'stroke';
      if (fillP && strokeP) {
        if (strokeFirst) {
          pc.ops.push(...ops, stroke(), ...ops, evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill());
        } else {
          pc.ops.push(...ops, evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke) : fillAndStroke());
        }
      } else if (fillP) pc.ops.push(...ops, evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill());
      else pc.ops.push(...ops, stroke());
    };

    const areaMm2 = (o: any) => {
      const b = o.getBoundingRect();
      return (b.width / PT) * (b.height / PT);
    };

    const rasterise = async (o: any, why: string) => {
      const b = o.getBoundingRect();
      if (b.width < 0.01 || b.height < 0.01) return;
      const mult = Math.min(opts.rasterDpi / 72, 9000 / Math.max(b.width, b.height));
      const url = o.toDataURL({ format: 'png', multiplier: mult, enableRetinaScaling: false });
      const img = await pdf.embedPng(url);
      const n = pc.xobject(img.ref);
      pc.ops.push(pushGraphicsState(), concatTransformationMatrix(r3(b.width), 0, 0, r3(-b.height), r3(b.left), r3(b.top + b.height)), drawObject(n), popGraphicsState());
      warnings.add(`${o.name || o.type} was printed as an image (${why}).`);
    };

    const renderText = async (o: any, m: number[], opacity: number): Promise<boolean> => {
      const lines: string[][] = o._textLines || [];
      const fams: string[] = [];
      // Fonts available for every chunk? If not, caller rasterises.
      for (let i = 0; i < lines.length; i++) {
        if (!o.__charBounds?.[i]) o.getLineWidth?.(i);
      }
      let lineTop = -o.height / 2;
      const scale = det(m);
      const chunks: { ops: Op[]; fill: unknown; size: number }[] = [];
      for (let i = 0; i < lines.length; i++) {
        const gr = lines[i];
        const bounds = o.__charBounds?.[i] || [];
        const hLine = o.getHeightOfLine(i);
        const baseline = lineTop + (hLine * (1 - o._fontSizeFraction)) / o.lineHeight;
        const lineX = -o.width / 2 + o._getLineLeftOffset(i);
        let j = 0;
        while (j < gr.length) {
          if (/\s/.test(gr[j])) { j++; continue; }
          const decl = o.getCompleteStyleDeclaration(i, j);
          const sig = (d: any) => `${d.fill}|${d.fontFamily}|${d.fontWeight}|${d.fontSize}|${d.deltaY || 0}`;
          let k = j + 1;
          if (!o.charSpacing) {
            while (k < gr.length && !/\s/.test(gr[k]) && sig(o.getCompleteStyleDeclaration(i, k)) === sig(decl)) k++;
          }
          const text = gr.slice(j, k).join('');
          const weight = normWeight(decl.fontWeight);
          const fonts = await fontChain(decl.fontFamily, weight);
          if (!fonts.length) return false;
          fams.push(decl.fontFamily);
          const size = decl.fontSize;
          const y = baseline + (decl.deltaY || 0);
          const ops: Op[] = [];
          const x0 = lineX + (bounds[j]?.left ?? 0);
          const primary = fonts[0];
          const run = primary.layout(text);
          if (run.glyphs.every((gl: any) => gl.id !== 0)) {
            const kk = size / primary.unitsPerEm;
            let pen = 0;
            run.glyphs.forEach((gl: any, gi: number) => {
              const p = run.positions[gi];
              ops.push(...glyphOps(gl.path, x0 + (pen + p.xOffset) * kk, y - p.yOffset * kk, kk));
              pen += p.xAdvance;
            });
          } else {
            // Per-grapheme fallback along the font chain (matches the canvas's own fallback).
            for (let q = j; q < k; q++) {
              const ch = gr[q];
              const cp = ch.codePointAt(0)!;
              const font = fonts.find((fo: any) => fo.hasGlyphForCodePoint(cp));
              if (!font) {
                warnings.add(`“${ch}” isn’t in the brand fonts and was left out — use an icon instead.`);
                continue;
              }
              const kk = size / font.unitsPerEm;
              const gl = font.layout(ch).glyphs[0];
              ops.push(...glyphOps(gl.path, lineX + (bounds[q]?.left ?? 0), y, kk));
            }
          }
          if (ops.length) chunks.push({ ops, fill: decl.fill, size: size * scale });
          j = k;
        }
        lineTop += hLine;
      }
      pc.ops.push(pushGraphicsState(), concatTransformationMatrix(...(m.map(r3) as M6)));
      for (const c of chunks) {
        const p = toPaint(c.fill, { kind: 'text', sizePt: c.size });
        if (!p) continue;
        const gs = pc.extGState(p.alpha * opacity, 1, p.overprint);
        pc.ops.push(pushGraphicsState());
        if (gs) pc.ops.push(setGraphicsState(gs));
        pc.ops.push(setFillingColor(p.color), ...c.ops, fill(), popGraphicsState());
      }
      pc.ops.push(popGraphicsState());
      return true;
    };

    const renderBrandBg = (o: any, m: number[], opacity: number) => {
      const spec = o.brandBg || { base: o.fill || '#211F18', glow: true, grid: true, dark: true };
      const w = o.width, h = o.height, x = -w / 2, y = -h / 2;
      const area = areaMm2(o);
      const baseP = toPaint(spec.base, { kind: 'fill', areaMm2: area });
      pc.ops.push(pushGraphicsState(), concatTransformationMatrix(...(m.map(r3) as M6)));
      const gs0 = pc.extGState(opacity, opacity);
      if (gs0) pc.ops.push(setGraphicsState(gs0));
      if (baseP) pc.ops.push(setFillingColor(baseP.color), rectangle(r3(x), r3(y), r3(w), r3(h)), fill());
      pc.ops.push(rectangle(r3(x), r3(y), r3(w), r3(h)), clip(), endPath());
      if (spec.glow) {
        // Pre-blend the glow over the base (opaque shading): centre = mix(base, gold, a), edge = base.
        const a = spec.dark ? 0.2 : 0.1;
        let c0: number[], c1: number[], cs: string;
        if (opts.cmyk) {
          const brand = matchBrand(spec.base);
          let base: CMYK = brand ? (opts.printColours?.[brand.id] ?? hexToCmyk(brand.hex)) : hexToCmyk(spec.base);
          if (opts.richBlack && brand?.id === 'ink' && area > 2500) base = opts.richBlackCmyk;
          const gold: CMYK = opts.printColours?.solar ?? hexToCmyk('#F8BC1E');
          c1 = base.map((v) => v / 100);
          c0 = base.map((v, i) => (v * (1 - a) + gold[i] * a) / 100);
          cs = 'DeviceCMYK';
        } else {
          const b = parseColour(f, spec.base) ?? { r: 33, g: 31, b: 24 };
          c1 = [b.r / 255, b.g / 255, b.b / 255];
          c0 = [(b.r * (1 - a) + 248 * a) / 255, (b.g * (1 - a) + 188 * a) / 255, (b.b * (1 - a) + 30 * a) / 255];
          cs = 'DeviceRGB';
        }
        const sh = pc.shading({
          ShadingType: 3,
          ColorSpace: cs,
          Coords: [0, 0, 0, 0, 0, 1],
          Function: { FunctionType: 2, Domain: [0, 1], C0: c0.map(r3), C1: c1.map(r3), N: 1 },
          Extend: [false, true],
        });
        const cx = x + w * 0.92, cy = y - h * 0.1, rx = w * 0.8 * 0.46, ry = h * 0.9 * 0.46;
        pc.ops.push(pushGraphicsState(), concatTransformationMatrix(r3(rx), 0, 0, r3(ry), r3(cx), r3(cy)), PDFOperator.of(PDFOperatorNames.ShadingFill, [sh]), popGraphicsState());
      }
      if (spec.grid) {
        const p = gridPitch(w, h);
        const colour = spec.dark ? '#F7F2E7' : '#211F18';
        const base = spec.dark ? 0.05 : 0.045;
        const levels = new Map<number, Op[]>();
        const seg = (x1: number, y1: number, x2: number, y2: number, mask: number) => {
          if (mask <= 0.01) return;
          const lv = Math.max(1, Math.round(mask * 8)) / 8;
          const arr = levels.get(lv) ?? [];
          arr.push(moveTo(r3(x + x1), r3(y + y1)), lineTo(r3(x + x2), r3(y + y2)));
          levels.set(lv, arr);
        };
        for (let gx = p; gx < w; gx += p) for (let gy = 0; gy < h; gy += p) seg(gx, gy, gx, Math.min(h, gy + p), gridMask(gx, gy + p / 2, w, h));
        for (let gy = p; gy < h; gy += p) for (let gx = 0; gx < w; gx += p) seg(gx, gy, Math.min(w, gx + p), gy, gridMask(gx + p / 2, gy, w, h));
        const sp = toPaint(colour, { kind: 'stroke' });
        if (sp) {
          for (const [lv, ops] of levels) {
            const gs = pc.extGState(1, base * lv * opacity);
            pc.ops.push(pushGraphicsState());
            if (gs) pc.ops.push(setGraphicsState(gs));
            pc.ops.push(setStrokingColor(sp.color), setLineWidth(r3(Math.max(0.35, p / 120))), ...ops, stroke(), popGraphicsState());
          }
        }
      }
      pc.ops.push(popGraphicsState());
    };

    const renderObj = async (o: any, inherited: number): Promise<void> => {
      if (!o || o.visible === false) return;
      const opacity = inherited * (o.opacity ?? 1);
      if (opacity <= 0.001) return;
      const t = o.type;
      if (o.getObjects && t !== 'textbox' && t !== 'i-text' && t !== 'text') {
        if (o.clipPath) return rasterise(o, 'it uses a clipping mask');
        for (const c of o.getObjects()) await renderObj(c, opacity);
        return;
      }
      if (o.clipPath) return rasterise(o, 'it uses a clipping mask');
      if (o.shadow) warnings.add('Drop shadows aren’t printed (and aren’t on-brand).');
      const isGradient = (v: unknown) => !!v && typeof v === 'object';
      const m: number[] = o.calcTransformMatrix();
      if (t === 'brandbg') return renderBrandBg(o, m, opacity);
      if (t === 'brandbutton') {
        pc.ops.push(pushGraphicsState(), concatTransformationMatrix(...(m.map(r3) as M6)));
        pc.ops.push(pushGraphicsState());
        paintPath(
          rectOps(-o.width / 2, -o.height / 2, o.width, o.height, o.rx || 0, o.ry || 0),
          toPaint(o.fill, { kind: 'fill', areaMm2: areaMm2(o) }),
          o.strokeWidth > 0 ? toPaint(o.stroke, { kind: 'stroke' }) : null,
          o, m, opacity,
        );
        pc.ops.push(popGraphicsState());
        const run = await shapeRun(String(o.label || ''), o.labelFont, o.labelWeight, o.labelSize || 11, o.labelSpacing || 0);
        const p = toPaint(o.labelFill, { kind: 'text', sizePt: (o.labelSize || 11) * det(m) });
        if (run && p) {
          const gs = pc.extGState(p.alpha * opacity, 1, p.overprint);
          if (gs) pc.ops.push(setGraphicsState(gs));
          pc.ops.push(setFillingColor(p.color), ...run.ops(-run.width / 2, (o.labelSize || 11) * LABEL_BASELINE), fill());
        }
        pc.ops.push(popGraphicsState());
        if (!run) warnings.add(`${o.name || 'A button'}: its font isn’t a brand font, so the label was left out.`);
        return;
      }
      if ((t === 'rect' || t === 'ellipse' || t === 'circle' || t === 'path' || t === 'polygon' || t === 'polyline') && (isGradient(o.fill) || isGradient(o.stroke))) {
        return rasterise(o, 'gradients are printed as images');
      }
      if (t === 'textbox' || t === 'i-text' || t === 'text') {
        const ok = await renderText(o, m, opacity);
        if (!ok) await rasterise(o, 'its font isn’t a brand font');
        return;
      }
      if (t === 'image') {
        try {
          const img = await embedImage(o);
          const n = pc.xobject(img.ref);
          const elx = o.getElement();
          const NW = elx.naturalWidth || elx.width, NH = elx.naturalHeight || elx.height;
          const w = o.width, h = o.height;
          pc.ops.push(pushGraphicsState(), concatTransformationMatrix(...(m.map(r3) as M6)));
          const gs = pc.extGState(opacity, opacity, false, o.globalCompositeOperation === 'multiply');
          if (gs) pc.ops.push(setGraphicsState(gs));
          pc.ops.push(rectangle(r3(-w / 2), r3(-h / 2), r3(w), r3(h)), clip(), endPath());
          pc.ops.push(concatTransformationMatrix(r3(NW), 0, 0, r3(-NH), r3(-w / 2 - (o.cropX || 0)), r3(-h / 2 - (o.cropY || 0) + NH)), drawObject(n), popGraphicsState());
        } catch {
          await rasterise(o, 'its file couldn’t be embedded directly');
        }
        return;
      }
      const fillKind = { kind: 'fill' as const, areaMm2: areaMm2(o) };
      const fillP = toPaint(o.fill, fillKind);
      const strokeP = o.strokeWidth > 0 ? toPaint(o.stroke, { kind: 'stroke' }) : null;
      let ops: Op[] | null = null;
      if (t === 'rect') ops = rectOps(-o.width / 2, -o.height / 2, o.width, o.height, o.rx || 0, o.ry || 0);
      else if (t === 'ellipse') ops = ellipseOps(0, 0, o.rx, o.ry);
      else if (t === 'circle') ops = ellipseOps(0, 0, o.radius, o.radius);
      else if (t === 'line') {
        const p = o.calcLinePoints();
        ops = [moveTo(r3(p.x1), r3(p.y1)), lineTo(r3(p.x2), r3(p.y2))];
        pc.ops.push(pushGraphicsState(), concatTransformationMatrix(...(m.map(r3) as M6)));
        paintPath(ops, null, toPaint(o.stroke, { kind: 'stroke' }), o, m, opacity);
        pc.ops.push(popGraphicsState());
        return;
      } else if (t === 'path') ops = fabricPathOps(o.path, o.pathOffset?.x ?? 0, o.pathOffset?.y ?? 0);
      else if (t === 'polygon' || t === 'polyline') {
        const pts = o.points || [];
        const ox = o.pathOffset?.x ?? 0, oy = o.pathOffset?.y ?? 0;
        const polyOps: Op[] = pts.map((p: any, i: number) => (i === 0 ? moveTo(r3(p.x - ox), r3(p.y - oy)) : lineTo(r3(p.x - ox), r3(p.y - oy))));
        if (t === 'polygon') polyOps.push(closePath());
        ops = polyOps;
      }
      if (!ops) return rasterise(o, `${t} isn’t supported as vector`);
      pc.ops.push(pushGraphicsState(), concatTransformationMatrix(...(m.map(r3) as M6)));
      paintPath(ops, fillP, t === 'polyline' && !strokeP ? null : strokeP, o, m, opacity, o.fillRule === 'evenodd');
      pc.ops.push(popGraphicsState());
    };

    for (const o of sc.getObjects()) await renderObj(o, 1);
    pc.ops.push(popGraphicsState());
    pc.flush();
    sc.dispose();

    if (tpl && doc.template?.mode === 'over') page.drawPage(tpl, { x: slug, y: slug, width: W, height: H });

    if (opts.cropMarks) {
      const reg = opts.cmyk ? cmyk(1, 1, 1, 1) : rgb(0, 0, 0);
      const L = slug + g.trim.x * PT, R = L + g.trim.w * PT, B = trimPdfY, T = B + g.trim.h * PT;
      const seg = (x1: number, y1: number, x2: number, y2: number) =>
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.25, color: reg });
      for (const y of [B, T]) { seg(L - markOff - markLen, y, L - markOff, y); seg(R + markOff, y, R + markOff + markLen, y); }
      for (const x of [L, R]) { seg(x, B - markOff - markLen, x, B - markOff); seg(x, T + markOff, x, T + markOff + markLen); }
      // fold marks in the slug
      for (const fo of g.folds ?? []) {
        if (fo.axis === 'x') {
          const x = slug + fo.at * PT;
          page.drawLine({ start: { x, y: B - markOff - markLen }, end: { x, y: B - markOff }, thickness: 0.25, color: reg, dashArray: [2, 2] });
          page.drawLine({ start: { x, y: T + markOff }, end: { x, y: T + markOff + markLen }, thickness: 0.25, color: reg, dashArray: [2, 2] });
        } else {
          const y = slug + H - fo.at * PT;
          page.drawLine({ start: { x: L - markOff - markLen, y }, end: { x: L - markOff, y }, thickness: 0.25, color: reg, dashArray: [2, 2] });
          page.drawLine({ start: { x: R + markOff, y }, end: { x: R + markOff + markLen, y }, thickness: 0.25, color: reg, dashArray: [2, 2] });
        }
      }
      // job slug line, outlined in the mono brand font
      try {
        const mono = await fontFor('HX Mono', 400);
        if (mono) {
          const label = `${opts.title} · page ${pi + 1} of ${pageJsons.length} · ${round(g.trim.w)}×${round(g.trim.h)} mm trim · ${opts.cmyk ? 'CMYK' : 'RGB'} · Heliaxis Design Studio`;
          const size = 6;
          const k = size / mono.unitsPerEm;
          const run = mono.layout(label);
          const ops: Op[] = [];
          let pen = 0;
          const x0 = L, y0 = 6; // pdf coords (y-up) — draw in a flipped local space
          run.glyphs.forEach((gl: any, gi: number) => {
            ops.push(...glyphOps(gl.path, pen * k, 0, k));
            pen += run.positions[gi].xAdvance;
          });
          page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, r3(x0), r3(y0)), setFillingColor(reg), ...ops, fill(), popGraphicsState());
        }
      } catch {
        /* the slug label is optional */
      }
    }
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, warnings: [...warnings] };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** PNG/JPG of the trim area — exact pixels for digital formats, else at `dpi`. */
export async function exportRaster(
  f: FabricNS,
  doc: DesignDoc,
  pageJson: Record<string, unknown>,
  opts: { format: 'png' | 'jpeg'; dpi: number; px?: { w: number; h: number } | null },
): Promise<string> {
  const PT = PT_PER_MM;
  const g = doc.geometry;
  const W = g.mediaW * PT, H = g.mediaH * PT;
  const el = document.createElement('canvas');
  const sc = new (f as any).StaticCanvas(el, { width: Math.ceil(W), height: Math.ceil(H), renderOnAddRemove: false, enableRetinaScaling: false, backgroundColor: '#ffffff' });
  await sc.loadFromJSON(pageJson);
  sc.backgroundColor = '#ffffff';
  const t = { x: g.trim.x * PT, y: g.trim.y * PT, w: g.trim.w * PT, h: g.trim.h * PT };
  let mult = opts.px ? opts.px.w / t.w : opts.dpi / 72;
  const max = 12000;
  if (Math.max(t.w, t.h) * mult > max) mult = max / Math.max(t.w, t.h);
  const url = sc.toDataURL({ format: opts.format, quality: 0.92, multiplier: mult, left: t.x, top: t.y, width: t.w, height: t.h, enableRetinaScaling: false });
  sc.dispose();
  return url;
}
