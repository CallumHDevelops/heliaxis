import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import {
  clip,
  degrees,
  endPath,
  LineCapStyle,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setCharacterSpacing,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  StandardFonts,
  TextRenderingMode,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import { HELIAXIS_COMPANY, HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';

/**
 * Heliaxis's generated PDFs (pdf-lib). First what every one shares: the page size, the colours, text
 * Helvetica can draw, wrapping, UK dates, the logos and the spark. Then the page furniture (pageKit:
 * the masthead, the slim strip, the dark banner; drawCard) and the document kit for site paperwork,
 * certificates, reports, purchase orders and the handover pack (newDocument), laid out as the brand's
 * "engineered spec sheet" between two dark bands (the owner's choice, C with B's dark bands): on the
 * first page an ink header band (the reversed wordmark (®), the gold mono eyebrow with the spark over
 * the Ezra title in cream, the document's references on the right) on a gold rule, on later pages a
 * slim ink strip with the wordmark and what the document is; then the cream page with a plain gold
 * rule down the left margin, clear of punched holes, sections on hairline rules with the spark before
 * the Ezra heading, field labels in JetBrains Mono and answers in Hanken Grotesk bold (so Ω, ², ≥ and
 * ° print as themselves), panels and photo cards a shade lighter than the page, ticks drawn as lines,
 * and a dark banner at the foot of every page on a gold rule laid out as a title block: the reversed
 * wordmark, the legal line and "F43 · Rev 2 · Page x of y".
 *
 * A ruled form (the IET's EIC and its schedules: DocOptions.pageHead) keeps its own body, type (Noto
 * Sans, as drawn to the model form) and page head, and takes the brand's chrome round it: the ® logo
 * in its page head, a slimmer banner at the foot, the spark and the gold rules.
 *
 * Every document comes in two variants from the same layout (Variant): 'digital', the one above on a
 * cream page (what's emailed, put in the customer portal and the handover pack), and 'print', the ink
 * saver, made on request: the same text in the same places with nothing filled (lookOf).
 */

export const A4: [number, number] = [595.28, 841.89];

// The brand kit's palette (brand-kit/heliaxis-brand-spec.md). Gold is an accent, never text on light.
export const INK = rgb(33 / 255, 31 / 255, 24 / 255);
export const MUTED = rgb(110 / 255, 106 / 255, 94 / 255);
export const AMBER = rgb(199 / 255, 127 / 255, 4 / 255);
export const SOLAR = rgb(248 / 255, 188 / 255, 30 / 255);
export const PAPER = rgb(247 / 255, 242 / 255, 231 / 255);
/** Tiles and bands on paper (table headings). */
export const PAPER_2 = rgb(239 / 255, 232 / 255, 216 / 255);
/** The card surface: boxes, tables and photos sit on it. */
export const CARD = rgb(1, 253 / 255, 248 / 255);
/** The hairline on paper: ink at 14% over paper. */
export const LINE = rgb(217 / 255, 212 / 255, 202 / 255);
export const RED = rgb(179 / 255, 38 / 255, 30 / 255);
/** Muted text on ink. */
export const MUTED_DARK = rgb(166 / 255, 159 / 255, 142 / 255);
/** Field labels in mono: between ink and muted, 7.4:1 on paper (muted is 4.8:1, too faint at 7 pt in print). */
export const LABEL = rgb(82 / 255, 78 / 255, 68 / 255);
/** Small amber type on paper (the eyebrow): deep amber a step darker, 4:1 on paper. */
export const AMBER_TEXT = rgb(168 / 255, 106 / 255, 2 / 255);
/** The hairline on ink: paper at 16% over ink. */
const LINE_DARK = rgb(67 / 255, 65 / 255, 57 / 255);
/** Small type on the dark bands: paper, a touch down, so it holds up printed in black and white (11:1 on ink). */
const BANNER_TEXT = rgb(214 / 255, 208 / 255, 194 / 255);

/**
 * The two variants of every document, from the same layout, chosen per document (DocOptions.variant,
 * pageKit's `variant`; 'digital' when not said):
 * - 'digital': what's emailed and put in the customer portal and the handover pack. The cream page,
 *   the ink header band, the slim ink strip on later pages, the ink title block at the foot, the
 *   figure the document is for on an ink bar, cards and table rows on the card colour.
 * - 'print': the ink saver, made on request ("Print version" beside each document in the CRM and the
 *   portal; never stored or sent). The same text in the same places (the same page breaks), with
 *   nothing filled: a white page (so it suits cream paper too); the header on the paper in ink on a
 *   1 pt gold rule; on later pages a running head on a hairline; the title block at the foot on a gold
 *   hairline; the figure in a hairline bar with a thick gold edge; cards and tables in hairlines; words
 *   flagged in amber on a digital in ink. The gold rule down the margin, the sparks and the eyebrow
 *   stay gold. Reads in black and white.
 */
export type Variant = 'digital' | 'print';
/** A variant from a request's ?variant= (anything but 'print' is the digital one). */
export const variantOf = (v: string | null | undefined): Variant => (v === 'print' ? 'print' : 'digital');

/** What a variant fills: null leaves it unfilled (the paper shows), the hairlines alone drawing it. */
export type Look = {
  variant: Variant;
  /** The page. */
  page: RGB | null;
  /** Cards and panels: the site box, photo cards, the serial numbers, the supplier and delivery box. */
  panel: RGB | null;
  /** Table heading rows. */
  head: RGB | null;
  /** Table rows, tick boxes, the draft and revised notices. */
  cell: RGB | null;
  /**
   * Words flagged in colour (a price to be confirmed, the draft and revised notices): deep amber on a
   * digital; ink on a print, where amber would come out a mid grey in black and white, weaker than the
   * text round it. (On a print only the eyebrow is set in amber.)
   */
  flag: RGB;
};
export const lookOf = (variant: Variant = 'digital'): Look =>
  variant === 'print'
    ? { variant, page: null, panel: null, head: null, cell: null, flag: INK }
    : { variant: 'digital', page: PAPER, panel: CARD, head: PAPER_2, cell: CARD, flag: AMBER_TEXT };

/** A fill for pdf-lib's options: the colour, or nothing at all when the variant leaves it unfilled. */
export const fillOf = (color: RGB | null | undefined) => (color ? { color } : {});

/* ── The spark and the page ──────────────────────────────────────────────────── */

/**
 * The spark (brand kit 3): four separate tapered rays round an open centre, each with a monopitch
 * tip; one ray ("M11 9.6 L13 9.6 L13 0.8 L11 3 Z") turned 0/90/180/270° about (12, 12) in a 24-unit box.
 */
export const SPARK_PATH = 'M11 9.6 L13 9.6 L13 0.8 L11 3 Z M14.4 11 L14.4 13 L23.2 13 L21 11 Z M13 14.4 L11 14.4 L11 23.2 L13 21 Z M9.6 13 L9.6 11 L0.8 11 L3 13 Z';
/** The spark as vectors, centred on (cx, cy), `size` points across. */
export function drawSpark(page: PDFPage, cx: number, cy: number, size: number, color: RGB = SOLAR, opacity = 1) {
  page.drawSvgPath(SPARK_PATH, { x: cx - size / 2, y: cy + size / 2, scale: size / 24, color, opacity });
}

const MM = 72 / 25.4;
/** The dark banner at the foot of every page: 20 mm of ink, where the footer used to sit. */
export const BANNER_H = 20 * MM;
/** The banner under a ruled form (the EIC): 15 mm, so the form's body keeps its size. */
export const FORM_BANNER_H = 15 * MM;
/**
 * The first page's ink header band: 30.3 mm (a line deeper for a two-line title), so the title's
 * baseline sits as far above the gold rule (14 pt) as the wordmark's top sits below the paper's edge.
 */
const HEAD_H = 86;
/** The slim ink strip at the top of later pages: 12 mm. */
const STRIP_H = 12 * MM;
/** The gold rule between each dark band and the page. */
const GOLD_RULE = 1;
/** The wordmark artwork (995 × 211 px) has a margin round it: 30 px each side, 14 px above, 14 below. */
const ART = { w: 995, h: 211, l: 30, t: 14, b: 14 };
/**
 * The gold rule down the left margin, 17 mm in: clear of the holes a two- or four-hole punch makes
 * (centred 12 mm in, 6 mm across) and 3 mm short of the content.
 */
const SPINE_X = 17 * MM;
/** A4 margins (FORMS 0.6): left 20 mm, right 15 mm, top 20 mm; the bottom is the banner's. */
export const MARGIN = { l: 20 * MM, r: 15 * MM, t: 20 * MM };
export type Margins = typeof MARGIN;

/**
 * The page colour, under everything else on the page (none on a print one). (The bands and the gold
 * rule down the left margin go on with the banner, when the document is finished: pageKit().banner.)
 */
export function paintPage(page: PDFPage, variant: Variant = 'digital') {
  const color = lookOf(variant).page;
  if (color) page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color });
}

/**
 * A card: `fill` (the card colour unless said; null for none, the print variant's) with a hairline
 * round it and 2 px (1.5 pt) corners; (x, top) is its top-left corner.
 */
export function drawCard(page: PDFPage, x: number, top: number, w: number, h: number, o: { fill?: RGB | null; border?: RGB | null; r?: number } = {}) {
  const r = Math.min(o.r ?? 1.5, w / 2, h / 2);
  const c = r * 0.4477; // 1 − 0.5523: a quarter circle's control points as a cubic
  const d = `M ${r} 0 L ${w - r} 0 C ${w - c} 0 ${w} ${c} ${w} ${r} L ${w} ${h - r} C ${w} ${h - c} ${w - c} ${h} ${w - r} ${h} L ${r} ${h} C ${c} ${h} 0 ${h - c} 0 ${h - r} L 0 ${r} C 0 ${c} ${c} 0 ${r} 0 Z`;
  const border = o.border === undefined ? LINE : o.border;
  const fill = o.fill === undefined ? CARD : o.fill;
  // Neither: nothing to draw (pdf-lib would outline it in black).
  if (!fill && !border) return;
  page.drawSvgPath(d, { x, y: top, ...fillOf(fill), ...(border ? { borderColor: border, borderWidth: 0.6 } : {}) });
}

/** The company line on every document. */
export const legalLine = () =>
  `${HELIAXIS_PARTY.name} · Registered in England and Wales No. ${HELIAXIS_PARTY.companyNumber} · Registered address: ${HELIAXIS_COMPANY.addressLines.join(', ')} · VAT ${HELIAXIS_PARTY.vatNumber} · MCS ${HELIAXIS_COMPANY.mcsNumber}`;

/** Lines no wider than max, broken between " · " items (between words only inside an item too long for a line). */
export function fitItems(s: string, max: number, measure: (t: string) => number): string[] {
  const out: string[] = [];
  let line = '';
  for (const item of s.split(' · ')) {
    const t = line ? `${line} · ${item}` : item;
    if (measure(t) <= max) {
      line = t;
      continue;
    }
    if (line) out.push(line);
    line = '';
    for (const word of item.split(' ')) {
      const w = line ? `${line} ${word}` : word;
      if (!line || measure(w) <= max) line = w;
      else {
        out.push(line);
        line = word;
      }
    }
  }
  if (line) out.push(line);
  return out;
}

/* ── Text ────────────────────────────────────────────────────────────────────── */

// What Helvetica can show (WinAnsi): printable ASCII, Latin-1 and the extra punctuation in 0x80–0x9F.
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const showable = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.has(ch);
};
/** Text Helvetica can draw: tabs to spaces, anything it hasn't got to "?". */
export function pdfText(s: string | null | undefined): string {
  return [...String(s ?? '').replace(/\t/g, ' ')].map((ch) => (ch === '\n' || showable(ch) ? ch : '?')).join('');
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

/* ── The logos ───────────────────────────────────────────────────────────────── */

const assets = new Map<string, { bytes: Uint8Array | null; missedAt: number }>();
/**
 * public/assets/<name> (bundled with the routes: next.config.ts), else the live site's copy, else
 * null. A miss is tried again after 10 minutes.
 */
async function asset(name: string): Promise<Uint8Array | null> {
  const known = assets.get(name);
  if (known?.bytes) return known.bytes;
  if (known && Date.now() - known.missedAt < 10 * 60_000) return null;
  let bytes: Uint8Array | null = null;
  try {
    bytes = new Uint8Array(await readFile(path.join(process.cwd(), 'public', 'assets', name)));
  } catch {
    try {
      const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
      const r = await fetch(`${site}/assets/${name}`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
    } catch {
      // Not this time.
    }
  }
  assets.set(name, { bytes, missedAt: bytes ? 0 : Date.now() });
  return bytes;
}

/**
 * The wordmark for light paper: the brand artwork with the ® (the trade mark is registered;
 * public/assets/heliaxis-logo-doc.png), else the older heliaxis-logo.png, else none (the name in type instead).
 */
export async function logo(): Promise<Uint8Array | null> {
  return (await asset('heliaxis-logo-doc.png')) ?? (await asset('heliaxis-logo.png'));
}
/** The reversed wordmark (cream, gold spark, ®) for the dark bands: public/assets/heliaxis-logo-doc-light.png. */
export async function logoLight(): Promise<Uint8Array | null> {
  return asset('heliaxis-logo-doc-light.png');
}

/* ── Fonts ───────────────────────────────────────────────────────────────────── */

type FontFiles = {
  hanken: Uint8Array | null;
  hankenBold: Uint8Array | null;
  noto: Uint8Array | null;
  notoBold: Uint8Array | null;
  math: Uint8Array | null;
  display: Uint8Array | null;
  mono: Uint8Array | null;
  monoBold: Uint8Array | null;
};
let fontFiles: Promise<FontFiles | null> | null = null;
/**
 * The brand's faces from public/assets/fonts (bundled with the routes: next.config.ts), each already
 * cut down to the characters documents use (Latin, Welsh, Ω µ, punctuation, super- and subscripts,
 * ≤ ≥), so they're embedded whole: pdf-lib's own subsetting drops glyphs. Hanken Grotesk for the body
 * (Noto Sans when it isn't there, and for a ruled form), Ezra Bold for titles and section headings
 * (TrueType outlines, so every reader takes it), JetBrains Mono for eyebrows, labels and the banner,
 * and Noto Sans Math for ✓. Null when no body face can be read; a brand face that can't be read is
 * drawn in the body face.
 */
function loadFonts(): Promise<FontFiles | null> {
  fontFiles ??= (async () => {
    const dir = path.join(process.cwd(), 'public', 'assets', 'fonts');
    const opt = (name: string) => readFile(path.join(dir, name)).then((b) => new Uint8Array(b), () => null);
    const [hanken, hankenBold, noto, notoBold, math, display, mono, monoBold] = await Promise.all([
      opt('HankenGrotesk-Regular.ttf'),
      opt('HankenGrotesk-Bold.ttf'),
      opt('NotoSans-Regular.ttf'),
      opt('NotoSans-Bold.ttf'),
      opt('NotoSansMath-Regular.ttf'),
      opt('Ezra-Bold.ttf'),
      opt('JetBrainsMono-Regular.ttf'),
      opt('JetBrainsMono-SemiBold.ttf'),
    ]);
    if (!(hanken && hankenBold) && !(noto && notoBold)) {
      fontFiles = null;
      return null;
    }
    return { hanken, hankenBold, noto, notoBold, math, display, mono, monoBold };
  })();
  return fontFiles;
}

type Face = { font: PDFFont; has: (cp: number) => boolean };
/** Which face a piece of text is set in. */
export type Style = 'regular' | 'bold' | 'display' | 'mono' | 'monoBold';
/**
 * The faces a document draws with: the body regular and bold, the symbol face, Ezra and JetBrains
 * Mono (null without their files), or Helvetica when the fonts are missing.
 */
type Faces = { regular: Face; bold: Face; math: Face | null; display: Face | null; mono: Face | null; monoBold: Face | null; unicode: boolean };
/** The body face: 'brand' (Hanken Grotesk) or 'form' (Noto Sans: the IET form's own look, the EIC). */
export type Body = 'brand' | 'form';

/** Symbols spelt out when only Helvetica is there. */
const SPELL: Record<string, string> = { 'Ω': 'Ohm', 'Ω': 'Ohm', '≥': '>=', '≤': '<=', '✓': 'Yes', '✗': 'No', '→': '->', '≠': '!=' };
const helveticaText = (s: string) => pdfText([...s].map((ch) => SPELL[ch] ?? ch).join(''));

async function facesFor(doc: PDFDocument, opt: { bannerOnly?: boolean; body?: Body } = {}): Promise<Faces> {
  const files = await loadFonts();
  if (files && opt.bannerOnly && files.mono && files.monoBold) {
    // Only what the banner sets (the legal line, the page tag): the two mono faces, nothing else embedded.
    try {
      doc.registerFontkit(fontkit);
      const mono = fontkit.create(files.mono);
      const monoBold = fontkit.create(files.monoBold);
      const r: Face = { font: await doc.embedFont(files.mono), has: (cp) => mono.hasGlyphForCodePoint(cp) };
      const b: Face = { font: await doc.embedFont(files.monoBold), has: (cp) => monoBold.hasGlyphForCodePoint(cp) };
      return { regular: r, bold: b, math: null, display: null, mono: r, monoBold: b, unicode: true };
    } catch {
      // Fall through to Helvetica.
    }
  } else if (files) {
    const [regular, bold] = (opt.body === 'form' ? files.noto && files.notoBold : !(files.hanken && files.hankenBold))
      ? [files.noto ?? files.hanken, files.notoBold ?? files.hankenBold]
      : [files.hanken, files.hankenBold];
    try {
      doc.registerFontkit(fontkit);
      const face = async (bytes: Uint8Array | null): Promise<Face | null> => {
        if (!bytes) return null;
        const k = fontkit.create(bytes);
        return { font: await doc.embedFont(bytes), has: (cp) => k.hasGlyphForCodePoint(cp) };
      };
      const optional = (bytes: Uint8Array | null) => face(bytes).catch(() => null);
      return {
        regular: (await face(regular))!,
        bold: (await face(bold))!,
        math: await optional(files.math),
        display: await optional(files.display),
        mono: await optional(files.mono),
        monoBold: await optional(files.monoBold),
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
    display: null,
    mono: null,
    monoBold: null,
    unicode: false,
  };
}

/** The faces tried in order for a style: its own, then the body face of the same weight. */
const chain = (f: Faces, style: Style): Face[] => {
  const body = style === 'regular' || style === 'mono' ? f.regular : f.bold;
  const own = style === 'display' ? f.display : style === 'mono' ? f.mono : style === 'monoBold' ? f.monoBold : null;
  return own ? [own, body] : [body];
};

/** Characters the brand faces haven't got, and the look-alike the symbol face has: Greek capital delta, the increment sign. */
const ALIKE: Record<number, number> = { 0x394: 0x2206 };

/** Text in runs, each in a face that has its characters (the symbol face for ≥ and ✓); "?" for anything none has. */
function runs(f: Faces, text: string, style: Style): { face: Face; s: string }[] {
  const faces = chain(f, style);
  const clean = f.unicode ? text.replace(/\t/g, ' ') : helveticaText(text);
  const out: { face: Face; s: string }[] = [];
  for (const raw of clean) {
    // A character no face has, drawn as its look-alike where one has that (Δ in IΔn as the increment sign ∆).
    const alike = ALIKE[raw.codePointAt(0) ?? 0];
    const ch = alike && !faces.some((x) => x.has(raw.codePointAt(0)!)) ? String.fromCodePoint(alike) : raw;
    const cp = ch.codePointAt(0) ?? 0x3f;
    const face = faces.find((x) => x.has(cp)) ?? (f.math?.has(cp) ? f.math : faces[0]);
    const c = face === faces[0] && !face.has(cp) ? '?' : ch;
    const last = out.at(-1);
    if (last && last.face === face) last.s += c;
    else out.push({ face, s: c });
  }
  return out;
}

/**
 * Letter-spacing for mono capitals, in em. Small on purpose: PDF readers turn a gap of a tenth of an
 * em between letters into a space when the text is copied or searched ("P R O J E C T"), and a word
 * gap (the mono space, 0.44 em, plus the spacing either side of it) of 0.6 em into a column break.
 */
export const TRACK = 0.06;

/**
 * Text options: `style` the face (or `bold`), `track` letter-spacing in em, `heavy` a hair of outline
 * round the letters in their own colour (a weight heavier than the face has), `rotate` 90 runs the
 * text up the page (a schedule's column headings) from (x, y).
 */
export type TextOpt = { style?: Style; bold?: boolean; color?: RGB; italic?: boolean; track?: number; heavy?: boolean; rotate?: 90 };
/** An item of the line under the masthead (the supplier order's own name and address). */
export type MastLine = { s: string; bold?: boolean; muted?: boolean };
/** A style from TextOpt, or from `bold` given as a flag (true: bold) or a style. */
const styleOf = (b: boolean | Style | undefined): Style => (typeof b === 'string' ? b : b ? 'bold' : 'regular');

/**
 * The page furniture in a document's own fonts: text drawing (with letter-spacing for mono capitals),
 * mono labels, the masthead (the first page's ink header band), the slim strip at the top of a later
 * page and the dark banner. newDocument uses it, and so does a document with its own layout (the
 * supplier purchase order): paint() each page as it's added, masthead() at the top of the first,
 * strip() at the top of the others, banner() on each page at the end (it also draws the gold rule down
 * the margin). `bannerOnly` embeds just the banner's mono faces. `variant`: 'digital' (the default) or
 * 'print' (Variant); paint(), card(), figure() and `look` give a document's own furniture the variant's
 * fills. `body`: 'form' sets the body in Noto Sans (the EIC).
 */
export async function pageKit(doc: PDFDocument, opt: { bannerOnly?: boolean; variant?: Variant; body?: Body } = {}) {
  const look = lookOf(opt.variant);
  const print = look.variant === 'print';
  const f = await facesFor(doc, { bannerOnly: opt.bannerOnly, body: opt.body });
  // The wordmark in the bands: reversed (cream, gold spark) on ink; on a print, the ink one on the paper.
  const markPng = print ? await logo() : await logoLight();
  const light: PDFImage | null = markPng ? await doc.embedPng(markPng).catch(() => null) : null;
  /** What's set in the bands: on ink (digital) or, on a print, in ink on the paper. */
  const on = print
    ? { title: INK, key: LABEL, value: INK, rule: LINE, eyebrow: AMBER_TEXT, spark: AMBER, small: LABEL, faint: MUTED }
    : { title: PAPER, key: BANNER_TEXT, value: PAPER, rule: LINE_DARK, eyebrow: SOLAR, spark: SOLAR, small: BANNER_TEXT, faint: MUTED_DARK };
  /** On a print the rules stop where a printer stops: from the gold rule down the margin to the right margin. */
  const PRINT_RULE_X0 = SPINE_X - 0.7;

  const width = (s: string, sz: number, style: Style = 'regular', track = 0) =>
    runs(f, s, style).reduce((w, r) => w + r.face.font.widthOfTextAtSize(r.s, sz), 0) + Math.max(0, [...s].length - 1) * track * sz;
  const text = (page: PDFPage, s: string, x: number, yy: number, sz: number, opt: TextOpt = {}) => {
    const style = opt.style ?? styleOf(opt.bold);
    const track = opt.track ?? 0;
    const color = opt.color ?? INK;
    if (opt.heavy) page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(sz * 0.028), setStrokingColor(color));
    if (track) page.pushOperators(setCharacterSpacing(track * sz));
    let cx = x;
    let cy = yy;
    for (const r of runs(f, s, style)) {
      page.drawText(r.s, { x: cx, y: cy, size: sz, font: r.face.font, color, ...(opt.italic ? { ySkew: degrees(12) } : {}), ...(opt.rotate ? { rotate: degrees(opt.rotate) } : {}) });
      const adv = r.face.font.widthOfTextAtSize(r.s, sz) + [...r.s].length * track * sz;
      if (opt.rotate) cy += adv;
      else cx += adv;
    }
    if (track) page.pushOperators(setCharacterSpacing(0));
    if (opt.heavy) page.pushOperators(popGraphicsState());
  };
  /** A mono capitals label ("PROJECT REFERENCE"), from x or, with `right`, ending at x. */
  const label = (page: PDFPage, s: string, x: number, yy: number, sz: number, o: { color?: RGB; bold?: boolean; right?: boolean } = {}) => {
    const t = s.toUpperCase();
    const style: Style = o.bold ? 'monoBold' : 'mono';
    text(page, t, o.right ? x - width(t, sz, style, TRACK) : x, yy, sz, { style, color: o.color ?? LABEL, track: TRACK });
  };
  /** Lines no wider than max, measured in the document's own fonts. */
  const lines = (s: string, sz: number, max: number, style: Style = 'regular', track = 0): string[] => {
    const out: string[] = [];
    for (const para of String(s ?? '').split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const t = line ? `${line} ${word}` : word;
        if (width(t, sz, style, track) <= max) {
          line = t;
          continue;
        }
        if (line) out.push(line);
        let rest = word;
        while (rest && width(rest, sz, style, track) > max) {
          let n = rest.length - 1;
          while (n > 1 && width(rest.slice(0, n), sz, style, track) > max) n--;
          out.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  };
  const hair = (page: PDFPage, x0: number, x1: number, yy: number, color: RGB = LINE, t = 0.6) => page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: t, color });

  /** Where each page's top band ends (the gold rule down the margin starts under it). */
  const tops = new Map<PDFPage, number>();
  /** A wordmark image, its letters `w` wide from x, centred on cy (the artwork's own margin allowed for). */
  const drawMark = (page: PDFPage, img: PDFImage | null, x: number, cy: number, w: number, fallback: RGB) => {
    if (!img) return text(page, 'HELIAXIS', x, cy - w * 0.055, w * 0.16, { style: 'display', color: fallback });
    const dw = (w * ART.w) / (ART.w - 2 * ART.l);
    const dh = (dw * ART.h) / ART.w;
    page.drawImage(img, { x: x - (dw * ART.l) / ART.w, y: cy - dh / 2, width: dw, height: dh });
  };
  /** The wordmark (reversed on ink, ink on a print), its letters `w` wide from x, centred on cy. */
  const lightLogo = (page: PDFPage, x: number, cy: number, w: number) => drawMark(page, light, x, cy, w, on.title);
  /** How tall the wordmark's letters (with the ®) stand when they're `w` wide. */
  const logoHeight = (w: number) => (w * (ART.h - ART.t - ART.b)) / (ART.w - 2 * ART.l);
  /**
   * An ink band across the top of the page, `h` deep, on a gold rule. On a print, no band: the gold
   * rule alone under the first page's header (`first`), a hairline under a later page's running head.
   */
  const topBand = (page: PDFPage, h: number, first: boolean, xr: number) => {
    const pw = page.getWidth();
    const ph = page.getHeight();
    tops.set(page, ph - h - GOLD_RULE);
    if (!print) {
      page.drawRectangle({ x: 0, y: ph - h, width: pw, height: h, color: INK });
      page.drawRectangle({ x: 0, y: ph - h - GOLD_RULE, width: pw, height: GOLD_RULE, color: SOLAR });
    } else if (first) page.drawRectangle({ x: PRINT_RULE_X0, y: ph - h - GOLD_RULE, width: xr - PRINT_RULE_X0, height: GOLD_RULE, color: SOLAR });
    else {
      hair(page, PRINT_RULE_X0, xr, ph - h - GOLD_RULE / 2, INK, 0.5);
      // The gold rule down the margin meets the hairline.
      tops.set(page, ph - h - GOLD_RULE / 2);
    }
  };
  /** The page colour (none on a print), when a page is added. */
  const paint = (page: PDFPage) => paintPage(page, look.variant);
  /** A card in the variant's fill (none on a print: the hairline round it). */
  const card = (page: PDFPage, x: number, top: number, w: number, h: number, o: { border?: RGB | null; r?: number } = {}) => drawCard(page, x, top, w, h, { ...o, fill: look.panel });
  /**
   * The bar the figure a document is for sits on ("What you'll be paid", the order's total), (x, top)
   * its top-left corner: ink, or on a print a hairline round it and a thick gold edge on the left.
   * Returns the colours for its words and for the figure.
   */
  const figure = (page: PDFPage, x: number, top: number, w: number, h: number): { words: RGB; figure: RGB } => {
    if (!print) {
      page.drawRectangle({ x, y: top - h, width: w, height: h, color: INK });
      return { words: PAPER, figure: SOLAR };
    }
    page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: INK, borderWidth: 0.6 });
    page.drawRectangle({ x: x - 0.3, y: top - h - 0.3, width: 4, height: h + 0.6, color: SOLAR });
    return { words: INK, figure: INK };
  };

  /**
   * The first page's ink header band: the reversed wordmark, the spark and the eyebrow in gold mono
   * ("F43 · PROJECT HX-0042"), the title in Ezra in cream, and the document's references on the right
   * in mono on dark hairlines; a gold rule under it. Then, on the page, the line a supplier needs
   * (`under`: our name and address). Everything is at least 5 mm in from the paper's edge, where a
   * printer can reach. Returns where the content starts.
   */
  const masthead = (page: PDFPage, o: { x: number; w: number; meta: [string, string][]; eyebrow: string; title: string; under?: MastLine[] }): number => {
    const { x, w } = o;
    const ph = page.getHeight();
    const LS = 7;
    const VS = 8.6;
    const PITCH = 13.6;
    const metaTop = ph - 14;
    let bw = 0;
    if (o.meta.length) {
      const lw = Math.max(...o.meta.map(([k]) => width(k.toUpperCase(), LS, 'mono', TRACK)));
      const vw = Math.max(...o.meta.map(([, v]) => width(v, VS, 'monoBold')));
      bw = Math.max(150, lw + vw + 20);
    }
    // The title takes the band's width, less the references where they reach down beside it (to within 4 pt of its capitals).
    const titleTop = ph - 52;
    const tw = o.meta.length && metaTop - o.meta.length * PITCH < titleTop ? w - bw - 18 : w;
    const tl = lines(o.title, 20, tw, 'display');
    const h = HEAD_H + (tl.length - 1) * 23;
    topBand(page, h, true, x + w);
    lightLogo(page, x, ph - 24, 96);
    const ey = ph - 47;
    drawSpark(page, x + 4, ey + 2.8, 9.5, on.spark);
    text(page, o.eyebrow.toUpperCase(), x + 13.5, ey, 7.8, { style: 'monoBold', color: on.eyebrow, track: TRACK });
    let ty = ph - 72;
    for (const l of tl) {
      text(page, l, x, ty, 20, { style: 'display', color: on.title });
      ty -= 23;
    }
    let my = metaTop;
    const bx = x + w - bw;
    o.meta.forEach(([k, v], i) => {
      label(page, k, bx, my - 9.4, LS, { color: on.key });
      text(page, v, x + w - width(v, VS, 'monoBold'), my - 9.6, VS, { style: 'monoBold', color: on.value });
      my -= PITCH;
      if (i < o.meta.length - 1) hair(page, bx, x + w, my, on.rule, 0.6);
    });
    let y = ph - h - GOLD_RULE - 20;
    if (o.under?.length) {
      // One line (or two) under the band: the name in bold, the rest muted.
      const sz = 8.2;
      const sep = '  ·  ';
      let lx = x;
      y -= 8;
      for (const [i, u] of o.under.entries()) {
        const st: Style = u.bold ? 'bold' : 'regular';
        const piece = `${i ? sep : ''}${u.s}`;
        if (lx + width(piece, sz, st) > x + w && lx > x) {
          lx = x;
          y -= 11.5;
          text(page, u.s, lx, y, sz, { style: st, color: u.muted ? MUTED : INK });
          lx += width(u.s, sz, st);
          continue;
        }
        text(page, piece, lx, y, sz, { style: st, color: u.muted ? MUTED : INK });
        lx += width(piece, sz, st);
      }
      y -= 16;
    }
    return y;
  };

  /**
   * The top of a later page: a slim ink strip (12 mm) on a gold rule, with the reversed wordmark and
   * what the document is ("F43 · PV ARRAY TEST REPORT · HX-0042 (CONTINUED)", or `short` where that's
   * too long), so a loose page can be put back (its page number is in the banner at the foot). Returns
   * where the content starts.
   */
  const strip = (page: PDFPage, o: { x: number; w: number; what: string; short?: string }): number => {
    const ph = page.getHeight();
    topBand(page, STRIP_H, false, o.x + o.w);
    // The line everything in the strip is centred on: 7 mm down, so the wordmark's top is 5 mm in.
    const cy = ph - 7 * MM;
    const logoW = 54;
    lightLogo(page, o.x, cy, logoW);
    const tx = o.x + logoW + 22;
    page.drawLine({ start: { x: tx - 11, y: cy - 6 }, end: { x: tx - 11, y: cy + 6 }, thickness: 0.6, color: on.rule });
    const room = o.x + o.w - tx;
    const what = o.short && width(o.what.toUpperCase(), 7, 'mono', TRACK) > room ? o.short : o.what;
    label(page, what, tx, cy - 2.5, 7, { color: on.small });
    return ph - STRIP_H - GOLD_RULE - 22;
  };

  /**
   * The banner across the foot of a page on a gold rule, laid out as a drawing's title block: the
   * reversed wordmark, then the legal line in mono (broken between its items), then `label`
   * ("Document"; '' for none) over `tag` ("F43 · Rev 2 · Page 1 of 2") and an optional `sub` (a line,
   * or lines parted by a line break), the three parted by hairlines. `tagRoom` is the widest tag the
   * document has, so every page lines up. Also what's drawn once the page is full: the gold rule down
   * the left margin (`spine`, not on a ruled form), from the top band (or the top edge) to the banner.
   * `h`: its depth (20 mm; a ruled form's is slimmer, its words kept clear of where a printer stops).
   * On a print the block keeps its layout on the paper, on a gold hairline, in ink.
   */
  const banner = (
    page: PDFPage,
    o: { tag: string; tagRoom?: number; legal?: string; margins?: { l: number; r: number }; h?: number; spine?: boolean; label?: string; sub?: string; oneLine?: boolean }
  ) => {
    const pw = page.getWidth();
    const ph = page.getHeight();
    const H = o.h ?? BANNER_H;
    const slim = H < BANNER_H;
    const m = o.margins ?? { l: MARGIN.l, r: MARGIN.r };
    const xr = pw - m.r;
    const spine = o.spine !== false;
    const footRule = print ? 0.8 : GOLD_RULE;
    if (spine) page.drawRectangle({ x: SPINE_X - 0.7, y: H + footRule, width: 1.4, height: (tops.get(page) ?? ph) - H - footRule, color: SOLAR });
    if (print) {
      const x0 = spine ? PRINT_RULE_X0 : m.l;
      page.drawRectangle({ x: x0, y: H, width: xr - x0, height: footRule, color: SOLAR });
    } else {
      page.drawRectangle({ x: 0, y: 0, width: pw, height: H, color: INK });
      page.drawRectangle({ x: 0, y: H, width: pw, height: GOLD_RULE, color: SOLAR });
    }
    // What the words are centred on: the band's middle, or on a slim band a little above it (clear of where a printer stops).
    const mid = slim ? H / 2 + 1.5 : H / 2;
    const logoW = slim ? 80 : 92;
    const logoH = light ? (light.height / light.width) * logoW : 0;
    if (light) page.drawImage(light, { x: m.l, y: mid - logoH / 2, width: logoW, height: logoH });
    else text(page, 'HELIAXIS', m.l, mid - 4, 12, { style: 'display', color: on.title });
    const tagSize = 6.8;
    const legalSize = 6.1;
    const subSize = 6;
    const legalText = o.legal ?? legalLine();
    const labelText = o.label ?? 'Document';
    const subs = o.sub ? o.sub.split('\n') : [];
    const c2 = m.l + logoW + 16;
    // The tag on one line, or on two ("Heat pump supply · Rev 1" over "Page 1 of 2") when one line would
    // leave the legal line too little room to keep each of its items (the registered address) whole.
    const widest = Math.max(...legalText.split(' · ').map((t) => width(t, legalSize, 'mono')));
    const subW = Math.max(0, ...subs.map((t) => width(t, subSize, 'mono')));
    let tag = [o.tag];
    let tagW = Math.max(o.tagRoom ?? 0, width(o.tag, tagSize, 'monoBold'), subW);
    const k = o.tag.lastIndexOf(' · ');
    if (!o.oneLine && xr - tagW - 14 - (c2 + 14) - 12 < widest && k > 0) {
      tag = [o.tag.slice(0, k), o.tag.slice(k + 3)];
      tagW = Math.max(...tag.map((t) => width(t, tagSize, 'monoBold')), width('Page 00 of 00', tagSize, 'monoBold'), subW);
    }
    const c3 = xr - tagW;
    const inset = Math.min(15, H * 0.26);
    const rule = (x: number) => page.drawLine({ start: { x, y: mid - H / 2 + inset }, end: { x, y: mid + H / 2 - inset }, thickness: 0.6, color: on.rule });
    rule(c2);
    rule(c3 - 14);
    const legal = fitItems(legalText, c3 - 14 - (c2 + 14) - 12, (t) => width(t, legalSize, 'mono'));
    const lead = slim ? 7.8 : 8.2;
    let ly = mid + ((legal.length - 1) * lead) / 2 - 2;
    for (const l of legal) {
      text(page, l, c2 + 14, ly, legalSize, { style: 'mono', color: on.small });
      ly -= lead;
    }
    // The label, the tag and the sub-lines, centred on the band as a block.
    const block = (labelText ? 11 : 0) + (tag.length - 1) * 9 + (subs.length ? 8.6 + (subs.length - 1) * 7.6 : 0);
    let ty = mid + block / 2 - 2;
    if (labelText) {
      text(page, labelText.toUpperCase(), c3, ty, 6, { style: 'mono', color: on.faint, track: TRACK });
      ty -= 11;
    }
    for (const t of tag) {
      text(page, t, c3, ty, tagSize, { style: 'monoBold', color: on.value });
      ty -= 9;
    }
    ty += 9 - 8.6;
    for (const t of subs) {
      text(page, t, c3, ty, subSize, { style: 'mono', color: on.small });
      ty -= 7.6;
    }
  };

  return { faces: f, look, width, text, label, lines, hair, masthead, strip, banner, paint, card, figure, drawMark, logoHeight };
}

/* ── The document kit ────────────────────────────────────────────────────────── */

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
  /** 'digital' (the default: emailed, the portal, the handover pack) or 'print' (the ink saver, on request). */
  variant?: Variant;
  /** Margins other than FORMS 0.6's, in points (the EIC's ruled frame runs closer to the edge, as the model form's does). */
  margins?: Partial<Margins>;
  /**
   * A ruled form (the EIC): drawn at the top of every page instead of the masthead and the strip
   * ("Certificate No.:", the form's title and the ® logo). Given what a block draws with and the page's
   * number (from 1), it returns the points it took. The form keeps its own type (Noto Sans) and gets
   * the slimmer banner, without the gold rule down the margin.
   */
  pageHead?: (d: Drawing, page: { n: number; landscape: boolean }) => number;
  /**
   * The banner's own words: `lines` in place of the legal line, `ref` in place of the code and
   * revision before "Page x of y" ("Certificate No. HX-0042-EIC · Page 2 of 7"), `label` over it
   * ("Certificate"), and `sub` a small line under it.
   */
  footer?: { lines?: string[]; ref?: string; label?: string; sub?: string };
};

/** What a page head or a block() draws with. */
export type Drawing = {
  page: PDFPage;
  x: number;
  top: number;
  width: number;
  /** The variant's fills (none on a print). */
  look: Look;
  text: (s: string, x: number, y: number, sz: number, opt?: TextOpt) => void;
  right: (s: string, xr: number, y: number, sz: number, opt?: TextOpt) => void;
  lines: (s: string, sz: number, max: number, bold?: boolean) => string[];
  widthOf: (s: string, sz: number, bold?: boolean) => number;
  mark: (bx: number, by: number, m: Mark, s?: number) => void;
  rect: (rx: number, ry: number, rw: number, rh: number, opt?: { fill?: RGB | null; border?: RGB; line?: number }) => void;
  line: (x1: number, y1: number, x2: number, y2: number, opt?: { color?: RGB; t?: number; dash?: number[]; round?: boolean }) => void;
  image: (img: PDFImage, ix: number, iy: number, maxW: number, maxH: number) => void;
  /** The spark, centred on (cx, cy), `size` across. */
  spark: (cx: number, cy: number, size: number, color?: RGB) => void;
  /** The ink wordmark (®), its letters `w` wide from x, centred on cy (embedded when the document starts). */
  logo: (x: number, cy: number, w: number) => void;
  /** How tall the wordmark's letters stand at a width. */
  logoHeight: (w: number) => number;
};

/** `strong`: the figure the document is for ("What you'll be paid"), on an ink band and larger. */
export type Row = { label: string; value: string | null | undefined; must?: boolean; note?: string | null; strong?: boolean };
/** A drawn tick, a cross, N/A, or 'empty' (a box left blank on purpose: a Table 2 condition that doesn't apply). */
export type Mark = 'tick' | 'cross' | 'na' | 'empty' | null;
export type CheckItem = { label: string; mark: Mark; note?: string | null; must?: boolean };
/** results(): a bold title, the wording, sub-lines, italic guidance, and a result in words or a mark. */
export type ResultItem = { title?: string | null; label: string; lines?: string[]; guidance?: string | null; italic?: boolean; value?: string | null; mark?: Mark; note?: string | null; must?: boolean };
/**
 * A photo for photos(). `fit`: 'cover' fills the 4:3 frame and crops what's over (a photo), 'contain'
 * shows the whole image on white inside it (a scan or a barcode, which a crop would cut); by default
 * PNGs are contained and everything else covered.
 */
export type PhotoItem = { bytes: Uint8Array; mime: string; caption: string; sub?: string | null; fit?: 'cover' | 'contain' };
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

/** Inside a card: the padding round a photo or a table. */
const CARD_PAD = 6;

/**
 * Start a document, then write it top to bottom: header, idGrid, section, rows, checklist, results,
 * grid, list, note, paragraph, photos, signatures (or block() for a layout of its own). Content runs
 * onto new pages by itself (a section heading kept with its first rows, table headings repeated, a row
 * of photo cards never split). save() draws the banner on every page.
 */
export async function newDocument(o: DocOptions) {
  const doc = await PDFDocument.create();
  // A ruled form (the EIC): its own page head and type, the slimmer banner, no gold rule down the margin.
  const form = !!o.pageHead;
  const pk = await pageKit(doc, { variant: o.variant, body: form ? 'form' : 'brand' });
  const look = pk.look;
  const M: Margins = { ...MARGIN, ...o.margins };
  const bannerH = form ? FORM_BANNER_H : BANNER_H;
  /** Content stops this far up the page: over the banner and its gold rule. */
  const FLOOR = bannerH + (form ? 8 : 16);
  // A document can turn between portrait and landscape page by page (the EIC's schedules): newPage().
  let size: [number, number] = o.landscape ? [A4[1], A4[0]] : A4;
  let W = size[0] - M.l - M.r;
  const X = M.l;
  const label = o.label ?? o.code;
  doc.setTitle(`${label} ${o.title}${o.jobRef ? ` – ${o.jobRef}` : ''}`);
  doc.setAuthor(HELIAXIS_PARTY.name);
  doc.setCreator('Heliaxis');
  doc.setProducer('Heliaxis');
  // The ink wordmark a form's page head draws (embedded now: blocks draw synchronously).
  const inkLogo = form ? await (async () => {
    const png = await logo();
    return png ? doc.embedPng(png).catch(() => null) : null;
  })() : null;

  const addPage = () => {
    const p = doc.addPage(size);
    pk.paint(p);
    return p;
  };
  let page: PDFPage = addPage();
  let y = size[1] - M.t;
  /** The most a later page holds, from under its strip to the floor. */
  const pageRoom = () => size[1] - (form ? M.t : STRIP_H + GOLD_RULE + 22) - FLOOR;

  const width = (s: string, sz: number, bold: boolean | Style = false, track = 0) => pk.width(s, sz, styleOf(bold), track);
  const lines = (s: string, sz: number, max: number, bold: boolean | Style = false, track = 0) => pk.lines(s, sz, max, styleOf(bold), track);
  const text = (s: string, x: number, yy: number, sz: number, opt: TextOpt = {}) => pk.text(page, s, x, yy, sz, opt);
  const right = (s: string, xr: number, yy: number, sz: number, opt: TextOpt = {}) => text(s, xr - width(s, sz, opt.style ?? styleOf(opt.bold), opt.track ?? 0), yy, sz, opt);
  /** A mono capitals label ("PROJECT REFERENCE"). */
  const label7 = (s: string, x: number, yy: number, sz: number, color: RGB = LABEL, bold = false) => pk.label(page, s, x, yy, sz, { color, bold });
  const hairline = (yy: number, color: RGB = LINE, t = 0.6, x0 = X, x1 = X + W) => pk.hair(page, x0, x1, yy, color, t);
  const vline = (x: number, y0: number, y1: number, color: RGB = LINE, t = 0.5) => page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness: t, color });

  /** What a page head or a block() draws with: the page, where it starts, and the kit's own text in its fonts. */
  const drawing = (): Drawing => ({
    page,
    x: X,
    top: y,
    width: W,
    look,
    text,
    right,
    lines: (s, sz, max, bold) => lines(s, sz, max, bold),
    widthOf: (s, sz, bold) => width(s, sz, bold),
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
    rect(rx: number, ry: number, rw: number, rh: number, opt: { fill?: RGB | null; border?: RGB; line?: number } = {}) {
      if (!opt.fill && !opt.border) return;
      page.drawRectangle({ x: rx, y: ry, width: rw, height: rh, ...fillOf(opt.fill), ...(opt.border ? { borderColor: opt.border, borderWidth: opt.line ?? 0.5 } : {}) });
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
    spark(cx: number, cy: number, size: number, color: RGB = AMBER) {
      drawSpark(page, cx, cy, size, color);
    },
    logo(x: number, cy: number, w: number) {
      pk.drawMark(page, inkLogo, x, cy, w, INK);
    },
    logoHeight: pk.logoHeight,
  });

  /** The page head (a form's pageHead), on a page just begun. */
  const head = () => {
    if (o.pageHead) y -= o.pageHead(drawing(), { n: doc.getPageCount(), landscape: size[0] > size[1] });
  };
  const continued = () => {
    page = addPage();
    if (form) {
      y = size[1] - M.t;
      return head();
    }
    const ref = `${o.jobRef ? ` · ${o.jobRef}` : ''} (continued)`;
    y = pk.strip(page, { x: X, w: W, what: `${label === o.title ? label : `${label} · ${o.title}`}${ref}`, short: `${label}${ref}` });
  };
  /** Room for h more on this page, else a new page (then `again`: a table's headings). */
  const need = (h: number, again?: () => void) => {
    if (y - h >= FLOOR) return;
    continued();
    again?.();
  };
  /** "12." at the start of a form's row: set apart in mono, the wording beside it. */
  const numbered = (s: string): { n: string | null; rest: string } => {
    const m = /^(\d{1,3}[A-Za-z]?\.)\s+([\s\S]*)$/.exec(s);
    return m ? { n: m[1], rest: m[2] } : { n: null, rest: s };
  };
  const NUM_W = 20;
  const box = (bx: number, by: number, mark: Mark) => {
    page.drawRectangle({ x: bx, y: by, width: 13, height: 13, ...fillOf(look.cell), borderColor: INK, borderWidth: 0.8 });
    if (mark === 'tick') {
      page.drawLine({ start: { x: bx + 2.8, y: by + 6.6 }, end: { x: bx + 5.6, y: by + 3.3 }, thickness: 1.6, color: INK });
      page.drawLine({ start: { x: bx + 5.6, y: by + 3.3 }, end: { x: bx + 10.8, y: by + 10.3 }, thickness: 1.6, color: INK });
    } else if (mark === 'cross') {
      page.drawLine({ start: { x: bx + 3.3, y: by + 3.3 }, end: { x: bx + 9.7, y: by + 9.7 }, thickness: 1.6, color: RED });
      page.drawLine({ start: { x: bx + 3.3, y: by + 9.7 }, end: { x: bx + 9.7, y: by + 3.3 }, thickness: 1.6, color: RED });
    }
  };

  /**
   * The rows of photo cards photos() draws: `per` to a row (2 unless asked for 3), each card a 4:3
   * photo with the caption and the time under it, every card in a row as tall as its tallest.
   */
  const photoLayout = (items: Pick<PhotoItem, 'caption' | 'sub'>[], perRow = 2) => {
    const per = perRow;
    const gap = 10;
    const cw = (W - gap * (per - 1)) / per;
    const iw = cw - 2 * CARD_PAD;
    const ih = (iw * 3) / 4;
    const rows: { items: { c: string[]; s: string[] }[]; h: number }[] = [];
    for (let i = 0; i < items.length; i += per) {
      const row = items.slice(i, i + per).map((p) => ({ c: lines(p.caption, 8, iw, 'bold'), s: p.sub ? lines(p.sub, 6.4, iw, 'mono') : [] }));
      // Under the photo: the first caption line 11 pt down, the rest 10 apart, the time 9.2 under the last, 8.4 apart.
      const under = Math.max(...row.map((r) => 11 + (r.c.length - 1) * 10 + (r.s.length ? 9.2 + (r.s.length - 1) * 8.4 : 0)));
      rows.push({ items: row, h: CARD_PAD + ih + under + 3 + CARD_PAD });
    }
    return { per, gap, cw, iw, ih, rows };
  };

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
    /** The variant's fills. */
    look,
    /** Points left on this page above the banner. */
    room: () => y - FLOOR,
    /** Text measured in the document's own fonts (for laying out a block before drawing it). */
    lines,
    widthOf: width,
    /**
     * A new page, portrait or landscape (the EIC's schedules are landscape, as the model forms are).
     * `continued`: as content running over does (the slim strip; a form's page head).
     */
    newPage(opt: { landscape?: boolean; continued?: boolean } = {}) {
      size = opt.landscape ? [A4[1], A4[0]] : A4;
      W = size[0] - M.l - M.r;
      if (opt.continued || !form) continued();
      else {
        page = addPage();
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
    /**
     * The masthead (the ink header band: the wordmark, the gold mono eyebrow with the spark, the Ezra
     * title in cream, the references on the right), then the draft banner on a draft.
     */
    header(h: { meta?: [string, string][] } = {}) {
      y = pk.masthead(page, { x: X, w: W, meta: h.meta ?? [], eyebrow: `${label} · ${o.jobRef ? `Project ${o.jobRef}` : 'Heliaxis'}`, title: o.title });
      if (o.draft) {
        page.drawRectangle({ x: X, y: y - 22, width: W, height: 22, ...fillOf(look.cell), borderColor: SOLAR, borderWidth: 1.4 });
        text('Draft: not signed yet', X + 10, y - 15, 9.5, { bold: true, color: look.flag });
        y -= 32;
      }
    },
    /** The site box: a spec grid on a card, label and value pairs two to a row, parted by hairlines. */
    idGrid(pairs: [string, string | null | undefined][]) {
      const colW = W / 2;
      const cells = pairs.map(([k, v]) => ({ k, v: lines(v || '–', 9, colW - 20, 'bold') }));
      const heights: number[] = [];
      for (let i = 0; i < cells.length; i += 2) heights.push(Math.max(...cells.slice(i, i + 2).map((c) => 21.5 + c.v.length * 11.5)) + 4);
      const total = heights.reduce((a, b) => a + b, 0);
      need(total);
      pk.card(page, X, y, W, total);
      vline(X + colW, y, y - total, LINE, 0.6);
      let cy = y;
      for (let i = 0; i < cells.length; i += 2) {
        cells.slice(i, i + 2).forEach((c, j) => {
          const cx = X + 10 + j * colW;
          label7(c.k, cx, cy - 12.2, 6.6);
          c.v.forEach((l, n) => text(l, cx, cy - 25 - n * 11.5, 9, { bold: true }));
        });
        cy -= heights[i / 2];
        if (i + 2 < cells.length) hairline(cy, LINE, 0.6);
      }
      y -= total + 14;
    },
    /**
     * A section: a hairline across the page, then the spark and the heading in Ezra (no section
     * numbers: the forms have their own). Kept with its first rows (`keep` points of them); an
     * optional line under it.
     */
    section(title: string, opt: { intro?: string | null; keep?: number } = {}) {
      const intro = opt.intro ? lines(opt.intro, 8.5, W) : [];
      const tl = lines(title, 12, W - 15, 'display');
      // As drawn below: the rule, the heading's lines, the intro.
      need(23 + tl.length * 15 + (intro.length ? intro.length * 11 + 4 : 0) + (opt.keep ?? 44));
      y -= 4;
      hairline(y - 4.6, INK, 0.6);
      y -= 23;
      // Deep amber, as option B had it: the shape holds at this size and still shows printed in black and white.
      drawSpark(page, X + 4.6, y + 4.2, 9.2, AMBER);
      for (const l of tl) {
        text(l, X + 15, y, 12, { style: 'display' });
        y -= 15;
      }
      y += 6;
      for (const l of intro) {
        y -= 11;
        text(l, X, y, 8.5, { color: MUTED });
      }
      y -= intro.length ? 6 : 2;
    },
    /**
     * Question and answer rows, answers bold. Short field names print in mono in a narrow column
     * (36/64), questions and long wording in the body face (58/42); either way in the form's own
     * words and case. A must left empty stops a finished document (MissingAnswer). `card`: the rows
     * on a card of their own (the serial numbers), kept to one page.
     */
    rows(items: Row[], opt: { card?: boolean } = {}) {
      const lay = (inset: number) => {
        const RX = X + inset;
        const RW = W - 2 * inset;
        const spec = items.every((r) => !/[?\n]/.test(r.label) && lines(r.label, 7.8, RW * 0.36 - 14, 'mono').length <= 2);
        const split = spec ? 0.36 : 0.58;
        const lw = RW * split - 14;
        const vx = RX + RW * split;
        const vw = RW * (1 - split);
        const laid = items.map((r) => {
          const empty = r.value === null || r.value === undefined || String(r.value).trim() === '';
          if (empty && r.must && !o.draft) throw new MissingAnswer(r.label);
          if (r.strong && !empty) return { r, empty, strong: true as const, ll: [], nl: [], vl: [], lh: 0, h: 36 };
          const ll = spec ? lines(r.label, 7.8, lw, 'mono') : lines(r.label, 9, lw);
          const lh = spec ? 9.8 : 11.5;
          const nl = r.note ? lines(r.note, 7.5, lw) : [];
          const vl = empty ? ['Not answered'] : lines(String(r.value), 9, vw, 'bold');
          const h = Math.max(ll.length * lh + (spec ? 2.5 : 0) + nl.length * 9.5, vl.length * 11.5) + 9;
          return { r, empty, strong: false as const, ll, nl, vl, lh, h };
        });
        return { RX, RW, spec, vx, laid, total: laid.reduce((a, l) => a + l.h, 0) };
      };
      let L = lay(opt.card ? 12 : 0);
      // A card is drawn before what's on it, so it has to fit on one page; a list too long for one runs as plain rows.
      const card = !!opt.card && L.total + 8 <= pageRoom();
      if (opt.card && !card) L = lay(0);
      const { RX, RW, spec, vx, laid } = L;
      if (card) {
        need(L.total + 8);
        pk.card(page, X, y, W, L.total + 6);
        y -= 2;
      }
      laid.forEach((l, i) => {
        const last = i === laid.length - 1;
        if (l.strong) {
          // The figure the document is for, on an ink bar: the words in Ezra in cream, the figure in gold (on a print, both in ink).
          need(36);
          y -= 3;
          const c = pk.figure(page, RX, y, RW, 30);
          text(l.r.label, RX + 11, y - 19.2, 11.5, { style: 'display', color: c.words });
          // The figure in the answers' column, or at the bar's right end when the words reach past it.
          const fig = String(l.r.value);
          const fx = RX + 11 + width(l.r.label, 11.5, 'display') + 16 <= vx ? vx : RX + RW - 11 - width(fig, 14, 'display');
          text(fig, fx, y - 20, 14, { style: 'display', color: c.figure });
          y -= 33;
          return;
        }
        need(l.h);
        l.ll.forEach((s, n) => (spec ? text(s, RX, y - 12 - n * l.lh, 7.8, { style: 'mono', color: LABEL }) : text(s, RX, y - 12 - n * l.lh, 9)));
        l.nl.forEach((s, n) => text(s, RX, y - 12 - l.ll.length * l.lh - (spec ? 2.5 : 0) - n * 9.5, 7.5, { color: MUTED }));
        l.vl.forEach((s, n) => text(s, vx, y - 12 - n * 11.5, 9, l.empty ? { italic: true, color: o.draft ? RED : MUTED } : { bold: true }));
        y -= l.h;
        if (!(card && last)) hairline(y + 2, LINE, 0.5, RX, RX + RW);
      });
      y -= card ? 18 : 5;
    },
    /** Checklist rows: the form's number in mono, the wording, and a drawn tick, cross or N/A (never a font glyph). */
    checklist(items: CheckItem[]) {
      const bx = X + W - 44;
      for (const it of items) {
        if (!it.mark && it.must && !o.draft) throw new MissingAnswer(it.label);
        const { n, rest } = numbered(it.label);
        const tx = n ? X + NUM_W : X;
        const lw = bx - 16 - tx;
        const ll = lines(rest, 9, lw);
        const nl = it.note ? lines(it.note, 7.5, lw) : [];
        const h = Math.max(ll.length * 11.5 + nl.length * 9.5, 16) + 9;
        need(h);
        if (n) text(n, X, y - 12, 7.6, { style: 'mono', color: LABEL });
        ll.forEach((l, i) => text(l, tx, y - 12 - i * 11.5, 9));
        nl.forEach((l, i) => text(l, tx, y - 12 - ll.length * 11.5 - i * 9.5, 7.5, { color: MUTED }));
        const by = y - 16.5;
        if (it.mark === 'na') text('N/A', bx + 18, by + 3.5, 7.4, { style: 'monoBold', color: LABEL });
        else if (it.mark) box(bx, by, it.mark);
        else text('Not answered', bx - 60, by + 4, 7.5, { italic: true, color: o.draft ? RED : MUTED });
        y -= h;
        hairline(y + 2, LINE, 0.5);
      }
      y -= 6;
    },
    /**
     * Test and inspection rows as the owner's forms lay them out (F74, F75): a bold title, the
     * wording (italic where the form has it), sub-lines, guidance in italics, and on the right the
     * result in words (Pass, N/A) or a drawn tick or cross.
     */
    results(items: ResultItem[]) {
      for (const raw of items) {
        // N/A prints as words on the right, like Pass and Fail.
        const it = raw.mark === 'na' ? { ...raw, mark: null, value: 'N/A' } : raw;
        const empty = !it.mark && (it.value === null || it.value === undefined || String(it.value).trim() === '');
        if (empty && it.must && !o.draft) throw new MissingAnswer(it.title || it.label);
        const { n, rest } = it.title ? { n: null, rest: it.label } : numbered(it.label ?? '');
        const tx = n ? X + NUM_W : X;
        const lw = X + W - 84 - tx;
        const tl = it.title ? lines(it.title, 9, lw, 'bold') : [];
        const ll = rest ? lines(rest, 9, lw) : [];
        const sl = (it.lines ?? []).flatMap((l) => lines(`•  ${l}`, 8.5, lw - 10));
        const gl = it.guidance ? lines(it.guidance, 8, lw) : [];
        const nl = it.note ? lines(it.note, 7.5, lw) : [];
        const h = Math.max(tl.length * 11.5 + ll.length * 11.5 + sl.length * 10.5 + (gl.length ? gl.length * 10 + 3 : 0) + nl.length * 9.5, 16) + 10;
        need(h);
        if (n) text(n, X, y - 12, 7.6, { style: 'mono', color: LABEL });
        let ty = y - 12;
        for (const l of tl) {
          text(l, tx, ty, 9, { bold: true });
          ty -= 11.5;
        }
        for (const l of ll) {
          text(l, tx, ty, 9, { italic: it.italic });
          ty -= 11.5;
        }
        for (const l of sl) {
          text(l, tx + 10, ty, 8.5, { italic: it.italic });
          ty -= 10.5;
        }
        if (gl.length) ty -= 3;
        for (const l of gl) {
          text(l, tx, ty, 8, { italic: true, color: MUTED });
          ty -= 10;
        }
        for (const l of nl) {
          text(l, tx, ty, 7.5, { color: MUTED });
          ty -= 9.5;
        }
        const bx = X + W - 44;
        const by = y - 16.5;
        // (an 'empty' mark is the box alone)
        if (it.mark) box(bx, by, it.mark);
        else if (empty) text('Not answered', X + W - 70, by + 4, 7.5, { italic: true, color: o.draft ? RED : MUTED });
        else right(String(it.value), X + W, by + 4, 9, { bold: true, color: it.value === 'Fail' ? RED : INK });
        y -= h;
        hairline(y + 2, LINE, 0.5);
      }
      y -= 6;
    },
    /**
     * A table on card, mono headings on a paper band, hairline rules and columns; the headings repeat
     * on each new page. Widths are shares of the page (even by default). Rows whose first cell is ''
     * continue the group above (F43's "Array Isolator": Rating (A), Rating (V)…), and a group is kept
     * on one page when it fits on one.
     */
    grid(t: { columns: string[]; rows: (string | null)[][]; widths?: number[] }) {
      const shares = t.widths ?? t.columns.map(() => 1);
      const sum = shares.reduce((a, b) => a + b, 0);
      const ws = shares.map((s) => (s / sum) * W);
      const xs = ws.map((_, i) => X + ws.slice(0, i).reduce((a, b) => a + b, 0));
      const cols = (y0: number, y1: number) => {
        vline(X, y0, y1, LINE, 0.6);
        vline(X + W, y0, y1, LINE, 0.6);
        xs.slice(1).forEach((x) => vline(x, y0, y1, LINE, 0.4));
      };
      const head = () => {
        const hl = t.columns.map((c, i) => lines(c.toUpperCase(), 6.4, ws[i] - 10, 'monoBold', TRACK));
        const h = Math.max(...hl.map((l) => l.length)) * 8.6 + 10;
        if (look.head) page.drawRectangle({ x: X, y: y - h, width: W, height: h, color: look.head });
        hairline(y, INK, 0.8);
        hl.forEach((l, i) => l.forEach((s, n) => text(s, xs[i] + 5, y - 11.6 - n * 8.6, 6.4, { style: 'monoBold', color: LABEL, track: TRACK })));
        cols(y, y - h);
        y -= h;
        hairline(y, LINE, 0.6);
      };
      need(44);
      head();
      const cells = t.rows.map((row) => row.map((c, i) => lines(c ?? '–', 8.5, ws[i] - 10)));
      const heights = cells.map((cl) => Math.max(...cl.map((l) => l.length)) * 10.5 + 7.5);
      for (const [r, row] of t.rows.entries()) {
        const cl = cells[r];
        const h = heights[r];
        if (row[0] !== '') {
          let group = h;
          for (let k = r + 1; k < t.rows.length && t.rows[k][0] === ''; k++) group += heights[k];
          if (group <= 240) need(group, head);
        }
        need(h, head);
        if (look.cell) page.drawRectangle({ x: X, y: y - h, width: W, height: h, color: look.cell });
        cl.forEach((l, i) => l.forEach((s, n) => text(s, xs[i] + 5, y - 10.5 - n * 10.5, 8.5)));
        cols(y, y - h);
        y -= h;
        hairline(y, LINE, 0.5);
      }
      y -= 10;
    },
    /**
     * Numbered paragraphs (a PO's terms, "1. This purchase order…"): the number in mono in its own
     * column, the words beside it, a little apart.
     */
    list(items: string[]) {
      const sz = 8.8;
      const lh = 11.6;
      for (const s of items) {
        const { n, rest } = numbered(s);
        const tx = n ? X + NUM_W : X;
        const ls = lines(rest, sz, X + W - tx);
        // At least two lines of an item together (all of a short one).
        need(Math.min(ls.length, 2) * lh + 2);
        if (n) text(n, X, y - 10, 7.6, { style: 'mono', color: LABEL });
        for (const l of ls) {
          need(lh);
          text(l, tx, y - 10, sz);
          y -= lh;
        }
        y -= 4;
      }
      y -= 4;
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
    /** How tall the first row of photo cards is (a heading's `keep`): for these photos, or for n of them with one-line captions. */
    photoKeep(items: Pick<PhotoItem, 'caption' | 'sub'>[] | number, opt: { perRow?: number } = {}) {
      const list = typeof items === 'number' ? Array.from({ length: items }, () => ({ caption: 'Photo', sub: 'Taken' })) : items;
      return (photoLayout(list, opt.perRow).rows[0]?.h ?? 0) + 6;
    },
    /**
     * Photos in cards on a grid, 2 to a row (or `perRow`: 3 for a slot's one or two): each card
     * the photo cropped to 4:3 (a PNG scan or barcode shown whole on white instead), the caption in
     * bold and the time in mono under it, inside the card. A row of cards is never split by a page.
     */
    async photos(items: PhotoItem[], opt: { perRow?: number } = {}) {
      const L = photoLayout(items, opt.perRow);
      y -= 2;
      for (const [r, row] of L.rows.entries()) {
        need(row.h + 2);
        for (const [j, cap] of row.items.entries()) {
          const p = items[r * L.per + j];
          const cx = X + j * (L.cw + L.gap);
          pk.card(page, cx, y, L.cw, row.h);
          const fx = cx + CARD_PAD;
          const fy = y - CARD_PAD - L.ih;
          const img = await (p.mime === 'image/png' ? doc.embedPng(p.bytes) : p.mime === 'image/jpeg' || p.mime === 'image/jpg' ? doc.embedJpg(p.bytes) : Promise.reject(new Error('type'))).catch(() => null);
          if (!img) {
            page.drawRectangle({ x: fx, y: fy, width: L.iw, height: L.ih, ...(look.head ? { color: look.head } : { borderColor: LINE, borderWidth: 0.5 }) });
            text('This photo can’t be shown here', fx + 8, fy + L.ih / 2 - 3, 7.5, { color: MUTED });
          } else if ((p.fit ?? (p.mime === 'image/png' ? 'contain' : 'cover')) === 'contain') {
            page.drawRectangle({ x: fx, y: fy, width: L.iw, height: L.ih, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.5 });
            const s = Math.min((L.iw - 12) / img.width, (L.ih - 12) / img.height);
            page.drawImage(img, { x: fx + (L.iw - img.width * s) / 2, y: fy + (L.ih - img.height * s) / 2, width: img.width * s, height: img.height * s });
          } else {
            // Cover: scaled to fill the frame, centred, the overhang clipped (never stretched).
            const s = Math.max(L.iw / img.width, L.ih / img.height);
            const dw = img.width * s;
            const dh = img.height * s;
            page.pushOperators(pushGraphicsState(), rectangle(fx, fy, L.iw, L.ih), clip(), endPath());
            page.drawImage(img, { x: fx + (L.iw - dw) / 2, y: fy + (L.ih - dh) / 2, width: dw, height: dh });
            page.pushOperators(popGraphicsState());
          }
          let ty = fy - 11;
          for (const l of cap.c) {
            text(l, fx, ty, 8, { bold: true });
            ty -= 10;
          }
          ty += 10 - 9.2;
          for (const l of cap.s) {
            text(l, fx, ty, 6.4, { style: 'mono', color: MUTED });
            ty -= 8.4;
          }
        }
        y -= row.h + L.gap;
      }
      y -= 4;
    },
    /** Signatures on a baseline, two to a row, with the name and "Signed on the Heliaxis app, 3 Nov 2026 17:41". */
    async signatures(items: SignatureItem[]) {
      const colW = (W - 30) / 2;
      y -= 8;
      for (let i = 0; i < items.length; i += 2) {
        // What a signature takes: its label, the signature, the line, the name and when (88 pt), and a little under it.
        need(94);
        for (const [j, s] of items.slice(i, i + 2).entries()) {
          const sx = X + j * (colW + 30);
          label7(s.title, sx, y - 8, 6.6, LABEL, true);
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
    /** The banner on every page (the reversed wordmark, the legal line, "F43 · Rev 2 · Page x of y"), then the bytes. */
    async save(): Promise<Uint8Array> {
      const pages = doc.getPages();
      const ref = o.footer?.ref ?? `${label}${o.revision ? ` · ${o.revision}` : ''}`;
      const tag = (i: number) => `${ref} · Page ${i + 1} of ${pages.length}`;
      const tagRoom = Math.max(...pages.map((_, i) => width(tag(i), 6.8, 'monoBold')));
      const legal = o.footer?.lines?.join(' · ');
      pages.forEach((p, i) =>
        pk.banner(p, { tag: tag(i), tagRoom, legal, margins: { l: M.l, r: M.r }, h: bannerH, spine: !form, label: o.footer?.label, sub: o.footer?.sub, oneLine: form })
      );
      return doc.save();
    },
  };
}

/** A generated document's file name, starting with the job ref: "HX-0042 F43 PV array test report v2.pdf". */
export const docFileName = (jobRef: string | null, label: string, title: string, version = 1) =>
  `${[jobRef, label, title].filter(Boolean).join(' ')}${version > 1 ? ` v${version}` : ''}.pdf`.replace(/[\\/:*?"<>|]+/g, '-');
