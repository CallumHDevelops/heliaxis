import 'server-only';
import { rgb, type RGB } from 'pdf-lib';
import { INK, MUTED, RED, type Drawing } from '../pdf-kit';

/**
 * Drawing the IET model form's own look on the PDF kit (the EIC and its schedules): ruled boxes,
 * labels in the form's words with sub- and superscripts (U/U_{0}, I_{Δn}, Z_{s} (Ω)^{§}), the value
 * written in bold over a dotted leader where the form has a dotted blank, tick boxes with the tick
 * drawn as strokes (SPEC D6), and words turned up the page for a schedule's column headings.
 */

export const DOT = rgb(0.45, 0.45, 0.45);
export const RULE = INK;
/** A value the generator was given: printed bold. `missing`: a draft's "Not answered", in red. */
export type Val = { s: string; missing?: boolean } | null;

/* ── Text with sub- and superscripts ─────────────────────────────────────────── */

type Tok = { t: string; k: 'n' | 'sub' | 'sup' };
const MARK = /([_^])\{([^}]*)\}/g;

function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  let at = 0;
  for (const m of s.matchAll(MARK)) {
    if (m.index! > at) out.push({ t: s.slice(at, m.index), k: 'n' });
    out.push({ t: m[2], k: m[1] === '_' ? 'sub' : 'sup' });
    at = m.index! + m[0].length;
  }
  if (at < s.length) out.push({ t: s.slice(at), k: 'n' });
  return out;
}

/** The words without the sub/superscript marks ("U/U0 (1)"). */
export const plain = (s: string) => s.replace(MARK, '$2');

const SMALL = 0.62;
export function richWidth(d: Pick<Drawing, 'widthOf'>, s: string, size: number, bold = false): number {
  return tokens(s).reduce((w, t) => w + d.widthOf(t.t, t.k === 'n' ? size : size * SMALL, bold), 0);
}

export type RichOpt = { bold?: boolean; color?: RGB; rotate?: 90; italic?: boolean };

/** Draw marked-up text from (x, y) (its baseline); returns its width. Turned 90°, it runs up the page from (x, y). */
export function rich(d: Drawing, s: string, x: number, y: number, size: number, opt: RichOpt = {}): number {
  let along = 0;
  for (const t of tokens(s)) {
    const sz = t.k === 'n' ? size : size * SMALL;
    const off = t.k === 'sub' ? -size * 0.2 : t.k === 'sup' ? size * 0.38 : 0;
    if (opt.rotate) d.text(t.t, x - off, y + along, sz, { bold: opt.bold, color: opt.color, rotate: 90 });
    else d.text(t.t, x + along, y + off, sz, { bold: opt.bold, color: opt.color, italic: opt.italic });
    along += d.widthOf(t.t, sz, opt.bold);
  }
  return along;
}

/** Centred in a span (horizontal). */
export function richCentre(d: Drawing, s: string, x: number, w: number, y: number, size: number, opt: RichOpt = {}) {
  rich(d, s, x + (w - richWidth(d, s, size, opt.bold)) / 2, y, size, opt);
}

/* ── Rules, dots and boxes ───────────────────────────────────────────────────── */

/** A ruled box: x, its top (PDF y) and its size. */
export function frame(d: Drawing, x: number, top: number, w: number, h: number, t = 0.7) {
  d.rect(x, top - h, w, h, { border: RULE, line: t });
}
export function hline(d: Drawing, x1: number, x2: number, y: number, t = 0.6) {
  d.line(x1, y, x2, y, { color: RULE, t });
}
export function vline(d: Drawing, x: number, y1: number, y2: number, t = 0.6) {
  d.line(x, y1, x, y2, { color: RULE, t });
}
/** The form's dotted blank, just under a baseline. */
export function dots(d: Drawing, x1: number, x2: number, y: number) {
  if (x2 - x1 < 3) return;
  d.line(x1, y - 1.2, x2, y - 1.2, { color: DOT, t: 0.75, dash: [0.01, 2.1], round: true });
}
/** A line through words the form says to delete as appropriate. */
export function strike(d: Drawing, x: number, y: number, w: number, size: number) {
  d.line(x - 0.5, y + size * 0.32, x + w + 0.5, y + size * 0.32, { color: INK, t: 0.8 });
}

/** A tick box with its bottom left at (x, y); the tick drawn as two strokes. */
export function tickBox(d: Drawing, x: number, y: number, on: boolean, s = 8.5) {
  d.rect(x, y, s, s, { border: RULE, line: 0.6 });
  if (on) tickMark(d, x, y, s);
}
export function tickMark(d: Drawing, x: number, y: number, s = 8.5) {
  d.line(x + s * 0.17, y + s * 0.5, x + s * 0.41, y + s * 0.2, { color: INK, t: 1.15 });
  d.line(x + s * 0.41, y + s * 0.2, x + s * 0.88, y + s * 0.9, { color: INK, t: 1.15 });
}
/** A drawn cross (a failed test button: the gate stops these, but a draft can show one). */
export function crossMark(d: Drawing, x: number, y: number, s = 8.5) {
  d.line(x + s * 0.2, y + s * 0.2, x + s * 0.8, y + s * 0.8, { color: RED, t: 1.15 });
  d.line(x + s * 0.2, y + s * 0.8, x + s * 0.8, y + s * 0.2, { color: RED, t: 1.15 });
}

/* ── Values ──────────────────────────────────────────────────────────────────── */

/**
 * A value in a span (x to end, baseline y): bold, made smaller to fit (down to `min`), and cut with
 * "…" if it still doesn't. Returns false when it was cut.
 */
export function value(d: Drawing, v: Val, x: number, end: number, y: number, size = 8, min = 5.6): boolean {
  if (!v) return true;
  const room = Math.max(4, end - x);
  if (v.missing) {
    d.text(fitText(d, v.s, size - 0.6, room, false), x, y, size - 0.6, { color: RED, italic: true });
    return true;
  }
  let sz = size;
  while (sz > min && d.widthOf(v.s, sz, true) > room) sz -= 0.2;
  const s = fitText(d, v.s, sz, room, true);
  d.text(s, x, y, sz, { bold: true });
  return s === v.s;
}
/** Text cut to a width with "…". */
export function fitText(d: Pick<Drawing, 'widthOf'>, s: string, size: number, room: number, bold: boolean): string {
  if (d.widthOf(s, size, bold) <= room) return s;
  let n = s.length;
  while (n > 1 && d.widthOf(`${s.slice(0, n)}…`, size, bold) > room) n--;
  return `${s.slice(0, n).trimEnd()}…`;
}

/** A written name as it fits its blank: its lines (one, or two) and their size. */
export type Fitted = { lines: string[]; size: number };

/**
 * How a name (a signatory's, a firm's) fits a blank `room` wide, never cut: on one line, made smaller
 * down to `oneMin`; else, where the form has room under the dotted line (`two`), over two lines broken
 * at a space or after a hyphen, no bigger than `twoMax`; else on one line down to `min`; else null,
 * and it goes on a continuation sheet.
 */
export function fitName(m: Pick<Drawing, 'widthOf'>, s: string, room: number, o: { size?: number; oneMin?: number; min?: number; two?: boolean; twoMax?: number } = {}): Fitted | null {
  const size = o.size ?? 8;
  const min = o.min ?? 5.6;
  const oneMin = Math.max(min, o.oneMin ?? min);
  const w = (t: string, sz: number) => m.widthOf(t, sz, true);
  // Sizes from the largest down in 0.2 pt steps (worked in tenths so they stay tidy).
  const sizes = (from: number, to: number) => {
    const out: number[] = [];
    for (let t = Math.round(from * 10); t >= Math.round(to * 10) - 1e-9; t -= 2) out.push(t / 10);
    return out;
  };
  const one = sizes(size, oneMin).find((sz) => w(s, sz) <= room);
  if (one !== undefined) return { lines: [s], size: one };
  // Smaller still on one line, or over two lines: whichever is written the bigger.
  const small = sizes(oneMin - 0.2, min).find((sz) => w(s, sz) <= room);
  let two: Fitted | null = null;
  if (o.two) {
    // Where it can break: at a space (dropped) or after a hyphen (kept); the break that evens the lines out.
    const splits: [string, string][] = [];
    for (let i = 1; i < s.length - 1; i++) {
      if (s[i] === ' ') splits.push([s.slice(0, i).trimEnd(), s.slice(i + 1).trimStart()]);
      else if (s[i] === '-') splits.push([s.slice(0, i + 1), s.slice(i + 1)]);
    }
    const longer = ([a, b]: [string, string]) => Math.max(w(a, 1), w(b, 1));
    const best = splits.filter(([a, b]) => a && b).sort((x, y) => longer(x) - longer(y))[0];
    const sz = best ? sizes(Math.min(size, o.twoMax ?? size), min).find((z) => w(best[0], z) <= room && w(best[1], z) <= room) : undefined;
    if (best && sz !== undefined) two = { lines: best, size: sz };
  }
  if (two && (small === undefined || two.size >= small)) return two;
  return small !== undefined ? { lines: [s], size: small } : null;
}

/**
 * The form's "Label ........ unit" with the value written in the blank: the label (marked up), a
 * dotted leader to the unit (or to `end`), the value bold over the leader just after the label.
 */
export function blank(d: Drawing, o: { x: number; y: number; end: number; label: string; v: Val; unit?: string; size?: number; vsize?: number; labelBold?: boolean; gap?: number }) {
  const size = o.size ?? 7.8;
  const lw = o.label ? rich(d, o.label, o.x, o.y, size, { bold: o.labelBold }) : 0;
  const unitW = o.unit ? richWidth(d, o.unit, size) : 0;
  const ux = o.end - unitW;
  const from = o.x + lw + (o.label ? (o.gap ?? 2) : 0);
  const to = o.unit ? ux - 1.5 : o.end;
  dots(d, from, to, o.y);
  // Label, value, unit: the order the words are read in (and copied out of the PDF).
  const whole = value(d, o.v, from + 1.5, to - 1, o.y + 0.6, o.vsize ?? size + 0.2);
  if (o.unit) rich(d, o.unit, ux, o.y, size);
  return whole;
}

/** Lines of a long value, wrapped to a width in the value's bold face. */
export const valueLines = (d: Drawing, s: string, size: number, w: number) => d.lines(s, size, w, true);

/** A date as the form wants it written: 03/11/2026. */
export function formDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')}`;
}

export { INK, MUTED, RED };
