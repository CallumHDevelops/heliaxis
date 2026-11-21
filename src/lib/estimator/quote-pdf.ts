import 'server-only';
import { PDFString } from 'pdf-lib';
import { INK, longDate, newDocument, SOLAR, type Kit } from '@/lib/documents/pdf-kit';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { ESTIMATE_SMALL_PRINT, QUOTE_VALID_DAYS, surveyUrl, TIMELINE } from './copy';
import type { QuoteFacts } from './quote-facts';
import { whatsappLink } from './whatsapp-link';

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const num = (n: number) => Math.round(n).toLocaleString('en-GB');
const yrs = (n: number) => (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');

/** A gold button in the PDF that opens `url` when it is clicked. */
function linkButton(kit: Kit, label: string, sub: string, url: string) {
  kit.block(58, (d) => {
    const h = 44;
    const w = Math.min(d.width, 300);
    const x = d.x;
    const y = d.top - h - 6;
    d.rect(x, y, w, h, { fill: SOLAR });
    d.rect(x, y, w, 2.5, { fill: INK });
    d.text(label, x + 16, y + 24, 12, { style: 'display', color: INK });
    d.text(sub, x + 16, y + 10, 7.2, { color: INK });
    d.text('→', x + w - 26, y + 17, 15, { bold: true, color: INK });
    const ctx = d.page.doc.context;
    const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } }));
    d.page.node.addAnnot(link);
  });
}

/**
 * The estimate as a PDF in the document kit: the Heliaxis header and the cover first (who it is for, the headline price, the roof), then the
 * system, the price and what is included, what happens next, why Heliaxis, and the small print. Nothing is claimed that is not in the estimate:
 * no warranty term unless one is set, no award unless it is switched on, and never a cost.
 */
export async function makeEstimatePdf(f: QuoteFacts, extras: { mapBytes?: Uint8Array | null } = {}): Promise<Uint8Array> {
  const kit = await newDocument({ code: f.reference, label: f.reference, title: 'Your solar estimate', jobRef: null, issued: f.issued, accreditations: true });
  kit.header({ meta: [['Reference', f.reference], ['Date', longDate(f.issued)], ['Valid until', longDate(f.validUntil)]] });
  kit.idGrid([
    ['Prepared for', f.customerName],
    ['Property', [f.address, f.postcode].filter(Boolean).join(', ') || null],
    ['Reference', f.reference],
    ['Valid for', `${QUOTE_VALID_DAYS} days from ${longDate(f.issued)}`],
    ['From', `${HELIAXIS_COMPANY.tradingName} · ${HELIAXIS_COMPANY.phone}`],
    ['Email', HELIAXIS_COMPANY.email],
  ]);

  // Page 1, the cover: the headline price and, if we have it, the roof.
  kit.paragraph(`Hello ${f.customerName.split(' ')[0] || ''}, thank you for using the Heliaxis solar estimator. This is what we worked out for your property.`);
  kit.section('Your estimate', { keep: 90 });
  kit.rows([
    { label: 'Price range', value: `${gbp(f.priceLow)} – ${gbp(f.priceHigh)} ${f.vatLabel}`, strong: true },
    { label: 'Saving a year', value: `about ${gbp(f.saving[0])} – ${gbp(f.saving[1])}` },
    { label: 'Pays for itself in', value: `${yrs(f.payback[0])} – ${yrs(f.payback[1])} years` },
  ]);
  const map = extras.mapBytes ? await kit.embed(extras.mapBytes) : null;
  if (map) kit.block(250, (d) => d.image(map, d.x + (d.width - 240) / 2, d.top - 246, 240, 240));

  // Your system.
  kit.section('Your system', { keep: 120 });
  kit.rows([
    { label: 'Solar panels', value: `${f.panels} × ${f.panelWatts} W` },
    { label: 'System size', value: `${f.kwp.toFixed(2)} kWp` },
    { label: 'Inverter', value: f.inverter ?? 'Confirmed at survey' },
    { label: 'Battery', value: f.batteryName ?? 'None in this estimate' },
    { label: 'Generation a year', value: `about ${num(f.generation)} kWh` },
    { label: 'Used at home', value: `about ${Math.round(f.selfPct * 100)}% of what the panels make` },
    { label: 'Saving a year', value: `about ${gbp(f.saving[0])} – ${gbp(f.saving[1])}` },
    { label: 'Payback', value: `${yrs(f.payback[0])} – ${yrs(f.payback[1])} years` },
    { label: 'Over 25 years', value: `about ${gbp(Math.round(f.net25 / 100) * 100)} saved, after paying for it` },
    { label: 'Carbon saved', value: `about ${f.co2Tonnes.toFixed(1)} tonnes of CO2 a year` },
    ...(f.gridRoute ? [{ label: 'Grid connection', value: f.gridRoute === 'G99' ? 'We apply to your network operator for you (G99) before the install' : 'We notify your network operator for you (G98) after the install' }] : []),
  ]);
  if (f.phaseCapped) kit.note(`On a single-phase supply the biggest system we can fit is about ${f.phaseCapKwp.toFixed(1)} kWp, so this estimate is held there. A three-phase supply allows more.`);

  // Price and what's included.
  kit.section('Price and what is included', { keep: 140 });
  kit.paragraph(`${gbp(f.priceLow)} – ${gbp(f.priceHigh)} ${f.vatLabel}.`, { bold: true });
  if (f.lines && f.lineTotal !== null) {
    kit.grid({ columns: ['Included', 'Indicative price'], rows: [...f.lines.map((l) => [l.label, gbp(l.price)]), ['Total at the middle of the range', gbp(f.lineTotal)]], widths: [4, 1.4] });
    kit.note('Prices against each line are indicative and add up to the middle of the range above. The free survey sets the final figure.');
  } else {
    kit.checklist(f.included.map((label) => ({ label, mark: 'tick' as const })));
  }

  // What happens next.
  kit.section('What happens next', { keep: 120 });
  kit.list(TIMELINE.map((s, i) => `${i + 1}. ${s.title}: ${s.text}`));
  linkButton(kit, 'Book my free survey', 'Takes about a minute. No obligation.', surveyUrl(f.reference, f.postcode));
  kit.paragraph(`Prefer to talk? Call ${HELIAXIS_COMPANY.phone}, or message us on WhatsApp: ${whatsappLink(`Hi Heliaxis, about my estimate ${f.reference}`)}`);

  // Why Heliaxis.
  kit.section('Why Heliaxis', { keep: 110 });
  const lines = [
    'We are an MCS-certified installer covering South Wales and the South West. We design it, apply to your network operator, install it, commission it and look after it afterwards.',
    ...(f.award ? [`${f.award.title ? `${f.award.title}. ` : ''}${f.award.wording}`] : []),
    'We fit GoodWe inverters and batteries.',
    ...(f.workmanshipYears > 0 ? [`${f.workmanshipYears}-year workmanship warranty.`] : []),
  ];
  for (const l of lines) kit.paragraph(l);
  const badge = await kit.brandImage('heliaxis-accreditations-light.png');
  if (badge) kit.block(52, (d) => d.image(badge, d.x, d.top - 46, Math.min(d.width, 330), 44));

  // The small print, on its own page.
  kit.newPage();
  kit.section('The small print');
  kit.paragraph(ESTIMATE_SMALL_PRINT);
  kit.paragraph(`This estimate is valid for ${QUOTE_VALID_DAYS} days from ${longDate(f.issued)}. It is not a contract. After your free survey we send a fixed-price quotation to accept.`);
  kit.note('Heliaxis is an MCS-certified installer and a member of RECC, TrustMark and NAPIT.');
  kit.rows([
    { label: 'Company', value: HELIAXIS_COMPANY.legalName },
    { label: 'Company number', value: HELIAXIS_COMPANY.companyNumber },
    { label: 'Registered office', value: HELIAXIS_COMPANY.addressLines.join(', ') },
    { label: 'MCS certification number', value: HELIAXIS_COMPANY.mcsNumber },
    { label: 'Contact', value: `${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}` },
  ]);
  return kit.save();
}

