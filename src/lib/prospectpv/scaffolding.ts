/**
 * Rough scaffolding estimate for one job. Pure and dependency-free so the
 * admin estimator, the letter detail page and tests all share it.
 *
 * Model: scaffold the elevation(s) the panels sit above, from the ground to a
 * working platform at eaves height, plus a little extra at each end.
 *   length  = elevation width + 2 × end return
 *   height  = storeys × storey height + top lift
 *   cost    = max( length × height × elevations × £/m² + fixed fee , minimum charge )
 *
 * Money rates come from settings and are null until Heliaxis enters its own
 * (nothing is invented); the geometry defaults are editable assumptions.
 */

export type ScaffoldRates = {
  /** Erect, hire and dismantle, per m² of scaffold face. */
  rate_per_m2_gbp: number | null;
  /** Per-job charge (delivery, handling, inspection). */
  fixed_fee_gbp: number | null;
  /** Smallest amount a scaffolder will quote for a job. */
  min_charge_gbp: number | null;
  /** Extra length beyond the elevation at each end. */
  end_return_m: number;
  storey_height_m: number;
  /** Extra height above eaves for the top platform and guard rail. */
  top_lift_m: number;
};

export const SCAFFOLD_GEOMETRY_DEFAULTS = { end_return_m: 1, storey_height_m: 2.6, top_lift_m: 1 } as const;

export type ScaffoldInput = { storeys: number; elevationWidthM: number; elevations: number };

export type ScaffoldEstimate = {
  lengthM: number;
  heightM: number;
  areaPerElevationM2: number;
  totalAreaM2: number;
  elevations: number;
  storeys: number;
  areaCost: number | null;
  fixedFee: number;
  minApplied: boolean;
  /** Exact figure from the rates. null while a rate is missing. */
  cost: number | null;
  /** Rounded to the nearest £10 for "rough" quoting. */
  rough: number | null;
  /** What's still needed before a figure can be shown. */
  missing: string[];
};

const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function estimateScaffolding(input: ScaffoldInput, rates: ScaffoldRates): ScaffoldEstimate {
  const storeys = clampInt(input.storeys, 1, 4);
  const elevations = clampInt(input.elevations, 1, 4);
  const width = nonNeg(input.elevationWidthM);
  const lengthM = width > 0 ? width + 2 * nonNeg(rates.end_return_m) : 0;
  const heightM = storeys * nonNeg(rates.storey_height_m) + nonNeg(rates.top_lift_m);
  const areaPerElevationM2 = lengthM * heightM;
  const totalAreaM2 = areaPerElevationM2 * elevations;

  const missing: string[] = [];
  if (width <= 0) missing.push('roof width');
  if (rates.rate_per_m2_gbp === null) missing.push('rate per m²');

  const base = { lengthM, heightM, areaPerElevationM2, totalAreaM2, elevations, storeys };
  if (missing.length) {
    return { ...base, areaCost: null, fixedFee: nonNeg(rates.fixed_fee_gbp ?? 0), minApplied: false, cost: null, rough: null, missing };
  }
  const areaCost = totalAreaM2 * nonNeg(rates.rate_per_m2_gbp ?? 0);
  const fixedFee = nonNeg(rates.fixed_fee_gbp ?? 0);
  const subtotal = areaCost + fixedFee;
  const min = nonNeg(rates.min_charge_gbp ?? 0);
  const cost = Math.round(Math.max(subtotal, min) * 100) / 100;
  return { ...base, areaCost, fixedFee, minApplied: min > subtotal, cost, rough: Math.round(cost / 10) * 10, missing };
}

/**
 * Width of the elevation the panels sit above, from the roof's main aspect and
 * the building's two plan dimensions (east–west width, north–south depth).
 * South/north faces are as wide as the building; east/west faces as deep.
 */
export function elevationWidthForAspect(aspect: string, widthEW: number, depthNS: number): number {
  if (aspect === 'S' || aspect === 'N') return widthEW;
  if (aspect === 'E' || aspect === 'W') return depthNS;
  return Math.max(widthEW, depthNS);
}
