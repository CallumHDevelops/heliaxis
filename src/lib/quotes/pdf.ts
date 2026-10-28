import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { issueOf } from '@/lib/documents/issue';
import { longDate, newDocument, type PhotoItem } from '@/lib/documents/pdf-kit';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { lineNet, money, totalsOf, type QuoteContent } from './types';

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
};

const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);

/** The quote as a PDF in Heliaxis's document style, with each chosen datasheet added after the last page. */
export async function quotePdf(f: QuoteFacts): Promise<Uint8Array> {
  const kit = await newDocument({ code: f.number, label: f.number, title: f.title || 'Quote', revision: issueOf('QUOTE'), jobRef: f.customerRef, refLabel: 'Customer', issued: f.issued });
  kit.header({ meta: [['Quote', f.number], ['Date', longDate(f.issued)], ...(f.validUntil ? ([['Valid until', longDate(f.validUntil)]] as [string, string][]) : [])] });
  kit.idGrid([
    ['Prepared for', f.customer.name],
    ['Customer ID', f.customerRef],
    ['Site', f.customer.address],
    ['Email', f.customer.email],
    ['Phone', f.customer.phone],
    ['From', `${HELIAXIS_COMPANY.tradingName} · ${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}`],
  ]);
  for (const p of paragraphs(f.content.intro)) kit.paragraph(p);

  const totals = totalsOf(f.content);
  let shownTotals = false;
  const sheets: string[] = [];
  const lastItems = [...f.content.blocks].reverse().find((b) => b.type === 'items');

  for (const b of f.content.blocks) {
    if (b.type === 'text') {
      if (!b.body.trim()) continue;
      kit.section(b.heading || 'Details');
      for (const p of paragraphs(b.body)) kit.paragraph(p);
    } else if (b.type === 'items') {
      const lines = b.lines.filter((l) => !l.internal && (l.description.trim() || l.unit_pence));
      if (!lines.length) continue;
      kit.section(b.heading || 'Price');
      kit.grid({
        columns: ['Item', 'Qty', 'Unit price', 'VAT', 'Total'],
        widths: [5, 0.9, 1.6, 0.9, 1.7],
        rows: lines.map((l) => [
          l.detail ? `${l.description}\n${l.detail}`.replace(/\n/g, ' · ') : l.description,
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

  // The terms: last, so they are the last thing read before accepting.
  if (f.content.terms.trim()) {
    kit.section('Terms');
    for (const p of paragraphs(f.content.terms)) kit.paragraph(p);
  }

  // Acceptance: how to accept online, and a place to sign if they prefer paper; the signed copy shows their signature.
  kit.section('Accepting this quote', { keep: 300 });
  kit.rows([
    { label: 'Total to pay', value: money(totals.gross), strong: true },
    ...(f.depositPence ? [{ label: 'Deposit once you accept', value: money(f.depositPence) }] : []),
    ...(f.validUntil ? [{ label: 'Valid until', value: longDate(f.validUntil) }] : []),
  ]);
  if (f.signed) {
    kit.paragraph('Accepted online by the customer, including the 14-day cancellation terms above.', { bold: true });
  } else {
    kit.paragraph('To accept, open the link we sent you and sign on your phone or computer. If you would rather sign on paper, sign below and send it back to us. You can change your mind and cancel within 14 days of signing, free of charge.');
  }
  await kit.signatures([
    f.signed
      ? { title: 'Accepted by (customer)', png: f.signed.png, name: f.signed.name, at: f.signed.at }
      : { title: 'Accepted by (customer)', png: null, name: f.customer.name, at: null, line: 'Date: ____ / ____ / ________' },
  ]);

  const main = await kit.save();
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
