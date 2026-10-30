import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { issueOf } from '@/lib/documents/issue';
import { INK, LABEL, LINE, longDate, MUTED, newDocument, SOLAR, type Kit, type PhotoItem } from '@/lib/documents/pdf-kit';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { glanceRows } from './proposal';
import { lineNet, money, totalsOf, type ProposalOption, type QuoteContent } from './types';

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
};

const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const n0 = (x: number) => Math.round(x).toLocaleString('en-GB');

/** The monthly generation as gold bars, with the figure over each. */
function generationChart(kit: Kit, kwh: number[]) {
  const H = 150;
  kit.block(H, (d) => {
    const top = d.top - 6;
    const base = d.top - H + 22;
    const max = Math.max(...kwh, 1);
    const colW = d.width / 12;
    const barW = colW * 0.62;
    d.line(d.x, base, d.x + d.width, base, { color: LINE, t: 0.6 });
    kwh.forEach((v, i) => {
      const h = Math.max(1, ((top - base - 14) * v) / max);
      const x = d.x + i * colW + (colW - barW) / 2;
      d.rect(x, base, barW, h, { fill: SOLAR });
      const label = n0(v);
      d.text(label, x + barW / 2 - d.widthOf(label, 6.6) / 2, base + h + 3, 6.6, { color: LABEL });
      d.text(MONTHS[i], x + barW / 2 - d.widthOf(MONTHS[i], 7) / 2, base - 11, 7, { color: MUTED });
    });
  });
}

/**
 * The pages lifted from the design proposal: the roof design and the equipment with their photos, then the expected performance
 * (generation by month, self-sufficiency, the MCS yield and the sun-path diagram). Only what the proposal gave is shown.
 */
async function designPages(kit: Kit, o: ProposalOption, pics: Map<string, { bytes: Uint8Array; mime: string }>, financials: boolean): Promise<boolean> {
  const pic = (kind: 'roof' | 'inverter' | 'battery' | 'sunpath') => (o.images?.[kind] ? pics.get(o.images[kind]!) : undefined);
  const roof = await kit.embed(pic('roof')?.bytes);
  const inverter = await kit.embed(pic('inverter')?.bytes);
  const battery = await kit.embed(pic('battery')?.bytes);
  const sunpath = await kit.embed(pic('sunpath')?.bytes);
  const glance = glanceRows(o, financials);
  const hasPerformance = o.monthlyKwh?.length === 12 || o.selfSufficiencyPct || o.selfSufficiencyPvOnlyPct || sunpath;
  if (!roof && !inverter && !battery && !hasPerformance) return false;

  kit.newPage({ continued: true });
  kit.section('Your system design', { keep: 260 });
  // The roof design, whole, at its own proportions.
  if (roof) {
    const ratio = roof.height / roof.width;
    kit.block(
      Math.min(250, 480 * ratio) + 34,
      (d) => {
        const h = Math.min(250, d.width * ratio);
        const w = h / ratio;
        d.rect(d.x, d.top - h, d.width, h, { fill: undefined, border: LINE, line: 0.5 });
        d.image(roof, d.x + (d.width - w) / 2, d.top - h, w, h);
        d.text('Your roof with the proposed panels', d.x, d.top - h - 12, 8, { bold: true });
        d.text('Indicative design from the design proposal. The final layout is confirmed at survey.', d.x, d.top - h - 22, 6.8, { color: MUTED });
      }
    );
  }
  if (glance.length) kit.rows(glance.map((r) => ({ label: r.label, value: r.value })));

  // The equipment: the photos side by side, each with its name, size and warranty.
  const cards = [
    inverter && { img: inverter, title: 'Inverter', name: [o.inverterBrand, o.inverterModel].filter(Boolean).join(' ') || 'As quoted', sub: [o.inverterKw ? `${Math.round(o.inverterKw * 10) / 10} kW` : '', o.inverterWarrantyYears ? `${o.inverterWarrantyYears}-year warranty` : ''].filter(Boolean).join(' · ') },
    battery && { img: battery, title: 'Battery storage', name: [o.batteryBrand, o.batteryModel].filter(Boolean).join(' ') || 'As quoted', sub: [o.batteryUsableKwh ? `${Math.round(o.batteryUsableKwh * 10) / 10} kWh usable` : '', o.batteryWarrantyYears ? `${o.batteryWarrantyYears}-year warranty` : ''].filter(Boolean).join(' · ') },
  ].filter((c): c is NonNullable<typeof c> => !!c);
  if (cards.length) {
    kit.section('The equipment', { keep: 190 });
    kit.block(190, (d) => {
      const colW = d.width / cards.length;
      cards.forEach((c, i) => {
        const x = d.x + i * colW;
        const ratio = c.img.width / c.img.height;
        const ih = 122;
        const iw = Math.min(colW - 20, ih * ratio);
        d.image(c.img, x + (colW - iw) / 2, d.top - ih - 4, iw, ih);
        d.text(c.title.toUpperCase(), x + 6, d.top - ih - 18, 6.4, { style: 'mono', color: MUTED });
        d.lines(c.name, 8.5, colW - 16, true).slice(0, 2).forEach((l, k) => d.text(l, x + 6, d.top - ih - 29 - k * 10, 8.5, { bold: true }));
        if (c.sub) d.text(c.sub, x + 6, d.top - ih - 49, 7.2, { color: LABEL });
      });
    });
  }
  if (o.panelProductWarrantyYears || o.panelPerformanceWarrantyYears) {
    kit.paragraph(`Solar panels: ${o.panelCount ? `${o.panelCount} × ` : ''}${o.panelWatts ? `${o.panelWatts} W ` : ''}${[o.panelBrand, o.panelModel].filter(Boolean).join(' ')}. ${[o.panelProductWarrantyYears ? `${o.panelProductWarrantyYears}-year product warranty` : '', o.panelPerformanceWarrantyYears ? `${o.panelPerformanceWarrantyYears}-year performance warranty` : ''].filter(Boolean).join(' and ')}.`);
  }

  if (hasPerformance) {
    kit.newPage({ continued: true });
    kit.section('Expected performance', { intro: 'Estimated by the MCS method from your roof, its direction and shading. A guide, not a guarantee.', keep: 220 });
    if (o.monthlyKwh?.length === 12) generationChart(kit, o.monthlyKwh);
    const rows = [
      ...(o.annualGenerationKwh ? [{ label: 'Estimated generation a year', value: `${n0(o.annualGenerationKwh)} kWh`, strong: true }] : []),
      ...(o.consumptionKwh ? [{ label: 'Assumed use a year', value: `${n0(o.consumptionKwh)} kWh` }] : []),
      ...(o.selfSufficiencyPvOnlyPct ? [{ label: 'Self-sufficiency, panels only', value: `${o.selfSufficiencyPvOnlyPct}%` }] : []),
      ...(o.selfSufficiencyPct ? [{ label: 'Self-sufficiency, with the battery', value: `${o.selfSufficiencyPct}%` }] : []),
      ...(o.kwhPerKwp ? [{ label: 'MCS yield', value: `${n0(o.kwhPerKwp)} kWh per kWp${o.shadeFactor ? `, shade factor ${o.shadeFactor}` : ''}${o.tiltDeg ? `, ${Math.round(o.tiltDeg)}° tilt` : ''}` }] : []),
      ...(financials && o.annualSavingsGbp ? [{ label: 'Estimated annual bill saving', value: `£${n0(o.annualSavingsGbp)}` }] : []),
      ...(financials && o.paybackText ? [{ label: 'Estimated payback', value: o.paybackText }] : []),
    ];
    if (rows.length) kit.rows(rows);
    if (sunpath) {
      const ratio = sunpath.height / sunpath.width;
      kit.section('Sun path and shading', { keep: 240 });
      kit.block(Math.min(230, 470 * ratio) + 22, (d) => {
        const h = Math.min(230, d.width * ratio);
        const w = h / ratio;
        d.image(sunpath, d.x + (d.width - w) / 2, d.top - h, w, h);
        d.text('Where the sun travels over the year, with shading marked at the middle of the array.', d.x, d.top - h - 12, 6.8, { color: MUTED });
      });
    }
  }
  return true;
}

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
  const isIncluded = (bl: QuoteContent['blocks'][number]) => bl.type === 'text' && /includ/i.test(bl.heading);
  for (const b of f.content.blocks) {
    if (!isIncluded(b) || b.type !== 'text' || !b.body.trim()) continue;
    kit.section(b.heading || 'What is included');
    for (const p of paragraphs(b.body)) kit.paragraph(p);
  }
  const chosen = f.content.proposal?.options[f.content.proposal.chosen];
  // With design pages the figures sit at the top of those, so the cover stays the introduction, what is included and the total.
  const hasDesignPictures = !!chosen && Object.keys(chosen.images ?? {}).length > 0;
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

  // The design pages lifted from the uploaded proposal (when there is one), between the cover and the items.
  if (chosen) await designPages(kit, chosen, f.images, f.content.proposal?.showFinancials === true);

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

  // The last page: the terms, then the acceptance, so they are the last thing read before accepting.
  kit.newPage({ continued: true });
  if (f.content.terms.trim()) {
    kit.section('Terms and conditions');
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
    kit.paragraph('Accepted online by the customer, including the terms and conditions above.', { bold: true });
  } else {
    kit.paragraph('To accept, open the link we sent you and sign on your phone or computer. If you would rather sign on paper, sign below and send it back to us. By accepting, you agree to the terms and conditions above, including your right to cancel within 14 days.');
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
