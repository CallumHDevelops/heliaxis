/**
 * ProspectPV indicative savings model (spec section 7.3).
 *
 * Pure and dependency-free so it runs identically in the landing page (live
 * calculator), on the server (booking total check) and in tests. Every
 * constant comes from settings; nothing is hard-coded here.
 *
 * Results are indicative. Heliaxis must check the model against RECC guidance
 * before launch.
 */

import type { CalcCoefficients } from './settings';

export type HomePattern = 'out' | 'some' | 'all';

export type SavingsInputs = {
  /** Annual electricity use, kWh. */
  usageKwh: number;
  /** Current monthly electricity bill, £. */
  monthlyBill: number;
  homePattern: HomePattern;
  /** Total usable battery, kWh (package + added modules). */
  batteryKwh: number;
  /** True if a hot water diverter extra is selected. */
  diverter: boolean;
};

export type SavingsConfig = {
  /** Stored annual generation G for this home, kWh. */
  generationKwh: number;
  /** SEG export rate, £/kWh. */
  segRate: number;
  /** Off-peak tariff spread, £/kWh. */
  offPeakSpread: number;
  /** Standing charge, £/year. */
  standingPerYear: number;
  coefficients: CalcCoefficients;
};

export type PriceInputs = {
  packagePrice: number;
  extraModules: number;
  modulePrice: number;
  extrasPrices: number[];
};

export type SavingsResult = {
  unitRate: number;
  selfUseFraction: number;
  selfUseKwh: number;
  exportKwh: number;
  divertedKwh: number;
  diverterSaving: number;
  exportEarnings: number;
  tariffSaving: number;
  billSaving: number;
  annualSaving: number;
  newMonthlyBill: number;
  totalPrice: number;
  /** null when there is no saving to pay back against. */
  paybackYears: number | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Non-finite or negative inputs become 0, so the model never returns NaN. */
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function calculateSavings(inputs: SavingsInputs, config: SavingsConfig, price: PriceInputs): SavingsResult {
  const c = config.coefficients;
  const usageKwh = nonNeg(inputs.usageKwh);
  const monthlyBill = nonNeg(inputs.monthlyBill);
  const batteryKwh = nonNeg(inputs.batteryKwh);
  const G = nonNeg(config.generationKwh);
  const segRate = nonNeg(config.segRate);
  const offPeakSpread = nonNeg(config.offPeakSpread);
  const standingPerYear = nonNeg(config.standingPerYear);

  const annualBill = monthlyBill * 12;

  // With zero usage the per-unit rate is undefined; use the floor rate.
  const unitRate =
    usageKwh > 0 ? Math.max(c.min_unit_rate_gbp, (annualBill - standingPerYear) / usageKwh) : c.min_unit_rate_gbp;

  const homeAdj =
    inputs.homePattern === 'all' ? c.home_all_day_adj : inputs.homePattern === 'out' ? c.mostly_out_adj : 0;

  const selfUseFraction = clamp(
    c.base_self_use + batteryKwh * c.self_use_per_battery_kwh + homeAdj,
    c.min_self_use_fraction,
    c.max_self_use_fraction,
  );

  const selfUseKwh = Math.min(usageKwh * c.max_self_use_of_demand, G * selfUseFraction);
  const exportKwh = Math.max(0, G - selfUseKwh);

  const divertedKwh = inputs.diverter ? exportKwh * c.diverter_share_of_export : 0;
  const diverterSaving = divertedKwh * Math.max(0, unitRate - segRate);
  const exportEarnings = (exportKwh - divertedKwh) * segRate;

  const tariffSaving =
    Math.min(batteryKwh * c.battery_usable_depth * c.battery_cycles_per_year, Math.max(0, usageKwh - selfUseKwh)) *
    offPeakSpread;

  let billSaving = selfUseKwh * unitRate + tariffSaving + diverterSaving;
  // Optional guard (setting cap_saving_at_bill): never claim to save more on
  // the bill than the person pays for energy. Only bites at extreme inputs.
  if (c.cap_saving_at_bill) billSaving = Math.min(billSaving, Math.max(0, annualBill));

  const annualSaving = billSaving + exportEarnings;
  const newMonthlyBill = Math.max(0, (annualBill - billSaving) / 12);

  const totalPrice =
    nonNeg(price.packagePrice) +
    nonNeg(price.extraModules) * nonNeg(price.modulePrice) +
    price.extrasPrices.reduce((sum, p) => sum + nonNeg(p), 0);

  const paybackYears = annualSaving > 0 ? totalPrice / annualSaving : null;

  return {
    unitRate,
    selfUseFraction,
    selfUseKwh,
    exportKwh,
    divertedKwh,
    diverterSaving,
    exportEarnings,
    tariffSaving,
    billSaving,
    annualSaving,
    newMonthlyBill,
    totalPrice,
    paybackYears,
  };
}

/** Largest number of 5 kWh (or configured) modules that can be added. */
export function maxExtraModules(baseKwh: number, moduleKwh: number, maxKwh: number | null): number {
  if (maxKwh === null || moduleKwh <= 0) return 0;
  return Math.max(0, Math.floor((maxKwh - baseKwh + 1e-9) / moduleKwh));
}
