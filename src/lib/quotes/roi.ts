/**
 * Re-working a design proposal's savings with the customer's own prices. Pure: used by the interactive proposal page and the tests.
 *
 * What the design software gave us is the energy side (what the panels make, how much is used in the home, how much the battery moves
 * into the evening) and its own year-one saving at its own prices. We value that same energy at the prices the customer enters:
 * what the panels use directly at the day rate, what the battery moves at the evening rate, and what is sent to the grid at the
 * export rate. The result is then matched to the proposal's own year-one saving at the proposal's prices (so unchanged prices give
 * the proposal's numbers) and every change from there follows from the entered prices. It is an estimate from yearly energy
 * flows, not a half-hour simulation; a time-of-use tariff's night-time battery charging is not modelled.
 */
export type Tariff = {
  mode: 'flat' | 'tou';
  /** Pence per kWh. Flat: `flatPence` is used for everything. Time of use: day, evening (the peak) and night. */
  flatPence: number;
  dayPence: number;
  eveningPence: number;
  nightPence: number;
  /** Pence a day: the same with or without solar, so it changes the bills shown but not the saving. */
  standingPencePerDay: number;
  /** Pence per kWh for what is sent to the grid. */
  exportPence: number;
  /** Yearly rise in the price of electricity, in per cent (export income is taken to follow it, as the design software does). */
  risePct: number;
};

export type Basis = {
  generationKwh: number;
  consumptionKwh: number;
  /** Used in the home straight from the panels, and the total used in the home with the battery (equal, or absent, without one). */
  selfPvKwh: number;
  selfWithBatteryKwh: number;
  hasBattery: boolean;
  degradationPct: number;
  discountPct: number;
  years: number;
  /** What the customer pays: this quote's total, in pounds. */
  priceGbp: number;
  /** The proposal's own year-one saving and the prices it used, to match to. */
  proposalSavingGbp?: number;
  proposalTariff?: Tariff;
};

export type Result = {
  yearOneGbp: number;
  paybackYears: number | null;
  netSavingsGbp: number;
  lifetimeSavingsGbp: number;
  roiPct: number;
  irrPct: number | null;
  npvGbp: number;
  cumulative: number[];
  billBeforeGbp: number;
  billAfterGbp: number;
  /** Matched to the proposal's own figure (false when the proposal didn't give enough to match to). */
  matched: boolean;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const pounds = (pence: number) => pence / 100;

const rates = (t: Tariff) => (t.mode === 'flat' ? { day: t.flatPence, eve: t.flatPence, night: t.flatPence } : { day: t.dayPence, eve: t.eveningPence, night: t.nightPence });

/** The energy, split three ways. */
function flows(b: Basis) {
  const direct = Math.max(0, b.hasBattery ? b.selfPvKwh : Math.max(b.selfPvKwh, b.selfWithBatteryKwh));
  const shifted = b.hasBattery ? Math.max(0, b.selfWithBatteryKwh - b.selfPvKwh) : 0;
  const exported = Math.max(0, b.generationKwh - direct - shifted);
  return { direct, shifted, exported };
}

/** Year one, in pounds, from the energy and a tariff: the part that is electricity bought less, and the part that is export income. */
function yearOne(b: Basis, t: Tariff) {
  const f = flows(b);
  const r = rates(t);
  return { importGbp: pounds(f.direct * r.day + f.shifted * r.eve), exportGbp: pounds(f.exported * t.exportPence) };
}

/** How a home's use falls across the day, for the bill totals only. */
const SHARE = { day: 0.55, eve: 0.25, night: 0.2 };

export function irr(flowsGbp: number[]): number | null {
  const npv = (r: number) => flowsGbp.reduce((a, c, i) => a + c / Math.pow(1 + r, i), 0);
  let lo = -0.9;
  let hi = 5;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export function recalc(b: Basis, t: Tariff): Result {
  const years = clamp(Math.round(b.years), 1, 40);
  const one = yearOne(b, t);
  let k = 1;
  let matched = false;
  if (b.proposalSavingGbp && b.proposalTariff) {
    const base = yearOne(b, b.proposalTariff);
    const total = base.importGbp + base.exportGbp;
    if (total > 0) {
      const ratio = b.proposalSavingGbp / total;
      if (ratio > 0.25 && ratio < 4) {
        k = ratio;
        matched = true;
      }
    }
  }
  const gen = 1 - clamp(b.degradationPct, 0, 5) / 100;
  const rise = 1 + clamp(t.risePct, -10, 30) / 100;
  const saved: number[] = [];
  for (let i = 0; i < years; i++) saved.push(k * (one.importGbp + one.exportGbp) * Math.pow(rise, i) * Math.pow(gen, i));
  const cumulative: number[] = [];
  let run = -b.priceGbp;
  for (const s of saved) {
    run += s;
    cumulative.push(Math.round(run));
  }
  let paybackYears: number | null = null;
  let before = -b.priceGbp;
  for (let i = 0; i < saved.length; i++) {
    if (before + saved[i] >= 0) {
      paybackYears = i + (saved[i] > 0 ? -before / saved[i] : 0);
      break;
    }
    before += saved[i];
  }
  const disc = clamp(b.discountPct, 0, 30) / 100;
  const npvGbp = saved.reduce((a, s, i) => a + s / Math.pow(1 + disc, i + 1), 0) - b.priceGbp;
  const lifetime = saved.reduce((a, s) => a + s, 0);
  const r = rates(t);
  const before1 = (b.consumptionKwh * (SHARE.day * r.day + SHARE.eve * r.eve + SHARE.night * r.night)) / 100 + (t.standingPencePerDay * 365) / 100;
  return {
    yearOneGbp: saved[0] ?? 0,
    paybackYears,
    netSavingsGbp: lifetime - b.priceGbp,
    lifetimeSavingsGbp: lifetime,
    roiPct: b.priceGbp > 0 ? ((lifetime - b.priceGbp) / b.priceGbp) * 100 : 0,
    irrPct: irr([-b.priceGbp, ...saved]),
    npvGbp,
    cumulative,
    billBeforeGbp: before1,
    billAfterGbp: Math.max(0, before1 - (saved[0] ?? 0)),
    matched,
  };
}

/** 9.5 → "9 years 6 months". */
export function paybackWords(y: number | null): string {
  if (y === null) return 'Not within the period';
  const m = Math.round(y * 12);
  const yr = Math.floor(m / 12);
  const mo = m % 12;
  return `${yr} year${yr === 1 ? '' : 's'}${mo ? ` ${mo} month${mo === 1 ? '' : 's'}` : ''}`;
}

/** The pence per kWh paid for export when the design software gave none: a typical Smart Export Guarantee rate. */
export const DEFAULT_EXPORT_PENCE = 15;

/**
 * Where the year's export falls by month: in proportion to what the panels make over what the home uses, month by month (a sunny
 * month with little use exports most). Adds up to `annualKwh`.
 */
export function monthlyExportKwh(gen: number[], use: number[], annualKwh: number): number[] {
  const weights = gen.map((g, i) => Math.max(0, g - (use[i] ?? 0)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total || annualKwh <= 0) return gen.map(() => 0);
  return weights.map((w) => (w / total) * annualKwh);
}
