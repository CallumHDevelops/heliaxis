/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Printer templates (PDF): read the page geometry, detect trim/bleed/safe, render page images.
 *
 * Geometry comes from, in order of trust:
 *  1. the PDF's own TrimBox / BleedBox (e.g. InDesign die-line templates),
 *  2. the printer's dimension text (e.g. instantprint: "3020mm (W) x 2320mm (H) With Bleed",
 *     "This template is set up at 25% scale"),
 *  3. sensible defaults the user can adjust.
 */
import type { PageGeometry } from '@/lib/design/types';
import { matchFormat, zonesOnTrim } from './formats';

const MM = 25.4 / 72;

export type TemplateInfo = {
  title: string | null;
  pages: number;
  geometry: PageGeometry;
  /** Human-readable notes on what was detected. */
  detected: string[];
  /** 0–1: how sure we are about trim/bleed. */
  confidence: 'high' | 'medium' | 'low';
};

let pdfjsP: Promise<any> | null = null;
export function pdfjs(): Promise<any> {
  pdfjsP ??= import('pdfjs-dist').then((m: any) => {
    m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return m;
  });
  return pdfjsP;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export async function readTemplate(bytes: Uint8Array, pageNo = 1): Promise<TemplateInfo> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(Math.max(0, pageNo - 1));
  const mb = page.getMediaBox();
  const tb = page.getTrimBox();
  const mediaW = mb.width * MM;
  const mediaH = mb.height * MM;
  const detected: string[] = [];
  let confidence: TemplateInfo['confidence'] = 'low';

  // 1) A real TrimBox inside the MediaBox.
  const trimSet = Math.abs(tb.width - mb.width) > 0.5 || Math.abs(tb.height - mb.height) > 0.5;
  let trim = { x: 0, y: 0, w: mediaW, h: mediaH };
  let safe = 3;
  let note: string | null = null;
  if (trimSet) {
    // pdf-lib boxes are y-up from the bottom-left; ours are y-down from the top-left.
    trim = {
      x: round((tb.x - mb.x) * MM),
      y: round((mb.y + mb.height - (tb.y + tb.height)) * MM),
      w: round(tb.width * MM),
      h: round(tb.height * MM),
    };
    detected.push(`Trim box ${round(trim.w, 1)} × ${round(trim.h, 1)} mm with ${round(trim.x, 1)} mm bleed (from the PDF).`);
    confidence = 'high';
  }

  // 2) Printer dimension text.
  try {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const p = await pdf.getPage(Math.max(1, pageNo));
    const tc = await p.getTextContent();
    const text = tc.items.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ');
    const dim = (label: string) => {
      const re = new RegExp(`(\\d{2,5}(?:\\.\\d+)?)\\s*mm\\s*\\(W\\)\\s*x\\s*(\\d{2,5}(?:\\.\\d+)?)\\s*mm\\s*\\(H\\)\\s*${label}`, 'i');
      const m = re.exec(text);
      return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
    };
    const withBleed = dim('With Bleed');
    const finished = dim('Finished Size');
    const safeZone = dim('Safe Zone');
    const pct = /(\d{1,3})\s*%\s*scale/i.exec(text);
    if (!trimSet && withBleed && finished) {
      const scale = mediaW / withBleed.w;
      const bleed = ((withBleed.w - finished.w) / 2) * scale;
      trim = { x: round(bleed), y: round(((withBleed.h - finished.h) / 2) * scale), w: round(finished.w * scale), h: round(finished.h * scale) };
      if (safeZone) safe = round(((finished.w - safeZone.w) / 2) * scale);
      const pctText = pct ? `${pct[1]}%` : `${round(scale * 100, 0)}%`;
      detected.push(`Printer spec found: ${finished.w}×${finished.h} mm finished, ${withBleed.w}×${withBleed.h} mm with bleed.`);
      detected.push(`Template is at ${pctText} scale — design at this size; bleed ${round(bleed, 1)} mm, safe zone ${safe} mm (at scale).`);
      note = `Printer template at ${pctText} scale: ${finished.w}×${finished.h} mm finished.`;
      confidence = 'high';
    } else if (pct) {
      note = `Printer template at ${pct[1]}% scale.`;
      detected.push(note);
    }
    if (!trimSet && !withBleed) {
      const bm = /(\d(?:\.\d)?)\s*mm\s*bleed/i.exec(text);
      if (bm) {
        const b = Number(bm[1]);
        trim = { x: b, y: b, w: round(mediaW - 2 * b), h: round(mediaH - 2 * b) };
        detected.push(`“${bm[0]}” found in the template.`);
        confidence = 'medium';
      }
    }
    const sm = /safe\s*(?:zone|area)[^.]{0,60}?(\d{1,3})\s*mm/i.exec(text);
    if (sm && !safeZone) {
      safe = Number(sm[1]);
      detected.push(`Safe area ${safe} mm (from the template text).`);
    }
    pdf.destroy?.();
  } catch {
    /* text detection is best-effort */
  }

  if (confidence === 'low') {
    detected.push('No trim/bleed found in the PDF — treating the whole page as the finished size. Adjust below if your printer says otherwise.');
  }

  const geometry: PageGeometry = { mediaW: round(mediaW), mediaH: round(mediaH), trim, safe, note };
  const known = matchFormat(geometry);
  if (known?.zones?.length) {
    geometry.zones = zonesOnTrim(known, trim);
    detected.push(`Same size as our ${known.label} — its ${known.zones.some((z) => z.kind === 'wrap') ? 'wrap-round' : 'no-go'} zones are marked for you.`);
  }

  return {
    title: doc.getTitle() ?? null,
    pages: doc.getPageCount(),
    geometry,
    detected,
    confidence,
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
  pdf.destroy?.();
  knockOutWhite(ctx, cv.width, cv.height);
  return cv;
}
