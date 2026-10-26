import { describe, expect, it } from 'vitest';
import { potentialOf, cleanSettings, consumptionFrom, DEFAULT_SETTINGS, estimate, fallbackYield, MONTH_SHARE, type Inputs } from '@/lib/estimator/calc';

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
    const a = estimate(base);
    const b = estimate({ ...base, battery: true });
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
    const small = estimate({ ...base, usage: { kind: 'kwh', value: 2000 } });
    const large = estimate({ ...base, usage: { kind: 'kwh', value: 6000 } });
    expect(small.cost).toBeCloseTo(DEFAULT_SETTINGS.homeFixed + small.kwp * DEFAULT_SETTINGS.homePerKwp, 0);
    expect(small.paybackYears).toBeGreaterThan(large.paybackYears);
  });
  it('a bigger system on the same use exports more and uses a smaller share', () => {
    const usage = { kind: 'kwh' as const, value: 3000 };
    const a = estimate({ ...base, usage, maxPanels: 8, sizeMode: 'roof' });
    const b = estimate({ ...base, usage, maxPanels: 20, sizeMode: 'roof' });
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
