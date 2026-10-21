import 'server-only';
import type { PDFImage } from 'pdf-lib';
import { INK, LINE, MissingAnswer, MUTED, PAPER, RED, stampWords, type Kit, type Mark } from '../pdf-kit';

/**
 * Drawing pieces the BS 7671 certificates share (the EIC, the Minor Works sheet): rows of bordered
 * boxes, each a label over its value, as the model forms are laid out; tick-box choices; a signature
 * line (signature, date, name in capitals, role); and a schedule table with grouped headings and the
 * form's column numbers, repeated on every page it runs onto. Ticks and crosses are strokes, never a
 * font's glyph (SPEC D6).
 */

export type Cell = {
  label: string;
  value?: string | null;
  /** A drawn tick, cross or N/A instead of a value. */
  mark?: Mark;
  /** A share of the row (1 by default). */
  w?: number;
  /** A finished certificate can't print with this empty (MissingAnswer). */
  must?: boolean;
};

const empty = (s: string | null | undefined) => s === null || s === undefined || String(s).trim() === '';

/** What a kit block draws with. */
export type Drawing = Parameters<Parameters<Kit['block']>[1]>[0];

/** A stroked tick (or cross, or N/A) of size s with its bottom left at (x, y). No box. */
export function strokeMark(d: Drawing, x: number, y: number, m: Mark, s = 9) {
  if (m === 'tick') {
    d.line(x + s * 0.1, y + s * 0.5, x + s * 0.38, y + s * 0.15, { color: INK, t: 1.3 });
    d.line(x + s * 0.38, y + s * 0.15, x + s * 0.95, y + s * 0.95, { color: INK, t: 1.3 });
  } else if (m === 'cross') {
    d.line(x + s * 0.15, y + s * 0.15, x + s * 0.85, y + s * 0.85, { color: RED, t: 1.3 });
    d.line(x + s * 0.15, y + s * 0.85, x + s * 0.85, y + s * 0.15, { color: RED, t: 1.3 });
  } else if (m === 'na') d.text('N/A', x, y + 1, 7.5, { bold: true, color: MUTED });
}

/** One row of bordered boxes: a small label over a bold value (or a drawn mark). */
export function cells(kit: Kit, row: Cell[], draft: boolean) {
  for (const c of row) if (c.must && !draft && !c.mark && empty(c.value)) throw new MissingAnswer(c.label);
  const shares = row.map((c) => c.w ?? 1);
  const sum = shares.reduce((a, b) => a + b, 0);
  const W = kit.width;
  const ws = shares.map((s) => (s / sum) * W);
  // Labels keep their case: Ipf, Ze, IΔn and mm² mean what they say.
  const laid = row.map((c, i) => ({
    l: kit.lines(c.label, 6.6, ws[i] - 8, true),
    v: c.mark ? ['✓'] : kit.lines(empty(c.value) ? (c.must && draft ? 'Not answered' : '–') : String(c.value), 8.8, ws[i] - 8, true),
  }));
  const labelLines = Math.max(...laid.map((x) => x.l.length));
  const valueLines = Math.max(...laid.map((x) => x.v.length));
  // The values line up across the row, under the deepest label.
  const first = 8.5 + (labelLines - 1) * 7.8 + 13;
  const h = first + (valueLines - 1) * 10.6 + 6;
  kit.block(h, (d) => {
    let x = d.x;
    row.forEach((c, i) => {
      const w = ws[i];
      d.rect(x, d.top - h, w, h, { border: LINE, line: 0.6 });
      laid[i].l.forEach((s, n) => d.text(s, x + 4, d.top - 8.5 - n * 7.8, 6.6, { bold: true, color: MUTED }));
      const vy = d.top - first;
      if (c.mark) strokeMark(d, x + 4, vy - 1, c.mark);
      else {
        const missing = empty(c.value);
        laid[i].v.forEach((s, n) => d.text(s, x + 4, vy - n * 10.6, 8.8, missing ? { italic: true, color: c.must && draft ? RED : MUTED } : { bold: true }));
      }
      x += w;
    });
  });
}

/** A heading strip for a form section ("F. Supply characteristics and earthing arrangements"). */
export function band(kit: Kit, title: string, note?: string | null) {
  kit.block(note ? 30 : 20, (d) => {
    d.rect(d.x, d.top - 17, d.width, 17, { fill: PAPER });
    d.text(title.toUpperCase(), d.x + 6, d.top - 12, 8.2, { bold: true });
    if (note) d.lines(note, 7.2, d.width - 8).slice(0, 1).forEach((s) => d.text(s, d.x + 6, d.top - 26, 7.2, { color: MUTED }));
  }, undefined);
  kit.gap(3);
}

/** Choices as the model form shows them: every option with a box, the chosen one ticked. */
export function choices(kit: Kit, title: string, options: { label: string; on: boolean }[], perRow = 3) {
  const W = kit.width;
  const colW = W / perRow;
  const rows = Math.ceil(options.length / perRow);
  const h = 14 + rows * 15 + 4;
  kit.block(h, (d) => {
    d.rect(d.x, d.top - h, W, h, { border: LINE, line: 0.6 });
    d.text(title, d.x + 4, d.top - 9, 6.6, { bold: true, color: MUTED });
    options.forEach((o, i) => {
      const cx = d.x + 6 + (i % perRow) * colW;
      const cy = d.top - 14 - Math.floor(i / perRow) * 15 - 11;
      d.rect(cx, cy, 9, 9, { border: INK, line: 0.7 });
      if (o.on) strokeMark(d, cx, cy, 'tick');
      d.text(o.label, cx + 14, cy + 1.5, 8.4, o.on ? { bold: true } : { color: MUTED });
    });
  });
}

/** A signature line: the signature (or "Not signed yet"), the date, the name in capitals, and who signed as what. */
export function signatureRow(kit: Kit, role: string, img: PDFImage | null, at: string | null, name: string | null, draft: boolean) {
  if (!draft && (!img || !name)) throw new MissingAnswer(`${role}: signature`);
  const h = 46;
  kit.block(h, (d) => {
    const W = d.width;
    const cols = [0.38, 0.2, 0.28, 0.14].map((f) => f * W);
    let x = d.x;
    const heads = ['Signature', 'Date', 'Name (capitals)', ''];
    cols.forEach((w, i) => {
      d.rect(x, d.top - h, w, h, { border: LINE, line: 0.6 });
      if (heads[i]) d.text(heads[i], x + 4, d.top - 8.5, 6.6, { bold: true, color: MUTED });
      x += w;
    });
    x = d.x;
    if (img) d.image(img, x + 6, d.top - h + 5, cols[0] - 12, h - 17);
    else d.text('Not signed yet', x + 6, d.top - 30, 8.8, { italic: true, color: draft ? RED : MUTED });
    x += cols[0];
    d.text(at ? stampWords(at).replace(/ \d\d:\d\d$/, '') : '–', x + 4, d.top - 24, 8.8, { bold: true });
    if (at) d.lines(`Signed on the Heliaxis app at ${stampWords(at).slice(-5)}`, 6.2, cols[1] - 8).slice(0, 2).forEach((s, n) => d.text(s, x + 4, d.top - 34 - n * 7.4, 6.2, { color: MUTED }));
    x += cols[1];
    d.lines(name ? name.toUpperCase() : '–', 8.8, cols[2] - 8, true).slice(0, 2).forEach((s, n) => d.text(s, x + 4, d.top - 26 - n * 10, 8.8, { bold: true }));
    x += cols[2];
    d.lines(role, 7.6, cols[3] - 8, true).forEach((s, n) => d.text(s, x + 4, d.top - 22 - n * 9, 7.6, { bold: true }));
  });
  kit.gap(6);
}

/* ── Schedules ──────────────────────────────────────────────────────────────── */

export type ColCell = string | null | { mark: Mark };
export type Col = { n: number; head: string; share: number };
export type Group = { from: number; to: number; label: string };

/**
 * A schedule: a row of group headings, the column headings, the column numbers (as the model form
 * has them), then one row per circuit. The three heading rows repeat on every page it runs onto.
 */
export function schedule(kit: Kit, cols: Col[], groups: Group[], rows: ColCell[][]) {
  const W = kit.width;
  const sum = cols.reduce((a, c) => a + c.share, 0);
  const ws = cols.map((c) => (c.share / sum) * W);
  const xs = ws.map((_, i) => ws.slice(0, i).reduce((a, b) => a + b, 0));
  const headH = 12 + Math.max(...cols.map((c, i) => kit.lines(c.head, 6.1, ws[i] - 4, true).length)) * 7.2 + 6 + 11;
  const head = () =>
    kit.block(headH, (d) => {
      const top = d.top;
      d.rect(d.x, top - headH, W, headH, { fill: PAPER });
      // Group headings over the columns they span.
      for (const g of groups) {
        const a = cols.findIndex((c) => c.n === g.from);
        const b = cols.findIndex((c) => c.n === g.to);
        if (a < 0 || b < 0) continue;
        const gx = d.x + xs[a];
        const gw = xs[b] + ws[b] - xs[a];
        d.lines(g.label.toUpperCase(), 6, gw - 4, true).slice(0, 1).forEach((s) => d.text(s, gx + (gw - d.widthOf(s, 6, true)) / 2, top - 8.5, 6, { bold: true, color: MUTED }));
        d.line(gx + 2, top - 11, gx + gw - 2, top - 11, { color: MUTED, t: 0.4 });
      }
      cols.forEach((c, i) => {
        const x = d.x + xs[i];
        d.lines(c.head, 6.1, ws[i] - 4, true).forEach((s, n) => d.text(s, x + 2, top - 19 - n * 7.2, 6.1, { bold: true }));
        const num = String(c.n);
        d.text(num, x + (ws[i] - d.widthOf(num, 6.5, true)) / 2, top - headH + 3.5, 6.5, { bold: true, color: MUTED });
        // Column rules stop under the group headings, so a group's label reads across its columns.
        if (i > 0) d.line(x, top - 12, x, top - headH, { color: LINE, t: 0.4 });
      });
      d.line(d.x, top - headH + 11, d.x + W, top - headH + 11, { color: LINE, t: 0.5 });
    });
  head();
  for (const row of rows) {
    const h = Math.max(16, ...row.map((v, i) => (v && typeof v === 'object' ? 1 : kit.lines(v ?? '–', 7.4, ws[i] - 5).length) * 8.8 + 6));
    kit.block(
      h,
      (d) => {
        row.forEach((v, i) => {
          const x = d.x + xs[i];
          if (i > 0) d.line(x, d.top, x, d.top - h, { color: LINE, t: 0.4 });
          if (v && typeof v === 'object') strokeMark(d, x + Math.max(2, (ws[i] - 9) / 2), d.top - 13, v.mark, 8);
          else d.lines(v ?? '–', 7.4, ws[i] - 5).forEach((s, n) => d.text(s, x + 2.5, d.top - 9.5 - n * 8.8, 7.4, v ? {} : { color: MUTED }));
        });
        d.line(d.x, d.top - h, d.x + W, d.top - h, { color: LINE, t: 0.5 });
      },
      head
    );
  }
  kit.gap(6);
}
