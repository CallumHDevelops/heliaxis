/** Estimates shown in the admin: yearly generation and a typical-home saving. */
import { calculatorReady, type CalcAssumptions, type CalcCoefficients, type CalcInputs } from './settings';
import { calculateSavings, type HomePattern, type SavingsResult } from './savings';

/** Yearly generation from array size and a yield per kWp (a setting). Rounded to 10 kWh. */
export function generationFromYield(kwp: number, yieldKwhPerKwp: number | null): number | null {
  if (yieldKwhPerKwp === null || !(kwp > 0)) return null;
  return Math.round((kwp * yieldKwhPerKwp) / 10) * 10;
}

export type SavingsSettings = { assumptions: CalcAssumptions; coefficients: CalcCoefficients; inputs: CalcInputs };

export type HomeInputs = { usageKwh: number; monthlyBill: number; homePattern: HomePattern; diverter?: boolean };

/** Saving for a given home. null until SEG rate, off-peak spread and standing charge are all set. */
export function estimateSavings(
  home: HomeInputs,
  sys: { generationKwh: number; batteryKwh: number; price: number },
  s: SavingsSettings,
): SavingsResult | null {
  if (!calculatorReady(s.assumptions) || !(sys.generationKwh >= 0)) return null;
  return calculateSavings(
    { usageKwh: home.usageKwh, monthlyBill: home.monthlyBill, homePattern: home.homePattern, batteryKwh: sys.batteryKwh, diverter: !!home.diverter },
    {
      generationKwh: sys.generationKwh,
      segRate: s.assumptions.seg_rate_gbp_per_kwh,
      offPeakSpread: s.assumptions.off_peak_spread_gbp_per_kwh,
      standingPerYear: s.assumptions.standing_charge_gbp_per_year,
      coefficients: s.coefficients,
    },
    { packagePrice: sys.price, extraModules: 0, modulePrice: 0, extrasPrices: [] },
  );
}

/** The home the landing page starts from (slider defaults). */
export function typicalHome(inputs: CalcInputs): HomeInputs {
  return { usageKwh: inputs.usage_default, monthlyBill: inputs.bill_default, homePattern: inputs.home_default };
}
