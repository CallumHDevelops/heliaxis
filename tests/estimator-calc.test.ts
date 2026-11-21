import { describe, expect, it } from 'vitest';
import { potentialOf, cleanSettings, consumptionFrom, DEFAULT_SETTINGS, estimate, fallbackYield, MONTH_SHARE, type Inputs } from '@/lib/estimator/calc';

const LEGACY = { ...DEFAULT_SETTINGS, homeUsesCostModel: false };
const base: Inputs = { who: 'home', yieldKwhPerKwp: 950, shade: 'none', usage: { kind: 'bill', value: 120 }, daytime: 'some', battery: false, ev: false, heatpump: false };

describe('solar estimator maths', () => {
  it('turns a bill into kWh using the unit rate and standing charge', () => {
    const kwh = consumptionFrom({ kind: 'bill', value: 100 }, DEFAULT_SETTINGS);
    expect(Math.round(kwh)).toBe(Math.round((1200 - 0.548 * 365) / 0.263));
    expect(consumptionFrom({ kind: 'kwh', value: 3800 }, DEFAULT_SETTINGS)).toBe(3800);
  });
  it('sizes in whole panels and keeps a home within 2 to 10 kWp', () => {
    const small = estimate({ ...base, usage: { kind: 'kwh', value: 500 } });
    const big = estimate({ ...base, usage: { kind: 'kwh', value: 40000 } });
    expect(small.kwp).toBeGreaterThanOrEqual(2);
    expect(big.kwp).toBeLessThanOrEqual(10.2);
    expect(small.panels * 0.45).toBeCloseTo(small.kwp, 5);
  });
  it('a battery raises how much is used at home and the saving, and costs more', () => {
    const a = estimate(base, LEGACY);
    const b = estimate({ ...base, battery: true }, LEGACY);
    expect(b.selfPct).toBeGreaterThan(a.selfPct);
    expect(b.saving).toBeGreaterThan(a.saving);
    expect(b.cost).toBeCloseTo(a.cost + 5 * 800, 0);
    expect(b.selfPct).toBeLessThanOrEqual(0.85);
  });
  it('shading and a worse roof both cut what each panel makes, so a bigger system is suggested', () => {
    const good = estimate(base);
    const shaded = estimate({ ...base, shade: 'lots' });
    const north = estimate({ ...base, yieldKwhPerKwp: fallbackYield('north', 'flat') });
    expect(shaded.generation / shaded.kwp).toBeLessThan(good.generation / good.kwp);
    expect(north.generation / north.kwp).toBeLessThan(good.generation / good.kwp);
    expect(north.panels).toBeGreaterThan(good.panels);
  });
  it('gives ordered ranges and a payback in a believable band', () => {
    const e = estimate(base);
    expect(e.savingLow).toBeLessThan(e.saving);
    expect(e.saving).toBeLessThan(e.savingHigh);
    expect(e.paybackLow).toBeLessThan(e.paybackYears);
    expect(e.paybackYears).toBeLessThan(e.paybackHigh);
    expect(e.paybackYears).toBeGreaterThan(3);
    expect(e.paybackYears).toBeLessThan(20);
  });
  it('monthly figures add up to the year, and use PVGIS months when given', () => {
    const e = estimate(base);
    expect(e.monthly.reduce((a, b) => a + b, 0)).toBeCloseTo(e.generation, 3);
    expect(MONTH_SHARE.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    const flat = estimate({ ...base, monthlyPerKwp: Array(12).fill(80) });
    expect(flat.monthly[0]).toBeCloseTo(flat.generation / 12, 3);
  });
  it('flags the network operator application above 3.68 kWp at home', () => {
    expect(estimate({ ...base, usage: { kind: 'kwh', value: 9000 } }).needsG99).toBe(true);
    expect(estimate({ ...base, usage: { kind: 'kwh', value: 2000 } }).needsG99).toBe(false);
  });
  it('rates the roof from the yield per kWp', () => {
    expect(potentialOf(980).suns).toBe(5);
    expect(potentialOf(760).suns).toBe(3);
    expect(potentialOf(500).suns).toBe(1);
  });
  it('keeps settings within range and defaults the rest', () => {
    const s = cleanSettings({ importPence: 9999, exportPence: '', homePerKwp: 1500 });
    expect(s.importPence).toBe(100);
    expect(s.exportPence).toBe(DEFAULT_SETTINGS.exportPence);
    expect(s.homePerKwp).toBe(1500);
  });
  it('a fixed cost makes small systems pay back slower than large ones', () => {
    const small = estimate({ ...base, usage: { kind: 'kwh', value: 2000 } }, LEGACY);
    const large = estimate({ ...base, usage: { kind: 'kwh', value: 6000 } }, LEGACY);
    expect(small.cost).toBeCloseTo(DEFAULT_SETTINGS.homeFixed + small.kwp * DEFAULT_SETTINGS.homePerKwp, 0);
    expect(small.paybackYears).toBeGreaterThan(large.paybackYears);
  });
  it('a bigger system on the same use exports more and uses a smaller share', () => {
    const usage = { kind: 'kwh' as const, value: 3000 };
    const a = estimate({ ...base, usage, maxPanels: 8, sizeMode: 'roof' });
    const b = estimate({ ...base, usage, maxPanels: 20, sizeMode: 'roof', phase: 'three' });
    expect(b.exported).toBeGreaterThan(a.exported);
    expect(b.selfPct).toBeLessThan(a.selfPct);
    expect(b.panels).toBe(20);
  });
  it('cashflow starts at minus the cost and ends at the 25 year net', () => {
    const e = estimate(base);
    expect(e.cashflow).toHaveLength(26);
    expect(e.cashflow[0]).toBeCloseTo(-e.cost, 5);
    expect(e.cashflow[25]).toBeCloseTo(e.net25, 5);
  });
  it('keeps old saved prices as a flat price per kWp', () => {
    expect(cleanSettings({ homePerKwp: 1350 }).homeFixed).toBe(0);
  });
});

describe('packages and their prices', async () => {
  const { estimate, DEFAULT_SETTINGS, cleanSettings, priceFromBands } = await import('@/lib/estimator/calc');
  const bands = [{ panels: 8, price: 6000 }, { panels: 12, price: 8000 }, { panels: 16, price: 10400 }];
  it('prices a panel count from the list, in between and beyond it', () => {
    expect(priceFromBands(bands, 12)).toBe(8000);
    expect(priceFromBands(bands, 10)).toBe(7000);
    expect(priceFromBands(bands, 20)).toBe(12800);
    expect(priceFromBands(bands, 6)).toBe(5000);
    expect(priceFromBands([], 10)).toBeNull();
  });
  it('keeps only sensible packages and sorts their prices', () => {
    const s = cleanSettings({ packages: [{ name: ' Solar only ', kind: 'solar', bands: [{ panels: 12, price: 8000 }, { panels: 8, price: 6000 }, { panels: 0, price: 5 }, { panels: 9, price: -1 }] }, { name: '' }] });
    expect(s.packages).toHaveLength(1);
    expect(s.packages[0].name).toBe('Solar only');
    expect(s.packages[0].bands.map((b) => b.panels)).toEqual([8, 12]);
  });
  const base = { who: 'home' as const, usage: { kind: 'kwh' as const, value: 4000 }, shade: 'none' as const, daytime: 'home' as const, yieldKwhPerKwp: 950, battery: false };
  it('uses the formula with no packages, and the package price list once there is one', () => {
    const f = estimate(base as never, DEFAULT_SETTINGS);
    expect(f.packageName).toBeNull();
    const s = cleanSettings({ packages: [{ name: 'Solar only', kind: 'solar', pricing: 'bands', bands: [{ panels: 4, price: 4000 }, { panels: 40, price: 22000 }] }, { name: 'Solar and battery', kind: 'solar_battery', pricing: 'bands', batteryKwh: 5, bands: [{ panels: 4, price: 7000 }, { panels: 40, price: 30000 }] }] });
    const a = estimate(base as never, s);
    expect(a.packageName).toBe('Solar only');
    expect(a.cost).not.toBe(f.cost);
    const b = estimate({ ...base, battery: true } as never, s);
    expect(b.packageName).toBe('Solar and battery');
    expect(b.batteryKwh).toBe(5);
    expect(b.cost).toBeGreaterThan(a.cost);
  });
});
