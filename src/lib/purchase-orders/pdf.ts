import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';
import { formatPence, formatQty, lineNet, totals } from './money';
import { addressLine, type PoLine, type PurchaseOrder, type Supplier } from './shared';

/**
 * The purchase order as a branded A4 PDF (pdf-lib, the library the subcontractor documents use):
 * the Heliaxis logo, the order's number, date and our job reference, the supplier and where it's
 * delivered, the lines with part numbers, net / VAT per rate / total, the notes, "please quote …",
 * and the legal line on every page. Long orders run onto more pages, the table's headings repeated.
 *
 * Helvetica (built into every PDF reader) is used, so text is kept to the characters it has:
 * anything else (an emoji in a note) becomes "?".
 */

export type PoPdfInput = {
  order: PurchaseOrder;
  lines: PoLine[];
  supplier: Pick<Supplier, 'name' | 'contact_name' | 'email' | 'phone' | 'account_number' | 'address'> | null;
  /** Our job reference (HX-0042-2). */
  jobRef: string | null;
  /** The day on the order (YYYY-MM-DD, UK): when it's sent, or today. */
  issued: string;
  /** A changed order going again: the day the one it replaces was sent. */
  replaces?: string | null;
  /** Who's ordering (shown with the contact email). */
  orderedBy?: string | null;
  /** Where questions and replies go (the shared mailbox). */
  contactEmail: string;
};

const A4: [number, number] = [595.28, 841.89];
const M = 42; // page margin
const W = A4[0] - 2 * M;
const FOOT = 64; // room kept for the footer

const INK = rgb(33 / 255, 31 / 255, 24 / 255);
const MUTED = rgb(110 / 255, 106 / 255, 94 / 255);
const AMBER = rgb(199 / 255, 127 / 255, 4 / 255);
const SOLAR = rgb(248 / 255, 188 / 255, 30 / 255);
const PAPER = rgb(247 / 255, 242 / 255, 231 / 255);
const LINE = rgb(0.86, 0.85, 0.82);
const RED = rgb(179 / 255, 38 / 255, 30 / 255);

/* ── Text ────────────────────────────────────────────────────────────────────── */

// What Helvetica can show (WinAnsi): printable ASCII, Latin-1 and the extra punctuation in 0x80–0x9F.
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const showable = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.has(ch);
};
/** Text Helvetica can draw: tabs to spaces, anything it hasn't got to "?". */
export function pdfText(s: string | null | undefined): string {
  return [...String(s ?? '').replace(/\t/g, ' ').replace(/ /g, ' ')].map((ch) => (ch === '\n' || showable(ch) ? ch : '?')).join('');
}

/** Lines no wider than `max`, breaking at spaces (and inside a word too long for a line). Keeps the text's own line breaks. */
function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of pdfText(text).split('\n')) {
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

let logoBytes: Uint8Array | null | undefined;
/** public/assets/heliaxis-logo.png (bundled with the routes: next.config.ts), else the live site's copy, else none. */
async function logo(): Promise<Uint8Array | null> {
  if (logoBytes !== undefined) return logoBytes;
  try {
    logoBytes = new Uint8Array(await readFile(path.join(process.cwd(), 'public', 'assets', 'heliaxis-logo.png')));
  } catch {
    try {
      const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
      const r = await fetch(`${site}/assets/heliaxis-logo.png`, { signal: AbortSignal.timeout(4000) });
      logoBytes = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    } catch {
      logoBytes = null;
    }
  }
  return logoBytes;
}

/* ── The document ────────────────────────────────────────────────────────────── */

type Fonts = { r: PDFFont; b: PDFFont };

/** Column layout of the lines table: left edges and widths, numbers right-aligned. */
const COLS = (() => {
  const no = 18;
  const part = 84;
  const qty = 40;
  const unit = 70;
  const vat = 34;
  const net = 72;
  const desc = W - (no + part + qty + unit + vat + net);
  let x = M;
  const at = (w: number) => {
    const c = { x, w };
    x += w;
    return c;
  };
  return { no: at(no), part: at(part), desc: at(desc), qty: at(qty), unit: at(unit), vat: at(vat), net: at(net) };
})();
const PAD = 4;

export async function purchaseOrderPdf(input: PoPdfInput): Promise<Uint8Array> {
  const { order: o, lines, supplier } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`Purchase order ${o.po_number}`);
  doc.setAuthor(HELIAXIS_PARTY.name);
  doc.setCreator('Heliaxis');
  doc.setProducer('Heliaxis');
  const f: Fonts = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) };
  const logoPng = await logo();
  let image: PDFImage | null = null;
  if (logoPng) image = await doc.embedPng(logoPng).catch(() => null);

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const text = (s: string, x: number, yy: number, size: number, font: PDFFont = f.r, color = INK) => page.drawText(pdfText(s), { x, y: yy, size, font, color });
  const right = (s: string, xRight: number, yy: number, size: number, font: PDFFont = f.r, color = INK) =>
    text(s, xRight - font.widthOfTextAtSize(pdfText(s), size), yy, size, font, color);
  const rule = (yy: number, color = LINE, thickness = 0.6) => page.drawLine({ start: { x: M, y: yy }, end: { x: M + W, y: yy }, thickness, color });

  /* Header: logo and our details on the left, the order's own details on the right. */
  const logoW = 150;
  const logoH = image ? (image.height / image.width) * logoW : 0;
  if (image) page.drawImage(image, { x: M, y: y - logoH, width: logoW, height: logoH });
  else text('HELIAXIS', M, y - 22, 24, f.b);
  let ly = y - (image ? logoH : 26) - 14;
  text(HELIAXIS_PARTY.name, M, ly, 9, f.b);
  ly -= 11;
  for (const l of wrap(HELIAXIS_PARTY.registeredAddress, f.r, 8.5, 230)) {
    text(l, M, ly, 8.5, f.r, MUTED);
    ly -= 10.5;
  }
  text(input.contactEmail, M, ly, 8.5, f.r, MUTED);
  ly -= 10.5;

  const rx = M + W;
  right('PURCHASE ORDER', rx, y - 16, 17, f.b);
  right(o.po_number, rx, y - 36, 15, f.b, AMBER);
  const meta: [string, string][] = [
    ['Date', longDate(input.issued)],
    ['Our job reference', input.jobRef || '-'],
    ['Required by', o.required_by ? dayDate(o.required_by) : 'Not set'],
  ];
  let my = y - 56;
  for (const [k, v] of meta) {
    right(v, rx, my, 9, f.b);
    right(k, rx - f.b.widthOfTextAtSize(pdfText(v), 9) - 8, my, 8.5, f.r, MUTED);
    my -= 12.5;
  }
  if (input.replaces) {
    right(`Revised: this replaces the order sent on ${longDate(input.replaces)}.`, rx, my, 8.5, f.b, AMBER);
    my -= 12.5;
  }
  y = Math.min(ly, my) - 8;
  page.drawRectangle({ x: M, y: y - 2.5, width: W, height: 2.5, color: SOLAR });
  y -= 16;

  if (o.status === 'cancelled') {
    page.drawRectangle({ x: M, y: y - 26, width: W, height: 26, color: rgb(1, 0.95, 0.94), borderColor: RED, borderWidth: 0.8 });
    const when = o.cancelled_at ? ` on ${longDate(o.cancelled_at.slice(0, 10))}` : '';
    text(`CANCELLED${when}. Please don’t supply this order.`, M + 10, y - 17, 10, f.b, RED);
    y -= 46;
  }

  /* Supplier | Deliver to */
  const colW = (W - 24) / 2;
  const block = (x: number, label: string, rows: { s: string; bold?: boolean; muted?: boolean }[]) => {
    let by = y;
    text(label.toUpperCase(), x, by, 7.5, f.b, MUTED);
    by -= 13;
    for (const r of rows) {
      for (const l of wrap(r.s, r.bold ? f.b : f.r, r.bold ? 10 : 9, colW)) {
        text(l, x, by, r.bold ? 10 : 9, r.bold ? f.b : f.r, r.muted ? MUTED : INK);
        by -= r.bold ? 13 : 11.5;
      }
    }
    return by;
  };
  const sup = supplier;
  const supRows = sup
    ? [
        { s: sup.name, bold: true },
        ...(sup.contact_name ? [{ s: `For the attention of ${sup.contact_name}` }] : []),
        ...(sup.address ? [{ s: sup.address }] : []),
        ...(sup.email ? [{ s: sup.email }] : []),
        ...(sup.phone ? [{ s: sup.phone }] : []),
        ...(sup.account_number ? [{ s: `Our account number: ${sup.account_number}`, muted: true }] : []),
      ]
    : [{ s: 'Supplier not found', muted: true }];
  const where =
    o.deliver_to === 'collect'
      ? [{ s: 'Collection', bold: true }, { s: 'We’ll collect it from you. Please let us know when it’s ready.' }]
      : [
          { s: o.deliver_to === 'office' ? 'Our office / warehouse' : 'Site', bold: true },
          ...(o.deliver_address ? [{ s: o.deliver_address }] : []),
          ...(o.deliver_postcode && !(o.deliver_address ?? '').toUpperCase().includes(o.deliver_postcode.toUpperCase()) ? [{ s: o.deliver_postcode }] : []),
        ];
  const contact = [input.orderedBy, input.contactEmail].filter(Boolean).join(', ');
  const whereRows = [...where, ...(contact ? [{ s: `Questions: ${contact}`, muted: true }] : [])];
  y = Math.min(block(M, 'Supplier', supRows), block(M + colW + 24, 'Delivery', whereRows)) - 12;

  /* The lines */
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 18, width: W, height: 18, color: PAPER });
    const ty = y - 12;
    text('#', COLS.no.x + PAD, ty, 7.5, f.b, MUTED);
    text('PART NO.', COLS.part.x + PAD, ty, 7.5, f.b, MUTED);
    text('DESCRIPTION', COLS.desc.x + PAD, ty, 7.5, f.b, MUTED);
    right('QTY', COLS.qty.x + COLS.qty.w - PAD, ty, 7.5, f.b, MUTED);
    right('UNIT EX VAT', COLS.unit.x + COLS.unit.w - PAD, ty, 7.5, f.b, MUTED);
    right('VAT', COLS.vat.x + COLS.vat.w - PAD, ty, 7.5, f.b, MUTED);
    right('NET', COLS.net.x + COLS.net.w - PAD, ty, 7.5, f.b, MUTED);
    y -= 18;
  };
  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - M;
    text(`Purchase order ${o.po_number} (continued)`, M, y - 10, 10, f.b);
    if (input.jobRef) right(`Our job reference ${input.jobRef}`, M + W, y - 10, 9, f.r, MUTED);
    y -= 26;
  };
  /** Room for `h` more on this page, else a new one (with the table's headings again when it's the table). */
  const need = (h: number, inTable = false) => {
    if (y - h >= FOOT) return;
    newPage();
    if (inTable) tableHead();
  };

  tableHead();
  if (!lines.length) {
    text('No lines yet.', COLS.desc.x + PAD, y - 14, 9, f.r, MUTED);
    y -= 22;
  }
  lines.forEach((l, i) => {
    const size = 9;
    const desc = wrap(l.description, f.r, size, COLS.desc.w - 2 * PAD);
    const part = wrap(l.part_number || '', f.r, 8.5, COLS.part.w - 2 * PAD);
    const rowH = Math.max(desc.length, part.length, 1) * 11 + 9;
    need(rowH, true);
    const ty = y - 13;
    text(String(i + 1), COLS.no.x + PAD, ty, 8.5, f.r, MUTED);
    part.forEach((s, k) => text(s, COLS.part.x + PAD, ty - k * 11, 8.5));
    desc.forEach((s, k) => text(s, COLS.desc.x + PAD, ty - k * 11, size));
    right(formatQty(l.qty), COLS.qty.x + COLS.qty.w - PAD, ty, size);
    const priced = l.unit_cost_pence != null;
    right(priced ? formatPence(l.unit_cost_pence!) : 'TBC', COLS.unit.x + COLS.unit.w - PAD, ty, size, f.r, priced ? INK : AMBER);
    right(`${l.vat_rate}%`, COLS.vat.x + COLS.vat.w - PAD, ty, size, f.r, MUTED);
    right(priced ? formatPence(lineNet(l)) : 'TBC', COLS.net.x + COLS.net.w - PAD, ty, size, f.b, priced ? INK : AMBER);
    y -= rowH;
    rule(y);
  });

  /* Totals */
  const t = totals(lines);
  const rows: [string, string, boolean][] = [
    ['Net (ex VAT)', formatPence(t.net), false],
    ...t.vat.map((g): [string, string, boolean] => [`VAT at ${g.rate}% on ${formatPence(g.net)}`, formatPence(g.vat), false]),
  ];
  const boxW = 250;
  const bx = M + W - boxW;
  need(rows.length * 15 + 34 + (t.unpriced ? 14 : 0));
  y -= 8;
  for (const [k, v] of rows) {
    text(k, bx + 8, y - 11, 9, f.r, MUTED);
    right(v, M + W - 8, y - 11, 9.5);
    y -= 15;
  }
  page.drawRectangle({ x: bx, y: y - 22, width: boxW, height: 22, color: SOLAR });
  text('Total (inc VAT)', bx + 8, y - 15, 10.5, f.b);
  right(formatPence(t.gross), M + W - 8, y - 15, 11, f.b);
  y -= 30;
  if (t.unpriced) {
    right(`${t.unpriced} line${t.unpriced === 1 ? '' : 's'} marked TBC: price to be confirmed, not in the totals.`, M + W, y - 4, 8, f.r, AMBER);
    y -= 14;
  }

  /* Notes to the supplier */
  if (o.notes?.trim()) {
    const notes = wrap(o.notes, f.r, 9, W);
    need(Math.min(notes.length, 3) * 12 + 24);
    y -= 8;
    text('NOTES', M, y - 8, 7.5, f.b, MUTED);
    y -= 22;
    for (const l of notes) {
      need(12);
      text(l, M, y, 9);
      y -= 12;
    }
  }

  /* Please quote … */
  need(42);
  y -= 12;
  page.drawRectangle({ x: M, y: y - 28, width: W, height: 28, color: PAPER });
  page.drawRectangle({ x: M, y: y - 28, width: 3, height: 28, color: SOLAR });
  text(`Please quote ${o.po_number} on your delivery note and invoice.`, M + 12, y - 18, 10.5, f.b);
  y -= 28;

  /* Footer on every page: the legal line and the page number. */
  const pages = doc.getPages();
  const legal = [
    `${HELIAXIS_PARTY.name} · Company number ${HELIAXIS_PARTY.companyNumber} · VAT number ${HELIAXIS_PARTY.vatNumber}`,
    `Registered office: ${HELIAXIS_PARTY.registeredAddress}`,
  ];
  pages.forEach((p, i) => {
    page = p;
    p.drawLine({ start: { x: M, y: 46 }, end: { x: M + W, y: 46 }, thickness: 0.6, color: LINE });
    legal.forEach((l, k) => text(l, M, 34 - k * 9.5, 7.5, f.r, MUTED));
    right(`${o.po_number} · Page ${i + 1} of ${pages.length}`, M + W, 34, 7.5, f.r, MUTED);
  });

  return doc.save();
}

/** "PO-0003.pdf". */
export const pdfName = (o: Pick<PurchaseOrder, 'po_number'>) => `${o.po_number.replace(/[^\w-]+/g, '')}.pdf`;

/** The delivery address in one line, for the email. */
export const deliveryWords = (o: Pick<PurchaseOrder, 'deliver_to' | 'deliver_address' | 'deliver_postcode'>) =>
  o.deliver_to === 'collect' ? 'we’ll collect it' : `${o.deliver_to === 'office' ? 'our office' : 'site'}: ${addressLine(o.deliver_address, o.deliver_postcode)}`;
