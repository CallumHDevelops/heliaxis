import type { PriceResult } from '@/lib/pricing/price';
import { DEFAULT_TERMS, VAT_RATES, cleanContent, type QuoteBlock, type QuoteContent, type QuoteLine } from './types';

/**
 * A draft quote's content, built from a priced job and a design. Pure. The wording here only states facts the system
 * worked out (counts, sizes, warnings) and the disclosures the brief requires; the legal terms are the quote's own
 * fixed DEFAULT_TERMS, never rewritten per job.
 */

export const INDICATIVE_QUOTE = 'Indicative — subject to site survey';
export const INDICATIVE_QUOTE_BODY = 'This quote, and the design it is based on, is indicative and subject to a site survey. Once we have surveyed the property the design, and so the price, may change. We will tell you before anything is changed.';
export const OFF_GRID_BODY = 'This is an off-grid installation. It is not connected to the grid and it is not an MCS-certified installation, so there is no MCS certificate and no Insurance-Backed Guarantee, and it is not eligible for the Smart Export Guarantee or MCS-linked grants or incentives. You should tell your home insurer and mortgage lender. A separate Non-MCS Disclosure and Acknowledgement will be provided with your contract for you to read and sign.';

export type DraftQuoteInput = {
  customerFirstName: string;
  systemType: 'grid-tied' | 'off-grid';
  priced: PriceResult;
  /** What the job covers, in the user's words (from the conversation): shown under "What is included". */
  scope: string;
  panelCount: number | null;
  kwp: number | null;
  /** Problems and warnings from the design check, shown in the quote, none left out. */
  designIssues: { severity: 'error' | 'warn' | 'info'; message: string }[];
  surveyLinked: boolean;
};

export const quoteTitle = (i: Pick<DraftQuoteInput, 'systemType' | 'kwp'>, customerName: string) => `${customerName}: ${i.kwp != null ? `${i.kwp} kWp ` : ''}${i.systemType === 'off-grid' ? 'off-grid solar PV and battery system' : 'solar PV system'}`.slice(0, 200);

/** A priced line as the quote builder holds it: only the fields a quote line has. */
const asQuoteLine = (l: PriceResult['lines'][number]): QuoteLine => {
  const { priceRequired: _p, fromUser: _f, ...line } = l;
  void _p;
  void _f;
  return line;
};

/** VAT rates the quote builder can hold. A rate outside them would be silently zeroed there, so we refuse it. */
export const unsupportedVat = (priced: PriceResult) => [...new Set(priced.lines.map((l) => l.vat_rate))].filter((r) => !(VAT_RATES as readonly number[]).includes(r));

export function draftQuoteContent(i: DraftQuoteInput): QuoteContent {
  const blocks: QuoteBlock[] = [];
  let n = 0;
  const id = () => `d${++n}`;
  if (!i.surveyLinked) blocks.push({ id: id(), type: 'text', heading: INDICATIVE_QUOTE, body: INDICATIVE_QUOTE_BODY });
  blocks.push({ id: id(), type: 'items', heading: 'Your quote', lines: i.priced.lines.map(asQuoteLine) });

  const included = [i.scope.trim()].filter(Boolean);
  if (i.priced.lines.some((l) => l.priceRequired)) included.push('Some items are still waiting for a price and are marked PRICE REQUIRED. This quote must not be sent until they are priced.');
  blocks.push({ id: id(), type: 'text', heading: 'What is included', body: included.join('\n\n') });

  const design: string[] = [];
  if (i.panelCount != null) design.push(`${i.panelCount} solar panels${i.kwp != null ? `, ${i.kwp} kWp in total` : ''}. The panel layout is indicative and is confirmed at survey.`);
  const notes = i.designIssues.filter((x) => x.severity !== 'info');
  if (notes.length) design.push(`Design points to resolve:\n${notes.map((x) => `- ${x.message}`).join('\n')}`);
  if (design.length) blocks.push({ id: id(), type: 'text', heading: 'System design (indicative)', body: design.join('\n\n') });
  if (i.systemType === 'off-grid') blocks.push({ id: id(), type: 'text', heading: 'Off-grid installation', body: OFF_GRID_BODY });

  return cleanContent({
    intro: `Hi ${i.customerFirstName || 'there'}, thank you for the chance to quote. Here is what we propose for your property, with the price broken down below. If anything is unclear, just reply and we will talk it through.`,
    blocks,
    terms: DEFAULT_TERMS,
  });
}
