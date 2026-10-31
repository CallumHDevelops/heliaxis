import 'server-only';
import { PDFDocument, PDFString, rgb } from 'pdf-lib';
import { issueOf } from '@/lib/documents/issue';
import { INK, LINE, longDate, MUTED, newDocument, SOLAR, type Kit, type PhotoItem } from '@/lib/documents/pdf-kit';
import { designPages } from './design-pages';
import { drawQr } from './qr';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { glanceRows } from './proposal';
import { DEFAULT_ABOUT, DEFAULT_SURVEY, lineNet, money, totalsOf, type QuoteContent } from './types';

/** What the quote PDF is made from: the content, the customer, and the files already fetched (images, datasheet PDFs). */
export type QuoteFacts = {
  number: string;
  title: string;
  issued: string; // YYYY-MM-DD
  validUntil: string | null;
  /** The customer's CRM ID (HX-0007), shown instead of a project reference. */
  customerRef: string | null;
  customer: { name: string; email: string | null; phone: string | null; address: string | null };
  content: QuoteContent;
  depositPence: number | null;
  /** storage path → bytes, for the images block. */
  images: Map<string, { bytes: Uint8Array; mime: string }>;
  /** library id → the datasheet's PDF bytes. */
  datasheets: Map<string, Uint8Array>;
  /** Once they have signed online: their signature, name and the time (the signed copy). */
  signed?: { png: Uint8Array; name: string; at: string };
  /** Who signs the introduction (a PNG data URL for the signature), unless the quote has turned it off. */
  signatory?: { name: string; role: string; png: string } | null;
  /** The customer's page itself (for the QR code). */
  portalUrl?: string;
  /** The customer's page, opening the sign box: the Accept button's link (absent on the signed copy and when there is no link). */
  acceptUrl?: string;
};

const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);



/** A button in the PDF that opens `url` when it is clicked: a gold block with its words, and a link over it. With `qrUrl`, a QR code beside it for a phone camera. */
function linkButton(kit: Kit, label: string, sub: string, url: string, qrUrl?: string) {
  kit.block(qrUrl ? 76 : 58, (d) => {
    const h = 44;
    const w = Math.min(d.width - (qrUrl ? 190 : 0), 290);
    const x = d.x;
    const y = d.top - h - 6;
    d.rect(x, y, w, h, { fill: SOLAR });
    d.rect(x, y, w, 2.5, { fill: INK });
    d.text(label, x + 16, y + 24, 12, { style: 'display', color: INK });
    d.text(sub, x + 16, y + 10, 7.2, { color: INK });
    d.text('→', x + w - 26, y + 17, 15, { bold: true, color: INK });
    const ctx = d.page.doc.context;
    const link = ctx.register(
      ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } })
    );
    d.page.node.addAnnot(link);
    if (qrUrl) {
      const q = 66;
      drawQr(d, qrUrl, d.x + d.width - q, d.top - q - 4, q);
      d.lines('Or point your phone camera here to open your private quote page.', 7.2, 96, false).forEach((l, k) => d.text(l, d.x + d.width - q - 104, d.top - 22 - k * 9.5, 7.2, { color: MUTED }));
    }
  });
}

type Toc = { title: string; page: number }[];

/** One pass at the document: the PDF so far, the page each section landed on, and the datasheets to add after it. */
async function build(f: QuoteFacts, toc: Toc | null): Promise<{ main: Uint8Array; marks: Toc; sheets: string[] }> {
  const marks: Toc = [];
  const kit = await newDocument({ code: f.number, label: f.number, title: f.title || 'Quote', revision: issueOf('QUOTE'), jobRef: f.customerRef, refLabel: 'Customer', issued: f.issued, accreditations: true });
  const mark = (title: string) => {
    if (!marks.some((m) => m.title === title)) marks.push({ title, page: kit.pageNumber });
  };
  kit.header({ meta: [['Quote', f.number], ['Date', longDate(f.issued)], ...(f.validUntil ? ([['Valid until', longDate(f.validUntil)]] as [string, string][]) : [])] });
  kit.idGrid([
    ['Prepared for', f.customer.name],
    ['Customer ID', f.customerRef],
    ['Site', f.customer.address],
    ['Email', f.customer.email],
    ['Phone', f.customer.phone],
    ['From', `${HELIAXIS_COMPANY.tradingName} · ${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}`],
  ]);
  // Page 1, the cover: who it is for, the introduction and what the quote includes, with the headline figure.
  const sig = f.signatory && f.content.signOff !== false ? f.signatory : null;
  // With a signature the letter's own "Yours sincerely, Heliaxis" is replaced by the signature and the signatory's name.
  const letter = sig ? f.content.intro.replace(/\n*\s*Yours (sincerely|faithfully),?\s*(\n+\s*Heliaxis\s*)?$/i, '').trim() : f.content.intro;
  for (const p of paragraphs(letter)) kit.paragraph(p);
  if (sig) {
    const img = await kit.embed(sig.png);
    kit.paragraph('Yours sincerely,');
    if (img) kit.block(54, (d) => d.image(img, d.x, d.top - 50, 190, 46));
    kit.paragraph(sig.name, { bold: true });
    kit.paragraph(`${sig.role ? `${sig.role}, ` : ''}Heliaxis`);
  }

  const totals = totalsOf(f.content);
  const chosen = f.content.proposal?.options[f.content.proposal.chosen];
  // With design pages the figures sit at the top of those, so the cover stays the introduction, what is included and the total.
  const hasDesignPictures = !!chosen && !!(Object.keys(chosen.images ?? {}).length || chosen.panelCount || chosen.inverterModel || chosen.batteryModel || chosen.monthlyKwh || chosen.selfSufficiencyPct);
  const glance = chosen && !hasDesignPictures ? glanceRows(chosen, f.content.proposal?.showFinancials === true) : [];
  if (glance.length || totals.gross > 0) {
    // The summary stays on the cover when it fits; if the cover is full, the totals are on the items page straight after.
    if (!glance.length && kit.room() < 150) kit.note('The items and prices follow. This is a quotation, subject to the terms and conditions at the end of this document.');
    else {
    kit.section(glance.length ? 'System at a glance' : 'Quote summary', { keep: 120 });
    kit.rows([
      ...glance.map((r) => ({ label: r.label, value: r.value })),
      ...(totals.gross > 0
        ? [
            { label: 'Total to pay', value: money(totals.gross), strong: true },
            ...(f.depositPence ? [{ label: 'Deposit once you accept', value: money(f.depositPence) }] : []),
            ...(f.validUntil ? [{ label: 'Valid until', value: longDate(f.validUntil) }] : []),
          ]
        : []),
    ]);
    kit.note(`${glance.length ? 'Figures are from the design proposal prepared for this property; generation is an estimate, not a guarantee. ' : ''}The items and prices follow. This is a quotation, subject to the terms and conditions at the end of this document.`);
    }
  }

  if (f.acceptUrl && !f.signed) linkButton(kit, 'Accept this quote online', 'Opens your private page to read, sign and choose your installation date', f.acceptUrl, f.portalUrl);

  // Who we are accredited with: the main section, in the brand's ink on a white card (the same logos run along the top of every later page).
  const accr = await kit.brandImage('heliaxis-accreditations.png');
  if (accr) {
    kit.section('Accredited and certified', { keep: 56 });
    kit.block(54, (d) => {
      const h = 40;
      const w = Math.min(d.width - 28, (accr.width / accr.height) * h);
      d.rect(d.x, d.top - 48, d.width, 48, { fill: rgb(1, 1, 1), border: LINE, line: 0.6 });
      d.rect(d.x, d.top - 48, 3, 48, { fill: SOLAR });
      d.image(accr, d.x + (d.width - w) / 2, d.top - 48 + 4, w, 40);
    });
  }

  const isIncluded = (bl: QuoteContent['blocks'][number]) => bl.type === 'text' && /includ/i.test(bl.heading);

  // Page 2: the contents (page numbers filled in on the second pass) and About Heliaxis. Always one page, so the numbers hold.
  kit.newPage({ continued: true });
  kit.section('Contents', { keep: 160 });
  if (toc) {
    for (const e of toc) {
      kit.block(17, (d) => {
        d.text(e.title, d.x, d.top - 11, 9, { bold: false });
        const num = String(e.page);
        const tw = d.widthOf(e.title, 9);
        d.line(d.x + tw + 8, d.top - 11, d.x + d.width - d.widthOf(num, 9, true) - 8, d.top - 11, { color: MUTED, t: 0.8, dash: [0, 3], round: true });
        d.right(num, d.x + d.width, d.top - 11, 9, { bold: true });
      });
    }
  }
  const about = f.content.about === undefined ? DEFAULT_ABOUT : f.content.about;
  if (about.trim()) {
    kit.section('About Heliaxis', { keep: 150 });
    mark('About Heliaxis');
    for (const p of paragraphs(about)) kit.paragraph(p);
    kit.rows([
      { label: 'Registered address', value: HELIAXIS_COMPANY.addressLines.join(', ') },
      { label: 'Contact', value: `${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}` },
      { label: 'MCS · Company number', value: `${HELIAXIS_COMPANY.mcsNumber} · ${HELIAXIS_COMPANY.companyNumber}` },
    ]);
  }

  for (const b of f.content.blocks) {
    if (!isIncluded(b) || b.type !== 'text' || !b.body.trim()) continue;
    kit.section(b.heading || 'What is included');
    mark('What is included');
    for (const p of paragraphs(b.body)) kit.paragraph(p);
  }

  // The design pages lifted from the uploaded proposal (when there is one), between the cover and the items.
  if (chosen) await designPages(kit, chosen, f.images, f.content.proposal?.showFinancials === true, glanceRows(chosen, f.content.proposal?.showFinancials === true), mark, { name: f.customer.name, site: f.customer.address });

  // Page 2 onwards: the quoted items, and anything else the quote shows (text, pictures, datasheets).
  kit.newPage({ continued: true });
  let shownTotals = false;
  const sheets: string[] = [];
  const lastItems = [...f.content.blocks].reverse().find((b) => b.type === 'items');

  for (const b of f.content.blocks) {
    if (isIncluded(b)) continue;
    if (b.type === 'text') {
      if (!b.body.trim()) continue;
      kit.section(b.heading || 'Details');
      for (const p of paragraphs(b.body)) kit.paragraph(p);
    } else if (b.type === 'items') {
      const lines = b.lines.filter((l) => !l.internal && (l.description.trim() || l.unit_pence));
      if (!lines.length) continue;
      kit.section(b.heading || 'Price');
      mark(b.heading || 'Price');
      kit.grid({
        columns: ['Item', 'Qty', 'Unit price', 'VAT', 'Total'],
        widths: [5, 0.9, 1.6, 0.9, 1.7],
        rows: lines.map((l) => [
          l.detail?.trim() ? `${l.description.replace(/\n/g, ' ')}\n${l.detail.trim()}` : l.description.replace(/\n/g, ' '),
          l.text ? '' : String(l.qty),
          l.text ? '' : money(l.unit_pence),
          l.text ? '' : `${l.vat_rate}%`,
          l.text ? '' : money(lineNet(l)),
        ]),
      });
      if (b === lastItems) {
        shownTotals = true;
        kit.rows([
          { label: 'Total before VAT', value: money(totals.net) },
          ...totals.byRate.filter((r) => r.vat).map((r) => ({ label: `VAT at ${r.rate}%`, value: money(r.vat) })),
          ...(totals.vat ? [] : [{ label: 'VAT', value: 'None on this quote' }]),
          { label: 'Total to pay', value: money(totals.gross), strong: true },
          ...(f.depositPence ? [{ label: 'Deposit once you accept', value: money(f.depositPence) }] : []),
        ]);
      }
    } else if (b.type === 'images') {
      const items: PhotoItem[] = b.images.flatMap((i) => {
        const img = f.images.get(i.path);
        return img ? [{ bytes: img.bytes, mime: img.mime, caption: i.caption || '', fit: 'contain' as const }] : [];
      });
      if (!items.length) continue;
      kit.section(b.heading || 'Photos and diagrams');
      await kit.photos(items, { perRow: items.length === 1 ? 1 : 2 });
    } else if (b.type === 'datasheets') {
      const named = b.files.filter((x) => f.datasheets.has(x.library_id));
      if (!named.length) continue;
      kit.section(b.heading || 'Datasheets');
      kit.list(named.map((x, i) => `${i + 1}. ${x.name}, included after this page`));
      sheets.push(...named.map((x) => x.library_id));
    }
  }
  if (!shownTotals) kit.note('Add your items to see the total.');

  // Structural requirements and the survey: what we check before anything is installed.
  const survey = f.content.survey === undefined ? DEFAULT_SURVEY : f.content.survey;
  if (survey.trim()) {
    kit.section('Structural requirements and survey', { keep: 140 });
    mark('Structural requirements and survey');
    for (const p of paragraphs(survey)) kit.paragraph(p);
  }

  // The last page: the terms, then the acceptance, so they are the last thing read before accepting.
  kit.newPage({ continued: true });
  if (f.content.terms.trim()) {
    kit.section('Terms and conditions');
    mark('Terms and conditions');
    for (const p of paragraphs(f.content.terms)) kit.paragraph(p);
  }

  // Acceptance: how to accept online, and a place to sign if they prefer paper; the signed copy shows their signature.
  kit.section('Accepting this quote', { keep: 300 });
  mark('Accepting this quote');
  kit.rows([
    { label: 'Total to pay', value: money(totals.gross), strong: true },
    ...(f.depositPence ? [{ label: 'Deposit once you accept', value: money(f.depositPence) }] : []),
    ...(f.validUntil ? [{ label: 'Valid until', value: longDate(f.validUntil) }] : []),
  ]);
  if (f.signed) {
    kit.paragraph('Accepted online by the customer, including the terms and conditions above.', { bold: true });
  } else {
    if (f.acceptUrl) linkButton(kit, 'Accept this quote online', 'Opens your private page to read, sign and choose your installation date', f.acceptUrl, f.portalUrl);
    kit.paragraph('To accept, open the link we sent you and sign on your phone or computer. If you would rather sign on paper, sign below and send it back to us. By accepting, you agree to the terms and conditions above, including your right to cancel within 14 days.');
  }
  await kit.signatures([
    f.signed
      ? { title: 'Accepted by (customer)', png: f.signed.png, name: f.signed.name, at: f.signed.at }
      : { title: 'Accepted by (customer)', png: null, name: f.customer.name, at: null, line: 'Date: ____ / ____ / ________' },
  ]);

  return { main: await kit.save(), marks, sheets };
}

/** The quote as a PDF in Heliaxis's document style, with each chosen datasheet added after the last page. */
export async function quotePdf(f: QuoteFacts): Promise<Uint8Array> {
  // Two passes, three if the contents moved a page: the first finds the sections, the second prints the contents with those numbers, and a third only if that changed where sections fall.
  const first = await build(f, null);
  const second = await build(f, first.marks);
  // Usually the contents did not move anything, so the second pass already has the right numbers.
  const settled = JSON.stringify(second.marks) === JSON.stringify(first.marks);
  const { main, sheets } = settled ? second : await build(f, second.marks);
  if (!sheets.length) return main;
  const out = await PDFDocument.load(main);
  for (const id of sheets) {
    try {
      const src = await PDFDocument.load(f.datasheets.get(id)!, { ignoreEncryption: true });
      for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    } catch {
      // A datasheet that can't be read is left out rather than stopping the quote.
    }
  }
  return out.save();
}
