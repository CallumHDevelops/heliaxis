import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { degrees, LineCapStyle, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { HELIAXIS_COMPANY, HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';

/**
 * Heliaxis's generated PDFs (pdf-lib). First what every one shares: the page size, the colours, text
 * Helvetica can draw, wrapping, UK dates and the logo (purchase orders use these). Then the document
 * kit for site paperwork, certificates and reports (newDocument): SimpliHeat's certificate look in
 * Heliaxis colours, Noto Sans so Ω, ², ≥ and ° print as themselves, ticks drawn as lines, and the
 * legal line and "F43 · Rev 2 · Page x of y" on every page.
 */

export const A4: [number, number] = [595.28, 841.89];

export const INK = rgb(33 / 255, 31 / 255, 24 / 255);
export const MUTED = rgb(110 / 255, 106 / 255, 94 / 255);
export const AMBER = rgb(199 / 255, 127 / 255, 4 / 255);
export const SOLAR = rgb(248 / 255, 188 / 255, 30 / 255);
export const PAPER = rgb(247 / 255, 242 / 255, 231 / 255);
export const LINE = rgb(0.86, 0.85, 0.82);
export const RED = rgb(179 / 255, 38 / 255, 30 / 255);

/* ── Text ────────────────────────────────────────────────────────────────────── */

// What Helvetica can show (WinAnsi): printable ASCII, Latin-1 and the extra punctuation in 0x80–0x9F.
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const showable = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.has(ch);
};
/** Text Helvetica can draw: tabs to spaces, anything it hasn't got to "?". */
export function pdfText(s: string | null | undefined): string {
  return [...String(s ?? '').replace(/\t/g, ' ').replace(/ /g, ' ')].map((ch) => (ch === '\n' || showable(ch) ? ch : '?')).join('');
}

/**
 * Lines no wider than `max`, breaking at spaces (and inside a word too long for a line). Keeps the
 * text's own line breaks. `clean` turns the text into what the font can draw (pdfText for Helvetica).
 */
export function wrap(text: string, font: PDFFont, size: number, max: number, clean: (s: string) => string = pdfText): string[] {
  const out: string[] = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= max) {
        line = tryLine;
        continue;
      }
      if (line) out.push(line);
      // A word wider than the line on its own (a long part number): split it, after a "-" or "/" where one fits.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > max) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > max) n--;
        const soft = Math.max(rest.lastIndexOf('-', n - 1), rest.lastIndexOf('/', n - 1));
        if (soft >= Math.floor(n / 2)) n = soft + 1;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/* ── Dates ───────────────────────────────────────────────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const noon = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
/** "20 October 2026". */
export const longDate = (ymd: string) => {
  const d = noon(ymd);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** "Tuesday 3 November 2026". */
export const dayDate = (ymd: string) => `${DAYS[noon(ymd).getUTCDay()]} ${longDate(ymd)}`;

/* ── The logo ────────────────────────────────────────────────────────────────── */

let logoBytes: Uint8Array | null = null;
let logoMissedAt = 0;
/**
 * public/assets/heliaxis-logo.png (bundled with the routes: next.config.ts), else the live site's
 * copy, else none (the name in type instead). A miss is tried again after 10 minutes.
 */
export async function logo(): Promise<Uint8Array | null> {
  if (logoBytes) return logoBytes;
  if (Date.now() - logoMissedAt < 10 * 60_000) return null;
  try {
    logoBytes = new Uint8Array(await readFile(path.join(process.cwd(), 'public', 'assets', 'heliaxis-logo.png')));
  } catch {
    try {
      const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
      const r = await fetch(`${site}/assets/heliaxis-logo.png`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) logoBytes = new Uint8Array(await r.arrayBuffer());
    } catch {
      // No logo this time.
    }
  }
  if (!logoBytes) logoMissedAt = Date.now();
  return logoBytes;
}

/* ── The document kit ────────────────────────────────────────────────────────── */

type FontFiles = { regular: Uint8Array; bold: Uint8Array; math: Uint8Array | null };
let fontFiles: Promise<FontFiles | null> | null = null;
/**
 * Noto Sans, and Noto Sans Math for ≥, ≤ and ✓ (public/assets/fonts, bundled with the routes:
 * next.config.ts), already cut down to the characters documents use (Latin, Welsh, Greek, punctuation,
 * super- and subscripts; about 46 kB each), so they're embedded whole: pdf-lib's own subsetting
 * drops glyphs from these fonts. Null when they can't be read.
 */
function loadFonts(): Promise<FontFiles | null> {
  fontFiles ??= (async () => {
    const dir = path.join(process.cwd(), 'public', 'assets', 'fonts');
    try {
      const [regular, bold, math] = await Promise.all([
        readFile(path.join(dir, 'NotoSans-Regular.ttf')),
        readFile(path.join(dir, 'NotoSans-Bold.ttf')),
        readFile(path.join(dir, 'NotoSansMath-Regular.ttf')).catch(() => null),
      ]);
      return { regular: new Uint8Array(regular), bold: new Uint8Array(bold), math: math ? new Uint8Array(math) : null };
    } catch {
      fontFiles = null;
      return null;
    }
  })();
  return fontFiles;
}

type Face = { font: PDFFont; has: (cp: number) => boolean };
/** The faces a document draws with: Noto Sans regular and bold, the symbol face, or Helvetica when the fonts are missing. */
type Faces = { regular: Face; bold: Face; math: Face | null; unicode: boolean };

/** Symbols spelt out when only Helvetica is there. */
const SPELL: Record<string, string> = { '\u2126': 'Ohm', '\u03a9': 'Ohm', '\u2265': '>=', '\u2264': '<=', '\u2713': 'Yes', '\u2717': 'No', '\u2192': '->', '\u2260': '!=' };
const helveticaText = (s: string) => pdfText([...s].map((ch) => SPELL[ch] ?? ch).join(''));

async function facesFor(doc: PDFDocument): Promise<Faces> {
  const files = await loadFonts();
  if (files) {
    try {
      doc.registerFontkit(fontkit);
      const reg = fontkit.create(files.regular);
      const bold = fontkit.create(files.bold);
      const math = files.math ? fontkit.create(files.math) : null;
      return {
        regular: { font: await doc.embedFont(files.regular), has: (cp) => reg.hasGlyphForCodePoint(cp) },
        bold: { font: await doc.embedFont(files.bold), has: (cp) => bold.hasGlyphForCodePoint(cp) },
        math: math && files.math ? { font: await doc.embedFont(files.math), has: (cp) => math.hasGlyphForCodePoint(cp) } : null,
        unicode: true,
      };
    } catch {
      // Fall through to Helvetica.
    }
  }
  const has = (cp: number) => (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || [0x2019, 0x2018, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x20ac].includes(cp);
  return {
    regular: { font: await doc.embedFont(StandardFonts.Helvetica), has },
    bold: { font: await doc.embedFont(StandardFonts.HelveticaBold), has },
    math: null,
    unicode: false,
  };
}

/** Text in runs, each in a face that has its characters (the symbol face for ≥ and ✓); "?" for anything none has. */
function runs(f: Faces, text: string, bold: boolean): { face: Face; s: string }[] {
  const main = bold ? f.bold : f.regular;
  const clean = f.unicode ? text.replace(/\t/g, ' ').replace(/ /g, ' ') : helveticaText(text);
  const out: { face: Face; s: string }[] = [];
  for (const ch of clean) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    const face = main.has(cp) ? main : f.math?.has(cp) ? f.math : main;
    const c = face === main && !main.has(cp) ? '?' : ch;
    const last = out.at(-1);
    if (last && last.face === face) last.s += c;
    else out.push({ face, s: c });
  }
  return out;
}

const MM = 72 / 25.4;
/** FORMS 0.6: A4, margins left 20 mm, right 15 mm, top 20 mm, bottom 20 mm. */
const MARGIN = { l: 20 * MM, r: 15 * MM, t: 20 * MM, b: 20 * MM };
export type Margins = typeof MARGIN;

export type DocOptions = {
  /** F43, F44… or RF_REPORT; with the title it makes the eyebrow, the footer and the metadata. */
  code: string;
  title: string;
  /** "Rev 2", one constant per form. */
  revision?: string | null;
  jobRef: string | null;
  /** YYYY-MM-DD (UK). */
  issued: string;
  /** "Not answered" in red where an answer is missing, and the "Draft: not signed yet" banner. Never shown to a customer. */
  draft?: boolean;
  landscape?: boolean;
  /** Shown instead of the code in the eyebrow and footer ("Roofer report"). */
  label?: string;
  /** Narrower margins than FORMS 0.6's, in points (the EIC's ruled frame runs closer to the edge, as the model form's does). */
  margins?: Partial<Margins>;
  /**
   * Drawn at the top of every page instead of the "(continued)" line (the EIC's "Certificate No.:"):
   * given what a block draws with and the page's number (from 1), it returns the points it took.
   */
  pageHead?: (d: Drawing, page: { n: number; landscape: boolean }) => number;
  /**
   * The footer's own words: `lines` in place of the legal line, `ref` in place of the code and
   * revision before "Page x of y" ("Certificate No. HX-0042-EIC · Page 2 of 7"), and `sub` a small
   * line under it.
   */
  footer?: { lines?: string[]; ref?: string; sub?: string };
};

/** What a page head or a block() draws with. */
export type Drawing = {
  page: PDFPage;
  x: number;
  top: number;
  width: number;
  text: (s: string, x: number, y: number, sz: number, opt?: TextOpt) => void;
  right: (s: string, xr: number, y: number, sz: number, opt?: TextOpt) => void;
  lines: (s: string, sz: number, max: number, bold?: boolean) => string[];
  widthOf: (s: string, sz: number, bold?: boolean) => number;
  mark: (bx: number, by: number, m: Mark, s?: number) => void;
  rect: (rx: number, ry: number, rw: number, rh: number, opt?: { fill?: RGB; border?: RGB; line?: number }) => void;
  line: (x1: number, y1: number, x2: number, y2: number, opt?: { color?: RGB; t?: number; dash?: number[]; round?: boolean }) => void;
  image: (img: PDFImage, ix: number, iy: number, maxW: number, maxH: number) => void;
};
/** Text options: `rotate` 90 runs the text up the page (a schedule's column headings), from (x, y). */
export type TextOpt = { bold?: boolean; color?: RGB; italic?: boolean; rotate?: 90 };

/** `strong`: the figure the document is for ("What you'll be paid"), on a paper band and larger. */
export type Row = { label: string; value: string | null | undefined; must?: boolean; note?: string | null; strong?: boolean };
export type Mark = 'tick' | 'cross' | 'na' | null;
export type CheckItem = { label: string; mark: Mark; note?: string | null; must?: boolean };
export type PhotoItem = { bytes: Uint8Array; mime: string; caption: string; sub?: string | null };
export type SignatureItem = { title: string; png: Uint8Array | string | null; name: string; at: string | null; line?: string | null };

/** "3 Nov 2026 17:41", UK time. */
export function stampWords(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('day')} ${g('month')} ${g('year')} ${g('hour')}:${g('minute')}`;
}

/** A finished document can't go out with a must unanswered: the generator stops with this. */
export class MissingAnswer extends Error {
  label: string;
  constructor(label: string) {
    super(`Not answered: ${label}`);
    this.label = label;
  }
}

const pngFrom = (x: Uint8Array | string): Uint8Array => (typeof x === 'string' ? new Uint8Array(Buffer.from(x.replace(/^data:image\/png;base64,/, ''), 'base64')) : x);

export type Kit = Awaited<ReturnType<typeof newDocument>>;

/**
 * Start a document, then write it top to bottom: header, idGrid, section, rows, checklist, grid,
 * note, paragraph, photos, signatures. Content runs onto new pages by itself (a section heading kept
 * with its first rows, table headings repeated). save() draws the footer on every page.
 */
export async function newDocument(o: DocOptions) {
  const doc = await PDFDocument.create();
  const f = await facesFor(doc);
  const M: Margins = { ...MARGIN, ...o.margins };
  const FOOT_TOP = M.b + 6;
  // A document can turn between portrait and landscape page by page (the EIC's schedules): newPage().
  let size: [number, number] = o.landscape ? [A4[1], A4[0]] : A4;
  let W = size[0] - M.l - M.r;
  const X = M.l;
  const label = o.label ?? o.code;
  doc.setTitle(`${label} ${o.title}${o.jobRef ? ` – ${o.jobRef}` : ''}`);
  doc.setAuthor(HELIAXIS_PARTY.name);
  doc.setCreator('Heliaxis');
  doc.setProducer('Heliaxis');
  const logoPng = await logo();
  const image: PDFImage | null = logoPng ? await doc.embedPng(logoPng).catch(() => null) : null;

  let page: PDFPage = doc.addPage(size);
  let y = size[1] - M.t;

  const width = (s: string, sz: number, bold = false) => runs(f, s, bold).reduce((w, r) => w + r.face.font.widthOfTextAtSize(r.s, sz), 0);
  const text = (s: string, x: number, yy: number, sz: number, opt: TextOpt = {}) => {
    let cx = x;
    let cy = yy;
    for (const r of runs(f, s, !!opt.bold)) {
      page.drawText(r.s, { x: cx, y: cy, size: sz, font: r.face.font, color: opt.color ?? INK, ...(opt.italic ? { ySkew: degrees(12) } : {}), ...(opt.rotate ? { rotate: degrees(opt.rotate) } : {}) });
      if (opt.rotate) cy += r.face.font.widthOfTextAtSize(r.s, sz);
      else cx += r.face.font.widthOfTextAtSize(r.s, sz);
    }
  };
  const right = (s: string, xr: number, yy: number, sz: number, opt: TextOpt = {}) => text(s, xr - width(s, sz, opt.bold), yy, sz, opt);
  /** Lines no wider than max, measured in the document's own fonts. */
  const lines = (s: string, sz: number, max: number, bold = false): string[] => {
    const out: string[] = [];
    for (const para of String(s ?? '').split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const t = line ? `${line} ${word}` : word;
        if (width(t, sz, bold) <= max) {
          line = t;
          continue;
        }
        if (line) out.push(line);
        let rest = word;
        while (rest && width(rest, sz, bold) > max) {
          let n = rest.length - 1;
          while (n > 1 && width(rest.slice(0, n), sz, bold) > max) n--;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  };
  const hairline = (yy: number, color: RGB = LINE, t = 0.6) => page.drawLine({ start: { x: X, y: yy }, end: { x: X + W, y: yy }, thickness: t, color });

  /** The page head (pageHead), on a page just begun. */
  const head = () => {
    if (o.pageHead) y -= o.pageHead(drawing(), { n: doc.getPageCount(), landscape: size[0] > size[1] });
  };
  const continued = () => {
    page = doc.addPage(size);
    y = size[1] - M.t;
    if (o.pageHead) return head();
    text(`${label === o.title ? label : `${label} · ${o.title}`}${o.jobRef ? ` · ${o.jobRef}` : ''} (continued)`, X, y - 9, 8.5, { bold: true, color: MUTED });
    y -= 24;
  };
  /** Room for h more on this page, else a new page (then `again`: a table's headings). */
  const need = (h: number, again?: () => void) => {
    if (y - h >= FOOT_TOP + 10) return;
    continued();
    again?.();
  };

  /** What a block() draws with: the page, where it starts, and the kit's own text in its fonts. */
  const drawing = (): Drawing => ({
    page,
    x: X,
    top: y,
    width: W,
    text,
    right,
    lines,
    widthOf: width,
    /** A tick, a cross or N/A in a box at (bx, by) (bottom left), drawn as strokes. */
    mark(bx: number, by: number, m: Mark, s = 10) {
      page.drawRectangle({ x: bx, y: by, width: s, height: s, borderColor: INK, borderWidth: 0.7 });
      if (m === 'tick') {
        page.drawLine({ start: { x: bx + s * 0.2, y: by + s * 0.5 }, end: { x: bx + s * 0.42, y: by + s * 0.25 }, thickness: 1.3, color: INK });
        page.drawLine({ start: { x: bx + s * 0.42, y: by + s * 0.25 }, end: { x: bx + s * 0.82, y: by + s * 0.8 }, thickness: 1.3, color: INK });
      } else if (m === 'cross') {
        page.drawLine({ start: { x: bx + s * 0.25, y: by + s * 0.25 }, end: { x: bx + s * 0.75, y: by + s * 0.75 }, thickness: 1.3, color: RED });
        page.drawLine({ start: { x: bx + s * 0.25, y: by + s * 0.75 }, end: { x: bx + s * 0.75, y: by + s * 0.25 }, thickness: 1.3, color: RED });
      } else if (m === 'na') text('N/A', bx + s + 3, by + s * 0.2, Math.max(6, s * 0.7), { bold: true, color: MUTED });
    },
    rect(rx: number, ry: number, rw: number, rh: number, opt: { fill?: RGB; border?: RGB; line?: number } = {}) {
      page.drawRectangle({ x: rx, y: ry, width: rw, height: rh, ...(opt.fill ? { color: opt.fill } : {}), ...(opt.border ? { borderColor: opt.border, borderWidth: opt.line ?? 0.5 } : {}) });
    },
    /** A rule; `dash` [on, off] and `round` caps make a dotted leader ([0, 2] with round caps: dots). */
    line(x1: number, y1: number, x2: number, y2: number, opt: { color?: RGB; t?: number; dash?: number[]; round?: boolean } = {}) {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: opt.t ?? 0.5,
        color: opt.color ?? LINE,
        ...(opt.dash ? { dashArray: opt.dash } : {}),
        ...(opt.round ? { lineCap: LineCapStyle.Round } : {}),
      });
    },
    /** An image embedded first (kit.embed), fitted whole into maxW × maxH with its bottom left at (ix, iy). */
    image(img: PDFImage, ix: number, iy: number, maxW: number, maxH: number) {
      const sc = Math.min(maxW / img.width, maxH / img.height);
      page.drawImage(img, { x: ix, y: iy, width: img.width * sc, height: img.height * sc });
    },
  });

  head();

  return {
    doc,
    /** The width content has (on the page in hand: landscape pages are wider). */
    get width() {
      return W;
    },
    /** The page in hand, numbered from 1. */
    get pageNumber() {
      return doc.getPageCount();
    },
    /** Points left on this page above the footer. */
    room: () => y - FOOT_TOP - 10,
    /** Text measured in the document's own fonts (for laying out a block before drawing it). */
    lines,
    widthOf: width,
    /**
     * A new page, portrait or landscape (the EIC's schedules are landscape, as the model forms are).
     * `continued`: the "(continued)" line at the top, as content running over does.
     */
    newPage(opt: { landscape?: boolean; continued?: boolean } = {}) {
      size = opt.landscape ? [A4[1], A4[0]] : A4;
      W = size[0] - M.l - M.r;
      if (opt.continued) continued();
      else {
        page = doc.addPage(size);
        y = size[1] - M.t;
        head();
      }
    },
    /**
     * A layout the other parts don't cover (boxes of tick boxes, a schedule's columns): room for h
     * points (a new page if not, then `again` for its headings), drawn by `draw`, then below it.
     * Synchronous, so a table's headings can be drawn again from `again`; embed images first.
     */
    block(h: number, draw: (d: Drawing) => void, again?: () => void) {
      need(h, again);
      draw(drawing());
      y -= h;
    },
    /** A PNG or JPEG ready for block()'s image(); null when it can't be read. */
    async embed(bytes: Uint8Array | string | null | undefined): Promise<PDFImage | null> {
      if (!bytes) return null;
      const b = pngFrom(bytes);
      return (b[0] === 0xff && b[1] === 0xd8 ? doc.embedJpg(b) : doc.embedPng(b)).catch(() => null);
    },
    /** Logo and meta pairs, the eyebrow ("F43 · PROJECT HX-0042") in amber, the title, then the gold bar (and the draft banner). */
    header(h: { meta?: [string, string][] } = {}) {
      const logoW = 118;
      const logoH = image ? (image.height / image.width) * logoW : 0;
      if (image) page.drawImage(image, { x: X, y: y - logoH, width: logoW, height: logoH });
      else text('HELIAXIS', X, y - 18, 20, { bold: true });
      let my = y - 8;
      for (const [k, v] of h.meta ?? []) {
        right(v, X + W, my, 8.5, { bold: true });
        right(k.toUpperCase(), X + W - width(v, 8.5, true) - 8, my, 6.8, { color: MUTED });
        my -= 11.5;
      }
      y = Math.min(y - (image ? logoH : 22) - 16, my - 6);
      text(`${label} · ${o.jobRef ? `Project ${o.jobRef}` : 'Heliaxis'}`.toUpperCase(), X, y, 7.5, { bold: true, color: AMBER });
      y -= 21;
      for (const l of lines(o.title, 16.5, W, true)) {
        text(l, X, y, 16.5, { bold: true });
        y -= 20;
      }
      y += 7;
      page.drawRectangle({ x: X, y: y - 2.5, width: W, height: 2.5, color: SOLAR });
      y -= 16;
      if (o.draft) {
        page.drawRectangle({ x: X, y: y - 22, width: W, height: 22, color: rgb(1, 0.98, 0.9), borderColor: SOLAR, borderWidth: 1.4 });
        text('Draft: not signed yet', X + 10, y - 15, 9.5, { bold: true, color: AMBER });
        y -= 32;
      }
    },
    /** The site box: label and value pairs, two to a row. */
    idGrid(pairs: [string, string | null | undefined][]) {
      const colW = (W - 24) / 2;
      const cells = pairs.map(([k, v]) => ({ k, v: lines(v || '–', 9, colW - 6, true) }));
      const heights: number[] = [];
      for (let i = 0; i < cells.length; i += 2) heights.push(Math.max(...cells.slice(i, i + 2).map((c) => 14 + c.v.length * 11.5)) + 6);
      const total = heights.reduce((a, b) => a + b, 0) + 10;
      need(total);
      page.drawRectangle({ x: X, y: y - total, width: W, height: total, color: PAPER });
      let cy = y - 8;
      for (let i = 0; i < cells.length; i += 2) {
        cells.slice(i, i + 2).forEach((c, j) => {
          const cx = X + 10 + j * (colW + 4);
          text(c.k.toUpperCase(), cx, cy - 7, 6.8, { color: MUTED });
          c.v.forEach((l, n) => text(l, cx, cy - 19 - n * 11.5, 9, { bold: true }));
        });
        cy -= heights[i / 2];
      }
      y -= total + 14;
    },
    /** A section heading over a rule, kept with its first rows; an optional line under it. */
    section(title: string, opt: { intro?: string | null } = {}) {
      const intro = opt.intro ? lines(opt.intro, 8.5, W) : [];
      need(30 + intro.length * 11 + 44);
      y -= 4;
      text(title, X, y - 10, 10.5, { bold: true });
      y -= 15;
      hairline(y, INK, 0.8);
      y -= 2;
      for (const l of intro) {
        y -= 11;
        text(l, X, y, 8.5, { color: MUTED });
      }
      if (intro.length) y -= 4;
    },
    /** Question and answer rows (62/38), answers bold. A must left empty stops a finished document (MissingAnswer). */
    rows(items: Row[]) {
      const lw = W * 0.62 - 10;
      const vw = W * 0.38;
      for (const r of items) {
        const empty = r.value === null || r.value === undefined || String(r.value).trim() === '';
        if (empty && r.must && !o.draft) throw new MissingAnswer(r.label);
        if (r.strong && !empty) {
          need(26);
          page.drawRectangle({ x: X, y: y - 24, width: W, height: 24, color: PAPER });
          text(r.label, X + 8, y - 16, 10.5, { bold: true });
          text(String(r.value), X + W * 0.62, y - 16, 10.5, { bold: true });
          y -= 28;
          continue;
        }
        const ll = lines(r.label, 9, lw);
        const vl = empty ? ['Not answered'] : lines(String(r.value), 9, vw, true);
        const nl = r.note ? lines(r.note, 7.5, lw) : [];
        const h = Math.max(ll.length * 11.5 + nl.length * 9.5, vl.length * 11.5) + 8;
        need(h);
        ll.forEach((l, i) => text(l, X, y - 11 - i * 11.5, 9));
        nl.forEach((l, i) => text(l, X, y - 11 - ll.length * 11.5 - i * 9.5, 7.5, { color: MUTED }));
        vl.forEach((l, i) => text(l, X + W * 0.62, y - 11 - i * 11.5, 9, empty ? { italic: true, color: o.draft ? RED : MUTED } : { bold: true }));
        y -= h;
        hairline(y + 2, LINE, 0.4);
      }
      y -= 4;
    },
    /** Checklist rows with a drawn tick, a cross or N/A on the right (never a font glyph). */
    checklist(items: CheckItem[]) {
      const lw = W - 74;
      for (const it of items) {
        if (!it.mark && it.must && !o.draft) throw new MissingAnswer(it.label);
        const ll = lines(it.label, 9, lw);
        const nl = it.note ? lines(it.note, 7.5, lw) : [];
        const h = Math.max(ll.length * 11.5 + nl.length * 9.5, 16) + 8;
        need(h);
        ll.forEach((l, i) => text(l, X, y - 11 - i * 11.5, 9));
        nl.forEach((l, i) => text(l, X, y - 11 - ll.length * 11.5 - i * 9.5, 7.5, { color: MUTED }));
        const bx = X + W - 44;
        const by = y - 16;
        page.drawRectangle({ x: bx, y: by, width: 14, height: 14, borderColor: INK, borderWidth: 0.8 });
        if (it.mark === 'tick') {
          page.drawLine({ start: { x: bx + 3, y: by + 7 }, end: { x: bx + 6, y: by + 3.5 }, thickness: 1.6, color: INK });
          page.drawLine({ start: { x: bx + 6, y: by + 3.5 }, end: { x: bx + 11.5, y: by + 11 }, thickness: 1.6, color: INK });
        } else if (it.mark === 'cross') {
          page.drawLine({ start: { x: bx + 3.5, y: by + 3.5 }, end: { x: bx + 10.5, y: by + 10.5 }, thickness: 1.6, color: RED });
          page.drawLine({ start: { x: bx + 3.5, y: by + 10.5 }, end: { x: bx + 10.5, y: by + 3.5 }, thickness: 1.6, color: RED });
        } else if (it.mark === 'na') text('N/A', bx + 19, by + 4, 7.5, { bold: true, color: MUTED });
        else text('Not answered', bx - 60, by + 4, 7.5, { italic: true, color: o.draft ? RED : MUTED });
        y -= h;
        hairline(y + 2, LINE, 0.4);
      }
      y -= 4;
    },
    /** A table; its headings repeat on each new page. Widths are shares of the page (even by default). */
    grid(t: { columns: string[]; rows: (string | null)[][]; widths?: number[] }) {
      const shares = t.widths ?? t.columns.map(() => 1);
      const sum = shares.reduce((a, b) => a + b, 0);
      const ws = shares.map((s) => (s / sum) * W);
      const xs = ws.map((_, i) => X + ws.slice(0, i).reduce((a, b) => a + b, 0));
      const head = () => {
        const hl = t.columns.map((c, i) => lines(c.toUpperCase(), 6.8, ws[i] - 8, true));
        const h = Math.max(...hl.map((l) => l.length)) * 9 + 8;
        page.drawRectangle({ x: X, y: y - h, width: W, height: h, color: PAPER });
        hl.forEach((l, i) => l.forEach((s, n) => text(s, xs[i] + 4, y - 10 - n * 9, 6.8, { bold: true, color: MUTED })));
        y -= h;
      };
      need(44);
      head();
      for (const row of t.rows) {
        const cl = row.map((c, i) => lines(c ?? '–', 8.5, ws[i] - 8));
        const h = Math.max(...cl.map((l) => l.length)) * 10.5 + 7;
        need(h, head);
        cl.forEach((l, i) => l.forEach((s, n) => text(s, xs[i] + 4, y - 10 - n * 10.5, 8.5)));
        y -= h;
        hairline(y, LINE, 0.4);
      }
      y -= 8;
    },
    /** A note in small type ("NOTE 1: …"). */
    note(s: string) {
      for (const l of lines(s, 8, W)) {
        need(11);
        text(l, X, y - 9, 8, { color: MUTED });
        y -= 10.5;
      }
      y -= 6;
    },
    /** A paragraph in body type. */
    paragraph(s: string, opt: { bold?: boolean; color?: RGB } = {}) {
      for (const l of lines(s, 9.5, W, opt.bold)) {
        need(13);
        text(l, X, y - 10, 9.5, opt);
        y -= 12.5;
      }
      y -= 6;
    },
    /** Photos in rows (3 by default) of 3:2 frames, each fitted whole, with a caption and a small line under it. */
    async photos(items: PhotoItem[], opt: { perRow?: number } = {}) {
      const per = opt.perRow ?? 3;
      const gap = 10;
      const fw = (W - gap * (per - 1)) / per;
      const fh = (fw * 2) / 3;
      for (let i = 0; i < items.length; i += per) {
        const row = items.slice(i, i + per);
        const caps = row.map((p) => ({ c: lines(p.caption, 7.8, fw, true), s: p.sub ? lines(p.sub, 7, fw) : [] }));
        const capH = Math.max(...caps.map((c) => c.c.length * 9.5 + c.s.length * 8.5));
        need(fh + capH + 16);
        for (const [j, p] of row.entries()) {
          const fx = X + j * (fw + gap);
          page.drawRectangle({ x: fx, y: y - fh, width: fw, height: fh, color: PAPER });
          const img = await (p.mime === 'image/png' ? doc.embedPng(p.bytes) : p.mime === 'image/jpeg' || p.mime === 'image/jpg' ? doc.embedJpg(p.bytes) : Promise.reject(new Error('type'))).catch(() => null);
          if (img) {
            const s = Math.min(fw / img.width, fh / img.height);
            page.drawImage(img, { x: fx + (fw - img.width * s) / 2, y: y - fh + (fh - img.height * s) / 2, width: img.width * s, height: img.height * s });
          } else text('This photo can’t be shown here', fx + 8, y - fh / 2, 7.5, { color: MUTED });
          caps[j].c.forEach((l, n) => text(l, fx, y - fh - 10 - n * 9.5, 7.8, { bold: true }));
          caps[j].s.forEach((l, n) => text(l, fx, y - fh - 10 - caps[j].c.length * 9.5 - n * 8.5, 7, { color: MUTED }));
        }
        y -= fh + capH + 18;
      }
    },
    /** Signatures on a baseline, two to a row, with the name and "Signed on the Heliaxis app, 3 Nov 2026 17:41". */
    async signatures(items: SignatureItem[]) {
      const colW = (W - 30) / 2;
      for (let i = 0; i < items.length; i += 2) {
        need(110);
        for (const [j, s] of items.slice(i, i + 2).entries()) {
          const sx = X + j * (colW + 30);
          text(s.title.toUpperCase(), sx, y - 8, 6.8, { bold: true, color: MUTED });
          const base = y - 62;
          if (s.png) {
            const img = await doc.embedPng(pngFrom(s.png)).catch(() => null);
            if (img) {
              const sc = Math.min((colW - 10) / img.width, 40 / img.height);
              page.drawImage(img, { x: sx, y: base + 2, width: img.width * sc, height: img.height * sc });
            }
          }
          page.drawLine({ start: { x: sx, y: base }, end: { x: sx + colW, y: base }, thickness: 0.8, color: INK });
          text(s.name || '–', sx, base - 12, 9, { bold: true });
          const line = s.line ?? (s.at ? `Signed on the Heliaxis app, ${stampWords(s.at)}` : null);
          if (line) text(line, sx, base - 23, 7.5, { color: MUTED });
        }
        y -= 104;
      }
    },
    /** Space, in points. */
    gap(h: number) {
      y -= h;
    },
    /** The footer on every page (the legal line, then "F43 · Rev 2 · Page x of y"), then the bytes. */
    async save(): Promise<Uint8Array> {
      const pages = doc.getPages();
      const legal = `${HELIAXIS_PARTY.name} · Registered in England and Wales No. ${HELIAXIS_PARTY.companyNumber} · Registered address: ${HELIAXIS_COMPANY.addressLines.join(', ')} · VAT ${HELIAXIS_PARTY.vatNumber} · MCS ${HELIAXIS_COMPANY.mcsNumber}`;
      const ref = o.footer?.ref ?? `${label}${o.revision ? ` · ${o.revision}` : ''}`;
      pages.forEach((p, i) => {
        page = p;
        const fw = p.getWidth() - M.l - M.r;
        p.drawLine({ start: { x: M.l, y: FOOT_TOP }, end: { x: M.l + fw, y: FOOT_TOP }, thickness: 0.5, color: LINE });
        const words = `${ref} · Page ${i + 1} of ${pages.length}`;
        const left = o.footer?.lines ?? [legal];
        const sub = o.footer?.sub;
        const room = o.footer ? fw - Math.max(width(words, 7, true), sub ? width(sub, 6.2) : 0) - 16 : fw - 150;
        left.flatMap((s) => lines(s, 6.6, room)).forEach((l, n) => text(l, M.l, FOOT_TOP - 10 - n * 8.2, 6.6, { color: MUTED }));
        right(words, M.l + fw, FOOT_TOP - 10, 7, { bold: true, color: MUTED });
        if (sub) right(sub, M.l + fw, FOOT_TOP - 18.2, 6.2, { color: MUTED });
      });
      return doc.save();
    },
  };
}

/** A generated document's file name, starting with the job ref: "HX-0042 F43 PV array test report v2.pdf". */
export const docFileName = (jobRef: string | null, label: string, title: string, version = 1) =>
  `${[jobRef, label, title].filter(Boolean).join(' ')}${version > 1 ? ` v${version}` : ''}.pdf`.replace(/[\\/:*?"<>|]+/g, '-');
