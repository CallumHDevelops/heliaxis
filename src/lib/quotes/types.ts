/** The quote builder's content and its money. Pure: safe for the server, the browser and tests. Money is whole pence. */

/**
 * One priced line. `cost_pence` is what it costs us each (never shown to the customer). `mode` says how the sell price is
 * worked out: 'pct' (cost plus `markup` per cent), 'gbp' (cost plus `markup` pence), or 'manual' (the price typed in).
 * `unit_pence` is always the sell price each, kept up to date from the cost and markup, so the quote, the PDF and the
 * customer's totals only ever read it. `internal` lines cost us something but are not printed on the quote.
 */
export type PriceMode = 'pct' | 'gbp' | 'manual';
export type QuoteLine = { id: string; description: string; detail?: string; qty: number; unit_pence: number; vat_rate: number; cost_pence: number; mode: PriceMode; markup: number; internal?: boolean; text?: boolean };
export type QuoteImage = { path: string; caption: string };
export type QuoteFile = { library_id: string; name: string };

export type QuoteBlock =
  | { id: string; type: 'text'; heading: string; body: string }
  | { id: string; type: 'items'; heading: string; lines: QuoteLine[] }
  | { id: string; type: 'images'; heading: string; images: QuoteImage[] }
  | { id: string; type: 'datasheets'; heading: string; files: QuoteFile[] };

/**
 * One system option read from an uploaded design proposal (OpenSolar): the figures the cover page and the writing use.
 * Every field is optional: only what the proposal printed is kept. Savings and payback are the designer's own assumptions, so
 * they only ever print when `showFinancials` is on.
 */
export type ProposalOption = {
  name?: string;
  systemKwp?: number;
  panelCount?: number;
  panelWatts?: number;
  panelBrand?: string;
  panelModel?: string;
  panelProductWarrantyYears?: number;
  panelPerformanceWarrantyYears?: number;
  inverterBrand?: string;
  inverterModel?: string;
  inverterCount?: number;
  inverterKw?: number;
  inverterWarrantyYears?: number;
  batteryBrand?: string;
  batteryModel?: string;
  batteryModules?: number;
  batteryUsableKwh?: number;
  batteryWarrantyYears?: number;
  annualGenerationKwh?: number;
  annualSavingsGbp?: number;
  paybackText?: string;
  selfSufficiencyPct?: number;
};
export type QuoteProposal = { file: string; options: ProposalOption[]; chosen: number; showFinancials: boolean };

/** `terms` always print at the bottom of the quote, after everything else. */
export type QuoteContent = { intro: string; blocks: QuoteBlock[]; terms: string; proposal?: QuoteProposal };

const NUM_KEYS = ['systemKwp', 'panelCount', 'panelWatts', 'panelProductWarrantyYears', 'panelPerformanceWarrantyYears', 'inverterCount', 'inverterKw', 'inverterWarrantyYears', 'batteryModules', 'batteryUsableKwh', 'batteryWarrantyYears', 'annualGenerationKwh', 'annualSavingsGbp', 'selfSufficiencyPct'] as const;
const STR_KEYS = ['name', 'panelBrand', 'panelModel', 'inverterBrand', 'inverterModel', 'batteryBrand', 'batteryModel', 'paybackText'] as const;

/** A proposal option from a request or the database, with only sensible values kept. */
export function cleanOption(v: unknown): ProposalOption {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const k of NUM_KEYS) {
    const n = Number(o[k]);
    if (o[k] != null && o[k] !== '' && Number.isFinite(n) && n >= 0 && n < 10_000_000) out[k] = Math.round(n * 100) / 100;
  }
  for (const k of STR_KEYS) {
    const t = typeof o[k] === 'string' ? String(o[k]).replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (t) out[k] = t;
  }
  return out as ProposalOption;
}

/** VAT rates the builder offers: 0% (domestic solar and batteries to 2027), 5% and 20%. */
export const VAT_RATES = [0, 5, 20] as const;

export const newId = () => 'b' + Math.random().toString(36).slice(2, 10);

export const emptyLine = (from?: Pick<QuoteLine, 'mode' | 'markup' | 'vat_rate'>): QuoteLine => ({
  id: newId(), description: '', qty: 1, unit_pence: 0, vat_rate: from?.vat_rate ?? 0, cost_pence: 0, mode: from?.mode ?? 'pct', markup: from?.mode === 'manual' ? 0 : (from?.markup ?? 0),
});

/** A free-text line between items: printed as plain text in the Item column, with no quantity or price (a heading, a note). */
export const emptyText = (): QuoteLine => ({ id: newId(), description: '', qty: 0, unit_pence: 0, vat_rate: 0, cost_pence: 0, mode: 'manual', markup: 0, text: true });

/** The sell price each, from the cost and the way this line is priced. */
export function sellUnit(l: Pick<QuoteLine, 'mode' | 'cost_pence' | 'markup' | 'unit_pence'>): number {
  const cost = Number(l.cost_pence) || 0;
  const m = Number(l.markup) || 0;
  if (l.mode === 'pct') return Math.round(cost * (1 + m / 100));
  if (l.mode === 'gbp') return Math.round(cost + m);
  return Math.round(Number(l.unit_pence) || 0);
}
/** The line with its sell price brought up to date from its cost and markup. */
export const priced = (l: QuoteLine): QuoteLine => ({ ...l, unit_pence: sellUnit(l) });

/** What the customer is charged for the line, before VAT (nothing for an internal line). */
export const lineNet = (l: Pick<QuoteLine, 'qty' | 'unit_pence'> & { internal?: boolean }) => (l.internal ? 0 : Math.round((Number(l.qty) || 0) * (Number(l.unit_pence) || 0)));
/** What the line costs us in total. */
export const lineCost = (l: Pick<QuoteLine, 'qty' | 'cost_pence'>) => Math.round((Number(l.qty) || 0) * (Number(l.cost_pence) || 0));
export const lineProfit = (l: QuoteLine) => lineNet(l) - lineCost(l);
export const lineVat = (l: QuoteLine) => Math.round((lineNet(l) * (Number(l.vat_rate) || 0)) / 100);

export type Totals = { net: number; vat: number; gross: number; byRate: { rate: number; net: number; vat: number }[] };

export function totalsOf(content: QuoteContent): Totals {
  const byRate = new Map<number, { net: number; vat: number }>();
  for (const b of content.blocks) {
    if (b.type !== 'items') continue;
    for (const l of b.lines) {
      const r = Number(l.vat_rate) || 0;
      const cur = byRate.get(r) ?? { net: 0, vat: 0 };
      cur.net += lineNet(l);
      cur.vat += lineVat(l);
      byRate.set(r, cur);
    }
  }
  const rows = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, ...v }));
  const net = rows.reduce((a, r) => a + r.net, 0);
  const vat = rows.reduce((a, r) => a + r.vat, 0);
  return { net, vat, gross: net + vat, byRate: rows };
}

export type Profit = {
  /** What we charge, before VAT (VAT is passed on, so it is not profit). */
  sell: number;
  cost: number;
  profit: number;
  /** Profit as a share of the sell price (null with nothing sold). */
  marginPct: number | null;
  /** Profit as a share of the cost (null with no cost). */
  markupPct: number | null;
  /** Priced lines with no cost entered: the profit is overstated until they have one. */
  uncosted: number;
};

/** The job's profit, from the lines' costs. For us only: never put this in anything the customer can see. */
export function profitOf(content: QuoteContent): Profit {
  let sell = 0;
  let cost = 0;
  let uncosted = 0;
  for (const b of content.blocks) {
    if (b.type !== 'items') continue;
    for (const l of b.lines) {
      sell += lineNet(l);
      cost += lineCost(l);
      if (!l.internal && lineNet(l) > 0 && !(Number(l.cost_pence) > 0)) uncosted++;
    }
  }
  const profit = sell - cost;
  return { sell, cost, profit, marginPct: sell > 0 ? (profit / sell) * 100 : null, markupPct: cost > 0 ? (profit / cost) * 100 : null, uncosted };
}

export const pct = (n: number | null) => (n === null ? '–' : `${(Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')}%`);

export const money = (pence: number) => {
  const neg = pence < 0;
  const p = Math.abs(Math.round(pence));
  const s = `£${Math.floor(p / 100).toLocaleString('en-GB')}.${String(p % 100).padStart(2, '0')}`;
  return neg ? `−${s}` : s;
};

/** "1,250.5" or "£1,250" typed in a box → pence (0 if it isn't a number). */
export function penceFromText(s: string): number {
  const n = parseFloat(String(s).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const textFromPence = (p: number) => (p ? (p / 100).toFixed(2).replace(/\.00$/, '') : '');

export const DEFAULT_TERMS = [
  '1. Quote and acceptance. This quote is valid until the date shown above. It is based on the information you have given us and, where we have visited, on what we saw at the property. Once you accept it, these terms and conditions apply to all the work and equipment supplied under it, and together they form the agreement between you and Heliaxis.',
  '2. What is included. The price covers only the work and equipment described in this quote, including the section headed What is included. Anything not described is not included. Any change you ask for, or any extra work found to be necessary, will be explained and priced in writing and agreed with you before we carry it out.',
  '3. Positions and design. Before installation we agree with you the positions of the equipment, for example the panels, inverter, battery, heat pump, charger and cable routes, and any design or survey sign-off we provide. We install to the specification and positions agreed. Please check them carefully: moving equipment after it has been installed in the agreed position is a change to the work and will be charged. We site equipment in line with the manufacturer’s instructions and the regulations that apply, including those for fire routes, escape routes and ventilation, and we will tell you before work starts if a position would not comply and cannot be used.',
  '4. Existing installation and property. We are not responsible for any electrical or mechanical fault, defect or non-compliance that already exists at the property, including existing wiring, consumer unit and earthing, heating and hot water systems, roof structure and coverings, and drainage. If we find a problem that affects the work or its safety, we will tell you, and extra work may be needed, which we will agree with you first. We may decline to connect or switch on equipment if doing so would be unsafe.',
  '5. Maintenance. We are not responsible for the maintenance, repair or servicing of your existing systems and equipment, or of anything we have not supplied. You are responsible for the upkeep of your property and for following the maintenance guidance supplied with the equipment. Maintenance or servicing of the new equipment is included only where this quote says so.',
  '6. Access and site. You will make sure we can reach the work area safely, with clear working space and, where needed, power, water and parking. We are not responsible for hidden services or unforeseen conditions, such as asbestos, structural defects or concealed pipes and cables. If we find any, work may stop and any extra cost will be agreed with you first.',
  '7. Regulations. Our work is carried out to BS 7671 and the other standards and regulations that apply to it. Where an installation needs the approval of, or notification to, your distribution network operator, we will tell you what is needed and, where it forms part of our work, submit it. The operator’s decision can affect the date or the size of system allowed.',
  '8. Estimates. Figures for generation, savings and payback are estimates, not guarantees. They depend on weather, shade, how you use electricity and energy prices, none of which we control.',
  '9. Price and payment. Prices include VAT at the rate shown against each item. Any deposit shown is payable once you have accepted this quote, and the balance as set out in our invoices. Goods remain our property until they have been paid for in full.',
  '10. Cancellation. If you are a consumer, you can cancel within 14 days of accepting this quote by telling us in writing. If you ask us to start work within that period, you will pay for the work done and the goods ordered or fitted up to the point you cancel.',
  '11. Warranties. The equipment carries the manufacturer’s warranty set out in its documentation. Any warranty on our workmanship is as stated in writing by us. Warranties do not cover faults caused by misuse, lack of maintenance, changes made by others or events outside our control.',
  '12. Delays. Dates are estimates. We are not responsible for delay caused by weather, supply of equipment, network operator timescales or anything else outside our reasonable control.',
  '13. Liability. Nothing in this quote limits our liability for death or personal injury caused by our negligence, for fraud, or for anything that cannot be limited by law. Otherwise we are not liable for indirect or consequential loss, and our total liability for any one job is limited to the price you pay for it.',
  '14. Law. This agreement is governed by the law of England and Wales.',
  'By accepting this quote you confirm that you have read these terms and conditions and agree to them.',
].join('\n\n');

/** What a new quote starts with: an intro to edit, one list of items, a "what's included" text and the terms. */
export function starterContent(first: string): QuoteContent {
  return {
    intro: `Hi ${first || 'there'}, thank you for the chance to quote. Here is what we propose for your property, with the price broken down below. If anything is unclear, just reply and we will talk it through.`,
    blocks: [
      { id: newId(), type: 'items', heading: 'Your quote', lines: [emptyLine()] },
      { id: newId(), type: 'text', heading: 'What is included', body: '' },
    ],
    terms: DEFAULT_TERMS,
  };
}

/** A content object from the database or a request, made safe to use (unknown shapes dropped). */
export function cleanContent(v: unknown): QuoteContent {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<QuoteContent>;
  const str = (x: unknown, max: number) => String(x ?? '').slice(0, max);
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const blocks: QuoteBlock[] = [];
  for (const raw of Array.isArray(o.blocks) ? o.blocks.slice(0, 40) : []) {
    const b = raw as Record<string, unknown>;
    const id = str(b.id, 24) || newId();
    const heading = str(b.heading, 120);
    if (b.type === 'text') blocks.push({ id, type: 'text', heading, body: str(b.body, 8000) });
    else if (b.type === 'items')
      blocks.push({
        id,
        type: 'items',
        heading,
        lines: (Array.isArray(b.lines) ? b.lines : []).slice(0, 80).map((l: Record<string, unknown>) => {
          const mode: PriceMode = l.mode === 'pct' || l.mode === 'gbp' || l.mode === 'manual' ? l.mode : 'manual';
          const line: QuoteLine = {
            id: str(l.id, 24) || newId(),
            description: str(l.description, 300),
            detail: str(l.detail, 600) || undefined,
            qty: Math.max(0, Math.min(100000, num(l.qty))),
            unit_pence: Math.max(-100_000_000, Math.min(1_000_000_000, Math.round(num(l.unit_pence)))),
            vat_rate: (VAT_RATES as readonly number[]).includes(num(l.vat_rate)) ? num(l.vat_rate) : 0,
            cost_pence: Math.max(0, Math.min(1_000_000_000, Math.round(num(l.cost_pence)))),
            mode,
            markup: Math.max(-100, Math.min(1_000_000_000, num(l.markup))),
            ...(l.internal === true ? { internal: true } : {}),
            ...(l.text === true ? { text: true } : {}),
          };
          // A text line carries no money at all.
          if (line.text) return { ...line, qty: 0, unit_pence: 0, cost_pence: 0, markup: 0, vat_rate: 0, mode: 'manual' as const, internal: undefined };
          // The sell price is worked out here too, so what is saved and sent can never disagree with the cost and markup.
          return priced(line);
        }),
      });
    else if (b.type === 'images')
      blocks.push({
        id,
        type: 'images',
        heading,
        images: (Array.isArray(b.images) ? b.images : [])
          .slice(0, 12)
          .map((i: Record<string, unknown>) => ({ path: str(i.path, 300), caption: str(i.caption, 200) }))
          .filter((i) => i.path.startsWith('quotes/') && !i.path.includes('..')),
      });
    else if (b.type === 'datasheets')
      blocks.push({
        id,
        type: 'datasheets',
        heading,
        files: (Array.isArray(b.files) ? b.files : [])
          .slice(0, 20)
          .map((f: Record<string, unknown>) => ({ library_id: str(f.library_id, 40), name: str(f.name, 200) }))
          .filter((f) => /^[0-9a-f-]{36}$/i.test(f.library_id)),
      });
  }
  // A quote made before terms had their own place: its "Terms" text section moves to the bottom.
  let terms = typeof o.terms === 'string' ? str(o.terms, 8000) : null;
  if (terms === null) {
    const i = blocks.findIndex((b) => b.type === 'text' && /^terms/i.test(b.heading.trim()));
    if (i >= 0) {
      const b = blocks[i];
      terms = b.type === 'text' ? b.body : '';
      blocks.splice(i, 1);
    } else terms = DEFAULT_TERMS;
  }
  const pr = o.proposal as Partial<QuoteProposal> | undefined;
  const options = Array.isArray(pr?.options) ? pr!.options.slice(0, 4).map(cleanOption).filter((x) => Object.keys(x).length) : [];
  const proposal: QuoteProposal | undefined = options.length ? { file: str(pr?.file, 160), options, chosen: Math.min(Math.max(0, Math.round(Number(pr?.chosen) || 0)), options.length - 1), showFinancials: pr?.showFinancials === true } : undefined;
  return { intro: str(o.intro, 6000), blocks, terms, ...(proposal ? { proposal } : {}) };
}
