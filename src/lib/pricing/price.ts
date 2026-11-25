import { totalsOf, type QuoteLine, type Totals } from '@/lib/quotes/types';

/**
 * Prices a job from the price book and HAP's settings. Pure and deterministic; money is whole pence.
 * Nothing is guessed: an item with no price, a missing labour or scaffolding rate, or a VAT rate that isn't set
 * becomes a "PRICE REQUIRED" line (or an entry in `needs`) so a person sees it. The VAT rate is never hardcoded.
 */

export type PriceBookItem = {
  sku: string;
  category: string;
  make: string;
  model: string;
  unit: string;
  costPence: number | null;
  sellPence: number | null;
  active: boolean;
};

export type VatRule = { default: number | null; byCategory?: Record<string, number> };
export type ScaffoldingSettings = { fixedFeePence: number | null; ratePerM2Pence: number | null; minChargePence: number | null; topLiftM: number | null; endReturnM: number | null; storeyHeightM: number | null };
export type PricingSettings = {
  /** Used to price an item that has a cost but no sell price. Null means: don't, show PRICE REQUIRED instead. */
  markupPct: number | null;
  /** Lines and the job below this margin are warned about. */
  minMarginPct: number | null;
  labourSellDayPence: number | null;
  labourCostDayPence: number | null;
  scaffolding: ScaffoldingSettings;
  vat: { domestic: VatRule; commercial: VatRule };
};

export type CustomerType = 'domestic' | 'commercial';
export type PriceRequest = {
  items: { sku: string; qty: number }[];
  installDays: number;
  customerType: CustomerType;
  scaffolding?: { widthM: number; storeys: number } | null;
};

export type Need = { kind: 'price' | 'vat' | 'labour_rate' | 'scaffolding_rate' | 'unknown_sku' | 'inactive_sku'; what: string };
export type PriceResult = {
  lines: (QuoteLine & { priceRequired?: boolean })[];
  needs: Need[];
  warnings: string[];
  totals: Totals;
  costPence: number;
  /** Profit as a share of the net sell price, or null if nothing is priced. */
  marginPct: number | null;
  /** True only when nothing is missing: every line is priced and has a VAT rate. */
  complete: boolean;
};

export const PRICE_REQUIRED = 'PRICE REQUIRED';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ok = (v: number | null | undefined): v is number => num(v) && v >= 0;

export const vatRateFor = (rule: VatRule, vatCategory: string): number | null => {
  const r = rule.byCategory?.[vatCategory];
  return num(r) ? r : num(rule.default) ? rule.default : null;
};

/** Cost of scaffolding for a face of the given width and number of storeys, from HAP's scaffolding settings. Null if the rates aren't set. */
export function scaffoldingCostPence(s: ScaffoldingSettings, job: { widthM: number; storeys: number }): number | null {
  let cost: number | null = null;
  if (ok(s.fixedFeePence)) cost = s.fixedFeePence;
  else if (ok(s.ratePerM2Pence) && ok(s.storeyHeightM) && ok(s.topLiftM) && ok(s.endReturnM)) {
    const area = (job.widthM + 2 * s.endReturnM) * (job.storeys * s.storeyHeightM + s.topLiftM);
    cost = Math.round(area * s.ratePerM2Pence);
  }
  if (cost == null) return null;
  return ok(s.minChargePence) ? Math.max(cost, s.minChargePence) : cost;
}

/** The sell price each: the price book's own, else cost plus the markup if one is set, else null. */
export function sellPriceOf(item: PriceBookItem, markupPct: number | null): number | null {
  if (ok(item.sellPence)) return item.sellPence;
  if (ok(item.costPence) && num(markupPct)) return Math.round(item.costPence * (1 + markupPct / 100));
  return null;
}

export function priceJob(req: PriceRequest, book: Map<string, PriceBookItem>, settings: PricingSettings): PriceResult {
  const lines: PriceResult['lines'] = [];
  const needs: Need[] = [];
  const warnings: string[] = [];
  const vatRule = settings.vat[req.customerType];
  let n = 0;
  const id = () => `p${++n}`;

  const vatOr0 = (category: string, what: string) => {
    const r = vatRateFor(vatRule, category);
    if (r == null) {
      if (!needs.some((x) => x.kind === 'vat' && x.what.includes(`(${category})`))) needs.push({ kind: 'vat', what: `VAT rate for ${req.customerType} ${what} (${category}) is not set in HAP's pricing settings` });
      return 0;
    }
    return r;
  };

  for (const { sku, qty } of req.items) {
    if (!(qty > 0)) continue;
    const item = book.get(sku);
    if (!item) {
      needs.push({ kind: 'unknown_sku', what: `${sku} is not in the price book` });
      lines.push({ id: id(), description: `${PRICE_REQUIRED}: ${sku} (not in the price book)`, qty, unit_pence: 0, vat_rate: 0, cost_pence: 0, mode: 'manual', markup: 0, priceRequired: true });
      continue;
    }
    const label = `${item.make} ${item.model}`.trim();
    if (!item.active) needs.push({ kind: 'inactive_sku', what: `${label} (${sku}) is marked inactive in the price book` });
    const sell = sellPriceOf(item, settings.markupPct);
    const vat = vatOr0(item.category, label);
    if (sell == null) {
      needs.push({ kind: 'price', what: `${label} (${sku}) has no price in the price book` });
      lines.push({ id: id(), description: `${PRICE_REQUIRED}: ${label}`, detail: sku, qty, unit_pence: 0, vat_rate: vat, cost_pence: item.costPence ?? 0, mode: 'manual', markup: 0, priceRequired: true });
      continue;
    }
    const cost = item.costPence ?? 0;
    if (item.costPence == null) warnings.push(`${label} has no cost in the price book, so its margin can't be checked.`);
    else if (num(settings.minMarginPct) && sell > 0 && ((sell - cost) / sell) * 100 < settings.minMarginPct) warnings.push(`${label} is below the minimum margin of ${settings.minMarginPct}% (${(((sell - cost) / sell) * 100).toFixed(1)}%).`);
    lines.push({ id: id(), description: label, detail: sku, qty, unit_pence: sell, vat_rate: vat, cost_pence: cost, mode: 'manual', markup: 0 });
  }

  // Labour: install days x the day rate.
  if (req.installDays > 0) {
    const vat = vatOr0('labour', 'installation labour');
    if (!ok(settings.labourSellDayPence)) {
      needs.push({ kind: 'labour_rate', what: 'The installation day rate is not set in HAP’s pricing settings' });
      lines.push({ id: id(), description: `${PRICE_REQUIRED}: Installation labour`, detail: `${req.installDays} day${req.installDays === 1 ? '' : 's'}`, qty: req.installDays, unit_pence: 0, vat_rate: vat, cost_pence: 0, mode: 'manual', markup: 0, priceRequired: true });
    } else {
      if (!ok(settings.labourCostDayPence)) warnings.push('The labour cost per day is not set, so the margin shown is overstated.');
      lines.push({ id: id(), description: 'Installation labour', detail: `${req.installDays} day${req.installDays === 1 ? '' : 's'}`, qty: req.installDays, unit_pence: settings.labourSellDayPence, vat_rate: vat, cost_pence: settings.labourCostDayPence ?? 0, mode: 'manual', markup: 0 });
    }
  }

  // Scaffolding, from the settings' own rates.
  if (req.scaffolding) {
    const vat = vatOr0('scaffolding', 'scaffolding');
    const cost = scaffoldingCostPence(settings.scaffolding, req.scaffolding);
    if (cost == null) {
      needs.push({ kind: 'scaffolding_rate', what: 'Scaffolding rates are not set in HAP’s settings (pv_settings › scaffolding)' });
      lines.push({ id: id(), description: `${PRICE_REQUIRED}: Scaffolding`, qty: 1, unit_pence: 0, vat_rate: vat, cost_pence: 0, mode: 'manual', markup: 0, priceRequired: true });
    } else {
      const sell = num(settings.markupPct) ? Math.round(cost * (1 + settings.markupPct / 100)) : cost;
      lines.push({ id: id(), description: 'Scaffolding', qty: 1, unit_pence: sell, vat_rate: vat, cost_pence: cost, mode: 'manual', markup: 0 });
    }
  }

  const totals = totalsOf({ intro: '', terms: '', blocks: [{ id: 'b', type: 'items', heading: '', lines }] });
  const costPence = lines.reduce((sum, l) => sum + Math.round(l.qty * l.cost_pence), 0);
  const marginPct = totals.net > 0 ? Math.round(((totals.net - costPence) / totals.net) * 1000) / 10 : null;
  if (marginPct != null && num(settings.minMarginPct) && marginPct < settings.minMarginPct) warnings.push(`The job margin is ${marginPct}%, below the minimum of ${settings.minMarginPct}%.`);
  return { lines, needs, warnings, totals, costPence, marginPct, complete: needs.length === 0 };
}
