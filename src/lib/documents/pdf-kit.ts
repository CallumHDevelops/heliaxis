import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { rgb, type PDFFont } from 'pdf-lib';

/**
 * What Heliaxis's generated PDFs share (pdf-lib): the page size, the colours, text Helvetica can
 * draw, wrapping, UK dates and the logo. Purchase orders (src/lib/purchase-orders/pdf.ts) use these;
 * the site paperwork builds on them.
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
