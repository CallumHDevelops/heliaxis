import { describe, expect, it } from 'vitest';
import { irr, monthlyExportKwh, paybackWords, recalc, type Basis, type Tariff } from '@/lib/quotes/roi';

// Tudor Gardens, option 1: the design software's figures.
const THEIRS: Tariff = { mode: 'tou', flatPence: 32, dayPence: 32, eveningPence: 32, nightPence: 60, standingPencePerDay: 0, exportPence: 15, risePct: 7 };
const BASIS: Basis = { generationKwh: 4330, consumptionKwh: 3500, selfPvKwh: 1266, selfWithBatteryKwh: 2468, hasBattery: true, degradationPct: 0.4, discountPct: 6.75, years: 20, priceGbp: 12330, proposalSavingGbp: 962, proposalTariff: THEIRS };

describe('recalculating a proposal with your own prices', () => {
  it('gives the proposal’s own year-one saving at the proposal’s own prices', () => {
    const r = recalc(BASIS, THEIRS);
    expect(r.matched).toBe(true);
    expect(Math.round(r.yearOneGbp)).toBe(962);
  });
  it('lands close to the design software’s 20-year picture with the same prices', () => {
    const r = recalc(BASIS, THEIRS);
    // The proposal: net saving £26,603, payback 9 years 6 months, return 216%, rate of return 11.1%.
    expect(r.netSavingsGbp).toBeGreaterThan(26603 * 0.9);
    expect(r.netSavingsGbp).toBeLessThan(26603 * 1.05);
    expect(r.paybackYears).toBeGreaterThan(9);
    expect(r.paybackYears).toBeLessThan(10.3);
    expect(r.irrPct).toBeGreaterThan(10);
    expect(r.irrPct).toBeLessThan(12);
  });
  it('saves more when electricity costs more, and less when it costs less', () => {
    const dearer = recalc(BASIS, { ...THEIRS, mode: 'flat', flatPence: 40 });
    const cheaper = recalc(BASIS, { ...THEIRS, mode: 'flat', flatPence: 20 });
    const same = recalc(BASIS, { ...THEIRS, mode: 'flat', flatPence: 32 });
    expect(dearer.yearOneGbp).toBeGreaterThan(same.yearOneGbp);
    expect(cheaper.yearOneGbp).toBeLessThan(same.yearOneGbp);
    expect(dearer.paybackYears!).toBeLessThan(cheaper.paybackYears!);
  });
  it('values what the battery moves at the evening rate of a time-of-use tariff', () => {
    const low = recalc(BASIS, { ...THEIRS, eveningPence: 20 });
    const high = recalc(BASIS, { ...THEIRS, eveningPence: 50 });
    expect(high.yearOneGbp).toBeGreaterThan(low.yearOneGbp);
  });
  it('the standing charge changes the bills but not the saving', () => {
    const a = recalc(BASIS, { ...THEIRS, standingPencePerDay: 0 });
    const b = recalc(BASIS, { ...THEIRS, standingPencePerDay: 60 });
    expect(b.yearOneGbp).toBeCloseTo(a.yearOneGbp, 6);
    expect(b.billBeforeGbp - a.billBeforeGbp).toBeCloseTo(219, 0);
    expect(b.billAfterGbp - a.billAfterGbp).toBeCloseTo(219, 0);
  });
  it('without a battery, only what the panels use directly counts as bought less', () => {
    const r = recalc({ ...BASIS, hasBattery: false, selfWithBatteryKwh: 1266, proposalSavingGbp: undefined, proposalTariff: undefined }, { ...THEIRS, mode: 'flat', flatPence: 30 });
    expect(r.matched).toBe(false);
    expect(r.yearOneGbp).toBeCloseTo((1266 * 30 + (4330 - 1266) * 15) / 100, 6);
  });
  it('finds a rate of return and writes the payback in words', () => {
    expect(irr([-1000, 600, 600])).toBeCloseTo(13.07, 1);
    expect(paybackWords(9.5)).toBe('9 years 6 months');
    expect(paybackWords(1)).toBe('1 year');
    expect(paybackWords(null)).toBe('Not within the period');
  });
  it('spreads the year’s export over the months that make more than the home uses', () => {
    const gen = [45, 123, 346, 479, 630, 662, 662, 571, 407, 258, 101, 46];
    const use = [350, 341, 339, 289, 257, 244, 236, 232, 255, 284, 324, 349];
    const m = monthlyExportKwh(gen, use, 1862);
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(1862, 6);
    expect(m[0]).toBe(0);
    expect(m[11]).toBe(0);
    expect(m[5]).toBeGreaterThan(m[3]);
    expect(monthlyExportKwh(gen, use, 0).every((x) => x === 0)).toBe(true);
  });
});
