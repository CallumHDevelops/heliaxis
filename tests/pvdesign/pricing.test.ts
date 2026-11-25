import { describe, expect, it } from 'vitest';
import { applyOverrides, priceJob, scaffoldingCostPence, sellPriceOf, vatRateFor, type PriceBookItem, type PricingSettings } from '@/lib/pricing/price';

const item = (o: Partial<PriceBookItem> & { sku: string }): PriceBookItem => ({ category: 'solar', make: 'Make', model: o.sku, unit: 'each', costPence: null, sellPence: null, active: true, ...o });
const BOOK = new Map(
  [
    item({ sku: 'PANEL', category: 'solar', make: 'Acme', model: '400W', costPence: 8000, sellPence: 10000 }),
    item({ sku: 'INV', category: 'inverter', make: 'Acme', model: '6kW Hybrid', costPence: 90000, sellPence: 120000 }),
    item({ sku: 'COSTONLY', category: 'solar', costPence: 5000 }),
    item({ sku: 'NOPRICE', category: 'solar' }),
    item({ sku: 'OLD', category: 'solar', sellPence: 100, costPence: 50, active: false }),
  ].map((i) => [i.sku, i])
);

const SETTINGS: PricingSettings = {
  markupPct: null,
  minMarginPct: 20,
  labourSellDayPence: 45000,
  labourCostDayPence: 30000,
  scaffolding: { fixedFeePence: null, ratePerM2Pence: 1250, minChargePence: 40000, topLiftM: 1, endReturnM: 1, storeyHeightM: 2.6 },
  vat: { domestic: { default: 20, byCategory: { solar: 0, inverter: 0 } }, commercial: { default: 20 } },
};
const base = { installDays: 0, customerType: 'domestic' as const };

describe('vatRateFor', () => {
  it('uses the category rate, else the default, else null', () => {
    expect(vatRateFor({ default: 20, byCategory: { solar: 0 } }, 'solar')).toBe(0);
    expect(vatRateFor({ default: 20, byCategory: { solar: 0 } }, 'labour')).toBe(20);
    expect(vatRateFor({ default: null }, 'labour')).toBeNull();
  });
});

describe('sellPriceOf', () => {
  it('prefers the price book sell price, then cost plus markup, never a guess', () => {
    expect(sellPriceOf(item({ sku: 'a', sellPence: 500, costPence: 100 }), 50)).toBe(500);
    expect(sellPriceOf(item({ sku: 'a', costPence: 1000 }), 25)).toBe(1250);
    expect(sellPriceOf(item({ sku: 'a', costPence: 1000 }), null)).toBeNull();
    expect(sellPriceOf(item({ sku: 'a' }), 25)).toBeNull();
  });
});

describe('scaffoldingCostPence', () => {
  it('works out area x rate, with the minimum charge', () => {
    // width 8 + 2 x 1 = 10 m; height 2 x 2.6 + 1 = 6.2 m; 62 m2 x £12.50 = £775
    expect(scaffoldingCostPence(SETTINGS.scaffolding, { widthM: 8, storeys: 2 })).toBe(77500);
    // 1 storey, 4 m: 6 x 3.6 = 21.6 m2 x £12.50 = £270, raised to the £400 minimum
    expect(scaffoldingCostPence(SETTINGS.scaffolding, { widthM: 4, storeys: 1 })).toBe(40000);
  });
  it('a fixed fee wins; no rates means null', () => {
    expect(scaffoldingCostPence({ ...SETTINGS.scaffolding, fixedFeePence: 60000 }, { widthM: 20, storeys: 3 })).toBe(60000);
    expect(scaffoldingCostPence({ ...SETTINGS.scaffolding, ratePerM2Pence: null }, { widthM: 8, storeys: 2 })).toBeNull();
  });
});

describe('priceJob', () => {
  it('prices items, labour and scaffolding, and totals them with the settings VAT', () => {
    const r = priceJob({ ...base, items: [{ sku: 'PANEL', qty: 10 }, { sku: 'INV', qty: 1 }], installDays: 2, scaffolding: { widthM: 8, storeys: 2 } }, BOOK, SETTINGS);
    expect(r.complete).toBe(true);
    expect(r.lines.map((l) => [l.description, l.qty, l.unit_pence])).toEqual([
      ['Acme 400W', 10, 10000],
      ['Acme 6kW Hybrid', 1, 120000],
      ['Installation labour', 2, 45000],
      ['Scaffolding', 1, 77500],
    ]);
    // net = 100000 + 120000 + 90000 + 77500
    expect(r.totals.net).toBe(387500);
    // VAT: solar and inverter 0%, labour and scaffolding 20% (domestic default): (90000 + 77500) x 20%
    expect(r.totals.vat).toBe(33500);
    expect(r.totals.gross).toBe(421000);
    expect(r.costPence).toBe(80000 + 90000 + 60000 + 77500);
  });

  it('uses the commercial VAT rules for a commercial customer', () => {
    const r = priceJob({ ...base, customerType: 'commercial', items: [{ sku: 'PANEL', qty: 10 }] }, BOOK, SETTINGS);
    expect(r.totals.vat).toBe(20000);
  });

  it('inserts a PRICE REQUIRED line for an unpriced item and says so', () => {
    const r = priceJob({ ...base, items: [{ sku: 'NOPRICE', qty: 2 }] }, BOOK, SETTINGS);
    expect(r.complete).toBe(false);
    expect(r.lines[0].description).toMatch(/^PRICE REQUIRED/);
    expect(r.lines[0].unit_pence).toBe(0);
    expect(r.needs[0].kind).toBe('price');
  });

  it('does not price a cost-only item unless a markup is set', () => {
    expect(priceJob({ ...base, items: [{ sku: 'COSTONLY', qty: 1 }] }, BOOK, SETTINGS).complete).toBe(false);
    const r = priceJob({ ...base, items: [{ sku: 'COSTONLY', qty: 1 }] }, BOOK, { ...SETTINGS, markupPct: 40 });
    expect(r.lines[0].unit_pence).toBe(7000);
    expect(r.complete).toBe(true);
  });

  it('flags an unknown SKU and an inactive product', () => {
    const r = priceJob({ ...base, items: [{ sku: 'NOPE', qty: 1 }, { sku: 'OLD', qty: 1 }] }, BOOK, SETTINGS);
    expect(r.needs.map((n) => n.kind).sort()).toEqual(['inactive_sku', 'unknown_sku']);
    expect(r.complete).toBe(false);
  });

  it('never invents a labour or scaffolding rate', () => {
    const s = { ...SETTINGS, labourSellDayPence: null, scaffolding: { ...SETTINGS.scaffolding, ratePerM2Pence: null } };
    const r = priceJob({ ...base, items: [], installDays: 2, scaffolding: { widthM: 8, storeys: 2 } }, BOOK, s);
    expect(r.needs.map((n) => n.kind).sort()).toEqual(['labour_rate', 'scaffolding_rate']);
    expect(r.lines.every((l) => l.priceRequired)).toBe(true);
    expect(r.totals.gross).toBe(0);
  });

  it('never hardcodes VAT: an unset rate is reported, not assumed', () => {
    const s: PricingSettings = { ...SETTINGS, vat: { domestic: { default: null }, commercial: { default: null } } };
    const r = priceJob({ ...base, items: [{ sku: 'PANEL', qty: 1 }] }, BOOK, s);
    expect(r.needs.some((n) => n.kind === 'vat')).toBe(true);
    expect(r.complete).toBe(false);
  });

  it('warns below the minimum margin and when the cost is unknown', () => {
    const book = new Map([['T', item({ sku: 'T', costPence: 9500, sellPence: 10000 })], ['U', item({ sku: 'U', sellPence: 5000 })]]);
    const r = priceJob({ ...base, items: [{ sku: 'T', qty: 1 }, { sku: 'U', qty: 1 }] }, book, SETTINGS);
    expect(r.warnings.some((w) => /below the minimum margin/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /no cost/.test(w))).toBe(true);
  });

  it('prices items the person gave us, and says so', () => {
    const r = priceJob({ ...base, items: [], customItems: [{ description: '4G dongle', qty: 1, unitPence: 8000, costPence: 5000, category: 'comms' }] }, BOOK, SETTINGS);
    expect(r.lines[0]).toMatchObject({ description: '4G dongle', unit_pence: 8000, fromUser: true, vat_rate: 20 });
    expect(r.complete).toBe(true);
    expect(r.warnings.some((w) => /you gave me/.test(w))).toBe(true);
  });
  it('a custom item with no usable price is still PRICE REQUIRED', () => {
    const r = priceJob({ ...base, items: [], customItems: [{ description: 'Mystery box', qty: 1, unitPence: -1, costPence: null, category: 'other' }] }, BOOK, SETTINGS);
    expect(r.complete).toBe(false);
    expect(r.lines[0].description).toMatch(/^PRICE REQUIRED/);
  });
});

describe('applyOverrides: what the person tells us fills gaps, never replaces HAP', () => {
  const empty: PricingSettings = { ...SETTINGS, labourSellDayPence: null, scaffolding: { ...SETTINGS.scaffolding, ratePerM2Pence: null }, vat: { domestic: { default: null }, commercial: { default: null } } };
  it('fills a missing labour rate, scaffolding price and VAT rate', () => {
    const s = applyOverrides(empty, { labourSellDayPence: 50000, scaffoldingPence: 90000, vatPercent: 20 });
    expect(s.labourSellDayPence).toBe(50000);
    expect(scaffoldingCostPence(s.scaffolding, { widthM: 8, storeys: 2 })).toBe(90000);
    expect(s.vat.domestic.default).toBe(20);
    const r = priceJob({ ...base, items: [], installDays: 2, scaffolding: { widthM: 8, storeys: 2 } }, BOOK, s);
    expect(r.complete).toBe(true);
    expect(r.totals.net).toBe(100000 + 90000);
  });
  it('does not override figures HAP already has', () => {
    const s = applyOverrides(SETTINGS, { labourSellDayPence: 1, scaffoldingPence: 1, vatPercent: 5 });
    expect(s.labourSellDayPence).toBe(45000);
    expect(s.scaffolding.fixedFeePence).toBeNull();
    expect(s.vat.domestic.default).toBe(20);
  });
});

describe('priceJob (continued)', () => {
  it('ignores zero or negative quantities', () => {
    expect(priceJob({ ...base, items: [{ sku: 'PANEL', qty: 0 }, { sku: 'PANEL', qty: -2 }] }, BOOK, SETTINGS).lines).toHaveLength(0);
  });
});
