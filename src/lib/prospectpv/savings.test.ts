import { describe, expect, it } from 'vitest';
import { calculateSavings, maxExtraModules, type SavingsConfig, type SavingsInputs } from './savings';
import { SPEC_COEFFICIENTS } from './settings';

const config: SavingsConfig = {
  generationKwh: 4800,
  segRate: 0.15,
  offPeakSpread: 0.15,
  standingPerYear: 200,
  coefficients: SPEC_COEFFICIENTS,
};
const typical: SavingsInputs = { usageKwh: 3500, monthlyBill: 120, homePattern: 'some', batteryKwh: 10, diverter: false };
const price = { packagePrice: 9000, extraModules: 0, modulePrice: 2000, extrasPrices: [] };

/**
 * Independent oracle: the calculator logic from design-reference/Landing2.dc.html,
 * which is the spec 7.3 formula with the coefficients inlined.
 */
function designReference(i: SavingsInputs, G: number, seg: number, spread: number, standing: number) {
  const unit = Math.max(0.12, (i.monthlyBill * 12 - standing) / i.usageKwh);
  const homeAdj = i.homePattern === 'all' ? 0.1 : i.homePattern === 'out' ? -0.1 : 0;
  const selfFrac = Math.min(0.9, Math.max(0.25, 0.35 + i.batteryKwh * 0.03 + homeAdj));
  const selfUse = Math.min(i.usageKwh * 0.85, G * selfFrac);
  const exportK = Math.max(0, G - selfUse);
  const divSave = i.diverter ? exportK * 0.2 * Math.max(0, unit - seg) : 0;
  const exportEarn = (exportK - (i.diverter ? exportK * 0.2 : 0)) * seg;
  const tariff = Math.min(i.batteryKwh * 0.9 * 250, Math.max(0, i.usageKwh - selfUse)) * spread;
  const billSave = selfUse * unit + tariff + divSave;
  return { annual: billSave + exportEarn, newBill: Math.max(0, (i.monthlyBill * 12 - billSave) / 12), exportEarn };
}

describe('calculateSavings', () => {
  it('matches a hand-worked typical home', () => {
    const r = calculateSavings(typical, config, price);
    expect(r.unitRate).toBeCloseTo(1240 / 3500, 10);
    expect(r.selfUseFraction).toBeCloseTo(0.65, 10);
    expect(r.selfUseKwh).toBeCloseTo(2975, 10); // capped at 85% of usage
    expect(r.exportKwh).toBeCloseTo(1825, 10);
    expect(r.tariffSaving).toBeCloseTo(525 * 0.15, 10);
    expect(r.billSaving).toBeCloseTo(1054 + 78.75, 10);
    expect(r.exportEarnings).toBeCloseTo(273.75, 10);
    expect(r.annualSaving).toBeCloseTo(1406.5, 10);
    expect(r.newMonthlyBill).toBeCloseTo((1440 - 1132.75) / 12, 10);
    expect(r.totalPrice).toBe(9000);
    expect(r.paybackYears).toBeCloseTo(9000 / 1406.5, 10);
  });

  it('matches the design reference calculator across the input space (cap off)', () => {
    const uncapped = { ...config, coefficients: { ...SPEC_COEFFICIENTS, cap_saving_at_bill: false } };
    for (const usageKwh of [1500, 2700, 3500, 6000, 10000])
      for (const monthlyBill of [30, 80, 120, 250, 400])
        for (const homePattern of ['out', 'some', 'all'] as const)
          for (const batteryKwh of [0, 5, 10, 20])
            for (const diverter of [false, true]) {
              const i = { usageKwh, monthlyBill, homePattern, batteryKwh, diverter };
              const r = calculateSavings(i, uncapped, price);
              const ref = designReference(i, 4800, 0.15, 0.15, 200);
              expect(r.annualSaving).toBeCloseTo(ref.annual, 8);
              expect(r.newMonthlyBill).toBeCloseTo(ref.newBill, 8);
              expect(r.exportEarnings).toBeCloseTo(ref.exportEarn, 8);
            }
  });

  it('agrees with the design reference whenever the bill cap does not bind', () => {
    const r = calculateSavings(typical, config, price);
    const ref = designReference(typical, 4800, 0.15, 0.15, 200);
    expect(r.annualSaving).toBeCloseTo(ref.annual, 10);
  });

  describe('edge cases', () => {
    it('zero usage: no NaN, everything is exported, no bill saving', () => {
      const r = calculateSavings({ ...typical, usageKwh: 0 }, config, price);
      for (const v of Object.values(r)) if (v !== null) expect(Number.isFinite(v)).toBe(true);
      expect(r.unitRate).toBe(0.12);
      expect(r.selfUseKwh).toBe(0);
      expect(r.exportKwh).toBe(4800);
      expect(r.billSaving).toBe(0);
      expect(r.exportEarnings).toBeCloseTo(720, 10);
      expect(r.annualSaving).toBeCloseTo(720, 10);
    });

    it('huge bill: finite results, saving never exceeds the bill, new bill not negative', () => {
      const r = calculateSavings({ ...typical, usageKwh: 1500, monthlyBill: 400 }, config, price);
      expect(r.unitRate).toBeCloseTo((4800 - 200) / 1500, 10);
      expect(r.billSaving).toBeLessThanOrEqual(4800);
      expect(r.newMonthlyBill).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.paybackYears!)).toBe(true);
    });

    it('bill cap binds when the formula would exceed the bill', () => {
      // Small bill, big generation, big battery: tariff + self-use saving > bill.
      const i = { usageKwh: 10000, monthlyBill: 30, homePattern: 'all' as const, batteryKwh: 20, diverter: true };
      const capped = calculateSavings(i, { ...config, generationKwh: 9000 }, price);
      const uncapped = calculateSavings(
        i,
        { ...config, generationKwh: 9000, coefficients: { ...SPEC_COEFFICIENTS, cap_saving_at_bill: false } },
        price,
      );
      expect(uncapped.billSaving).toBeGreaterThan(360);
      expect(capped.billSaving).toBe(360);
      expect(capped.newMonthlyBill).toBe(0);
    });

    it('no battery: self-use fraction is the base 35% and there is no tariff saving', () => {
      const r = calculateSavings({ ...typical, batteryKwh: 0 }, config, price);
      expect(r.selfUseFraction).toBeCloseTo(0.35, 10);
      expect(r.selfUseKwh).toBeCloseTo(4800 * 0.35, 10);
      expect(r.tariffSaving).toBe(0);
    });

    it('bill below the standing charge falls back to the floor unit rate', () => {
      const r = calculateSavings({ ...typical, monthlyBill: 10 }, config, price);
      expect(r.unitRate).toBe(0.12);
    });

    it('zero generation gives no saving and no payback', () => {
      const r = calculateSavings({ ...typical, batteryKwh: 0 }, { ...config, generationKwh: 0 }, price);
      expect(r.annualSaving).toBe(0);
      expect(r.paybackYears).toBeNull();
    });

    it('treats NaN, Infinity and negatives as zero', () => {
      const r = calculateSavings(
        { usageKwh: Number.NaN, monthlyBill: -5, homePattern: 'some', batteryKwh: Infinity, diverter: false },
        config,
        { packagePrice: Number.NaN, extraModules: -1, modulePrice: 2000, extrasPrices: [Number.NaN, 100] },
      );
      for (const v of Object.values(r)) if (v !== null) expect(Number.isFinite(v)).toBe(true);
      expect(r.totalPrice).toBe(100);
    });
  });

  it('clamps the self-use fraction between 25% and 90%', () => {
    const lo = calculateSavings({ ...typical, batteryKwh: 0, homePattern: 'out' }, config, price);
    expect(lo.selfUseFraction).toBeCloseTo(0.25, 10);
    const hi = calculateSavings({ ...typical, batteryKwh: 30, homePattern: 'all' }, config, price);
    expect(hi.selfUseFraction).toBe(0.9);
  });

  it('home pattern moves self-use in the right direction', () => {
    const base = { ...typical, usageKwh: 10000 };
    const out = calculateSavings({ ...base, homePattern: 'out' }, config, price).selfUseKwh;
    const some = calculateSavings({ ...base, homePattern: 'some' }, config, price).selfUseKwh;
    const all = calculateSavings({ ...base, homePattern: 'all' }, config, price).selfUseKwh;
    expect(out).toBeLessThan(some);
    expect(some).toBeLessThan(all);
  });

  it('diverter moves 20% of export from SEG to avoided import', () => {
    const off = calculateSavings(typical, config, price);
    const on = calculateSavings({ ...typical, diverter: true }, config, price);
    expect(on.divertedKwh).toBeCloseTo(off.exportKwh * 0.2, 10);
    expect(on.exportEarnings).toBeCloseTo(off.exportEarnings * 0.8, 10);
    expect(on.diverterSaving).toBeCloseTo(on.divertedKwh * (off.unitRate - 0.15), 10);
    expect(on.annualSaving).toBeGreaterThan(off.annualSaving);
  });

  it('uses coefficients from settings, not constants', () => {
    const tuned = { ...config, coefficients: { ...SPEC_COEFFICIENTS, base_self_use: 0.5 } };
    const r = calculateSavings({ ...typical, batteryKwh: 0, usageKwh: 10000 }, tuned, price);
    expect(r.selfUseFraction).toBeCloseTo(0.5, 10);
  });

  it('total = package + modules × module price + extras', () => {
    const r = calculateSavings(typical, config, {
      packagePrice: 9000,
      extraModules: 2,
      modulePrice: 2000,
      extrasPrices: [1000, 450],
    });
    expect(r.totalPrice).toBe(9000 + 4000 + 1450);
  });
});

describe('maxExtraModules', () => {
  it('counts whole modules up to the system maximum', () => {
    expect(maxExtraModules(10, 5, 30)).toBe(4);
    expect(maxExtraModules(10, 5, 32)).toBe(4);
    expect(maxExtraModules(10, 5, 10)).toBe(0);
    expect(maxExtraModules(10, 5, null)).toBe(0); // [TBC] maximum hides the stepper
  });
});
