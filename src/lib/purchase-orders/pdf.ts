import 'server-only';
import { PDFDocument, rgb, type PDFPage, type RGB } from 'pdf-lib';
import { ukDay } from '@/lib/bank-holidays';
import { A4, BANNER_H, dayDate, fillOf, INK, LABEL, LINE, longDate, MARGIN, MUTED, pageKit, RED, SOLAR, TRACK, type MastLine, type TextOpt, type Variant } from '@/lib/documents/pdf-kit';
import { HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';
import { formatPence, formatQty, lineNet, totals } from './money';
import { addressLine, type PoLine, type PurchaseOrder, type Supplier } from './shared';

/**
 * The purchase order as a branded A4 PDF (pdf-lib, the library the subcontractor documents use), in
 * the document kit's style (src/lib/documents/pdf-kit.ts): the ink header band with the order's
 * number, date, our job reference and the day it's needed on the right, our name and address under it,
 * the supplier and where it's delivered on a card, the lines with part numbers in a ruled table, net /
 * VAT per rate, the total on an ink bar, the notes, "please quote …", and the kit's page with its dark
 * banner and the legal line on every page. Long orders run onto more pages (each with the kit's slim
 * strip), the table's headings repeated. The kit's fonts draw any character a note has. `variant`:
 * the kit's 'digital' (the default, what's emailed) or 'print' (the ink saver).
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
  /** 'digital' (the default: what's emailed) or 'print' (the ink saver). */
  variant?: Variant;
};

const X = MARGIN.l;
const W = A4[0] - MARGIN.l - MARGIN.r;
const FOOT = BANNER_H + 16; // room kept for the banner

/* ── The document ────────────────────────────────────────────────────────────── */

/** Column layout of the lines table: left edges and widths, numbers right-aligned. */
const COLS = (() => {
  const no = 18;
  const part = 86;
  const qty = 30;
  const unit = 60;
  const vat = 30;
  const net = 64;
  const desc = W - (no + part + qty + unit + vat + net);
  let x = X;
  const at = (w: number) => {
    const c = { x, w };
    x += w;
    return c;
  };
  return { no: at(no), part: at(part), desc: at(desc), qty: at(qty), unit: at(unit), vat: at(vat), net: at(net) };
})();
const PAD = 5;

export async function purchaseOrderPdf(input: PoPdfInput): Promise<Uint8Array> {
  const { order: o, lines, supplier } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`Purchase order ${o.po_number}`);
  doc.setAuthor(HELIAXIS_PARTY.name);
  doc.setCreator('Heliaxis');
  doc.setProducer('Heliaxis');
  const pk = await pageKit(doc, { variant: input.variant });
  const look = pk.look;

  let page: PDFPage = doc.addPage(A4);
  pk.paint(page);
  let y = A4[1] - MARGIN.t;
  const text = (s: string, x: number, yy: number, size: number, opt: TextOpt = {}) => pk.text(page, s, x, yy, size, opt);
  const right = (s: string, xRight: number, yy: number, size: number, opt: TextOpt = {}) => text(s, xRight - pk.width(s, size, opt.style ?? 'regular', opt.track ?? 0), yy, size, opt);
  const rule = (yy: number, color: RGB = LINE, thickness = 0.5, x0 = X, x1 = X + W) => pk.hair(page, x0, x1, yy, color, thickness);
  const vline = (x: number, y0: number, y1: number, t = 0.4) => page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness: t, color: LINE });

  /* The masthead: the order's own details on the right of the ink band, our name and address under it. */
  const under: MastLine[] = [{ s: HELIAXIS_PARTY.name, bold: true }, { s: HELIAXIS_PARTY.registeredAddress, muted: true }, { s: input.contactEmail, muted: true }];
  const meta: [string, string][] = [
    ['PO number', o.po_number],
    ['Date', longDate(input.issued)],
    ['Our job reference', input.jobRef || '-'],
    ['Required by', o.required_by ? dayDate(o.required_by) : 'Not set'],
  ];
  y = pk.masthead(page, { x: X, w: W, meta, under, eyebrow: `${o.po_number} · ${input.jobRef ? `Project ${input.jobRef}` : 'Heliaxis'}`, title: 'Purchase order' });

  if (input.replaces) {
    page.drawRectangle({ x: X, y: y - 22, width: W, height: 22, ...fillOf(look.cell), borderColor: SOLAR, borderWidth: 1.4 });
    text(`Revised: this replaces the order sent on ${longDate(input.replaces)}.`, X + 10, y - 15, 9.5, { style: 'bold', color: look.flag });
    y -= 32;
  }
  if (o.status === 'cancelled') {
    page.drawRectangle({ x: X, y: y - 26, width: W, height: 26, ...fillOf(look.cell && rgb(1, 0.95, 0.94)), borderColor: RED, borderWidth: 0.8 });
    const when = o.cancelled_at ? ` on ${longDate(ukDay(o.cancelled_at))}` : '';
    text(`CANCELLED${when}. Please don’t supply this order.`, X + 10, y - 17, 10, { style: 'bold', color: RED });
    y -= 36;
  }

  /* Supplier | Delivery, on a card */
  const colW = W / 2;
  type BlockRow = { s: string; bold?: boolean; muted?: boolean };
  const sup = supplier;
  const supRows: BlockRow[] = sup
    ? [
        { s: sup.name, bold: true },
        ...(sup.contact_name ? [{ s: `For the attention of ${sup.contact_name}` }] : []),
        ...(sup.address ? [{ s: sup.address }] : []),
        ...(sup.email ? [{ s: sup.email }] : []),
        ...(sup.phone ? [{ s: sup.phone }] : []),
        ...(sup.account_number ? [{ s: `Our account number: ${sup.account_number}`, muted: true }] : []),
      ]
    : [{ s: 'Supplier not found', muted: true }];
  const where: BlockRow[] =
    o.deliver_to === 'collect'
      ? [{ s: 'Collection', bold: true }, { s: 'We’ll collect it from you. Please let us know when it’s ready.' }]
      : [
          { s: o.deliver_to === 'office' ? 'Our office / warehouse' : 'Site', bold: true },
          ...(o.deliver_address ? [{ s: o.deliver_address }] : []),
          ...(o.deliver_postcode && !(o.deliver_address ?? '').toUpperCase().includes(o.deliver_postcode.toUpperCase()) ? [{ s: o.deliver_postcode }] : []),
        ];
  const contact = [input.orderedBy, input.contactEmail].filter(Boolean).join(', ');
  const whereRows: BlockRow[] = [...where, ...(contact ? [{ s: `Questions: ${contact}`, muted: true }] : [])];
  const blockLines = (rows: BlockRow[]) => rows.flatMap((r) => pk.lines(r.s, r.bold ? 9.5 : 8.8, colW - 22, r.bold ? 'bold' : 'regular').map((l) => ({ l, r })));
  const lead = (x: { r: BlockRow }) => (x.r.bold ? 13 : 11.4);
  const blocks = [
    { label: 'Supplier', ls: blockLines(supRows) },
    { label: 'Delivery', ls: blockLines(whereRows) },
  ];
  const cardH = Math.max(...blocks.map((b) => 26 + b.ls.reduce((a, x) => a + lead(x), 0))) + 2;
  pk.card(page, X, y, W, cardH);
  vline(X + colW, y, y - cardH, 0.6);
  blocks.forEach((b, j) => {
    const bx = X + 10 + j * colW;
    pk.label(page, b.label, bx, y - 12.2, 6.6);
    let by = y - 26;
    for (const x of b.ls) {
      text(x.l, bx, by, x.r.bold ? 9.5 : 8.8, { style: x.r.bold ? 'bold' : 'regular', color: x.r.muted ? MUTED : INK });
      by -= lead(x);
    }
  });
  y -= cardH + 18;

  /* The lines: mono headings on a paper band, the rows on card */
  const tableHead = () => {
    const h = 19;
    if (look.head) page.drawRectangle({ x: X, y: y - h, width: W, height: h, color: look.head });
    rule(y, INK, 0.8);
    const ty = y - 12.2;
    const lab = (s: string, x: number, right = false) => pk.label(page, s, x, ty, 6.4, { bold: true, right });
    lab('#', COLS.no.x + PAD);
    lab('Part no.', COLS.part.x + PAD);
    lab('Description', COLS.desc.x + PAD);
    lab('Qty', COLS.qty.x + COLS.qty.w - PAD, true);
    lab('Unit ex VAT', COLS.unit.x + COLS.unit.w - PAD, true);
    lab('VAT', COLS.vat.x + COLS.vat.w - PAD, true);
    lab('Net', COLS.net.x + COLS.net.w - PAD, true);
    cols(y, y - h);
    y -= h;
    rule(y, LINE, 0.6);
  };
  const cols = (y0: number, y1: number) => {
    vline(X, y0, y1, 0.6);
    vline(X + W, y0, y1, 0.6);
    for (const c of [COLS.part, COLS.desc, COLS.qty, COLS.unit, COLS.vat, COLS.net]) vline(c.x, y0, y1);
  };
  const newPage = () => {
    page = doc.addPage(A4);
    pk.paint(page);
    const what = `Purchase order ${o.po_number}`;
    y = pk.strip(page, { x: X, w: W, what: `${what}${input.jobRef ? ` · Our job reference ${input.jobRef}` : ''} (continued)`, short: `${what} (continued)` });
  };
  /** Room for `h` more on this page, else a new one (with the table's headings again when it's the table). */
  const need = (h: number, inTable = false) => {
    if (y - h >= FOOT) return;
    newPage();
    if (inTable) tableHead();
  };

  need(60);
  tableHead();
  if (!lines.length) {
    if (look.cell) page.drawRectangle({ x: X, y: y - 22, width: W, height: 22, color: look.cell });
    cols(y, y - 22);
    text('No lines yet.', COLS.desc.x + PAD, y - 14, 9, { color: MUTED });
    y -= 22;
    rule(y);
  }
  lines.forEach((l, i) => {
    const size = 8.8;
    const desc = pk.lines(l.description, size, COLS.desc.w - 2 * PAD);
    const part = pk.lines(l.part_number || '', 7.4, COLS.part.w - 2 * PAD, 'mono');
    const rowH = Math.max(desc.length * 11, part.length * 9.6, 11) + 9;
    need(rowH, true);
    if (look.cell) page.drawRectangle({ x: X, y: y - rowH, width: W, height: rowH, color: look.cell });
    cols(y, y - rowH);
    const ty = y - 13;
    text(String(i + 1), COLS.no.x + PAD, ty, 7.6, { style: 'mono', color: LABEL });
    part.forEach((s, k) => text(s, COLS.part.x + PAD, ty - k * 9.6, 7.4, { style: 'mono' }));
    desc.forEach((s, k) => text(s, COLS.desc.x + PAD, ty - k * 11, size));
    right(formatQty(l.qty), COLS.qty.x + COLS.qty.w - PAD, ty, size);
    const priced = l.unit_cost_pence != null;
    right(priced ? formatPence(l.unit_cost_pence!) : 'TBC', COLS.unit.x + COLS.unit.w - PAD, ty, size, priced ? {} : { style: 'bold', color: look.flag });
    right(`${l.vat_rate}%`, COLS.vat.x + COLS.vat.w - PAD, ty, size, { color: MUTED });
    right(priced ? formatPence(lineNet(l)) : 'TBC', COLS.net.x + COLS.net.w - PAD, ty, size, { style: 'bold', color: priced ? INK : look.flag });
    y -= rowH;
    rule(y);
  });

  /* Totals: the net and VAT per rate on hairlines, the total on an ink band (a gold-edged bar on a print) */
  const t = totals(lines);
  const rows: [string, string][] = [['Net (ex VAT)', formatPence(t.net)], ...t.vat.map((g): [string, string] => [`VAT at ${g.rate}% on ${formatPence(g.net)}`, formatPence(g.vat)])];
  const boxW = 250;
  const bx = X + W - boxW;
  need(rows.length * 17 + 50 + (t.unpriced ? 14 : 0));
  y -= 6;
  for (const [k, v] of rows) {
    text(k, bx + 10, y - 12, 7.8, { style: 'mono', color: LABEL });
    right(v, X + W - 10, y - 12.4, 9, { style: 'bold' });
    y -= 17;
    rule(y + 0.5, LINE, 0.5, bx, X + W);
  }
  y -= 5;
  const bar = pk.figure(page, bx, y, boxW, 30);
  text('Total (inc VAT)', bx + 11, y - 19.2, 11.5, { style: 'display', color: bar.words });
  right(formatPence(t.gross), X + W - 11, y - 20, 14, { style: 'display', color: bar.figure });
  y -= 36;
  if (t.unpriced) {
    right(`${t.unpriced} line${t.unpriced === 1 ? '' : 's'} marked TBC: price to be confirmed, not in the totals.`, X + W, y - 5, 7.8, { color: look.flag });
    y -= 14;
  }

  /* Notes to the supplier */
  if (o.notes?.trim()) {
    const notes = pk.lines(o.notes, 9, W);
    need(Math.min(notes.length, 3) * 12 + 26);
    y -= 10;
    pk.label(page, 'Notes', X, y - 8, 6.6);
    rule(y - 13, INK, 0.6, X + pk.width('NOTES', 6.6, 'mono', TRACK) + 8);
    y -= 26;
    for (const l of notes) {
      need(12);
      text(l, X, y, 9);
      y -= 12;
    }
  }

  /* Please quote … */
  need(30);
  y -= 12;
  text(`Please quote ${o.po_number} on your delivery note and invoice.`, X, y - 10, 9.5, { style: 'bold' });
  y -= 18;

  /* The banner on every page: the legal line and the page number. */
  const pages = doc.getPages();
  const legal = `${HELIAXIS_PARTY.name} · Company number ${HELIAXIS_PARTY.companyNumber} · VAT number ${HELIAXIS_PARTY.vatNumber} · Registered office: ${HELIAXIS_PARTY.registeredAddress}`;
  const tag = (i: number) => `${o.po_number} · Page ${i + 1} of ${pages.length}`;
  const tagRoom = Math.max(...pages.map((_, i) => pk.width(tag(i), 6.8, 'monoBold')));
  pages.forEach((p, i) => pk.banner(p, { tag: tag(i), tagRoom, legal }));

  return doc.save();
}

/** "PO-0003.pdf". */
export const pdfName = (o: Pick<PurchaseOrder, 'po_number'>) => `${o.po_number.replace(/[^\w-]+/g, '')}.pdf`;

/** The delivery address in one line, for the email. */
export const deliveryWords = (o: Pick<PurchaseOrder, 'deliver_to' | 'deliver_address' | 'deliver_postcode'>) =>
  o.deliver_to === 'collect' ? 'we’ll collect it' : `${o.deliver_to === 'office' ? 'our office' : 'site'}: ${addressLine(o.deliver_address, o.deliver_postcode)}`;
