/**
 * The solar estimator's maths. Pure: used by the website tool, the admin settings page and the tests.
 *
 * Method (the same shape as MCS-style calculators): generation = system size × the yield per kWp for this
 * postcode, roof direction and pitch (from PVGIS, or a fallback table if it can't be reached) × a shading factor.
 * Savings = the generation used in the home (self-consumption) × the price paid for electricity, plus the rest
 * exported × the export rate. Everything that is an assumption is in EstimatorSettings, so it can be shown to the
 * visitor and changed by Heliaxis without touching code.
 */

export type EstimatorSettings = {
  /** What a kWh costs the customer, pence (Ofgem's cap is about 26p). */
  importPence: number;
  /** Daily standing charge, pence: taken out of a bill to find the kWh used. */
  standingPence: number;
  /** What exported electricity earns (Smart Export Guarantee), pence per kWh. */
  exportPence: number;
  panelWatts: number;
  /** Installed price per kWp, home and business (pounds). Indicative: a survey sets the real price. */
  homePerKwp: number;
  businessPerKwp: number;
  /** Battery price per kWh of storage (pounds), and the size offered. */
  batteryPerKwh: number;
  batteryKwh: number;
  /** Yearly rise in electricity prices to assume over 25 years (per cent, 0 = today's prices). */
  priceRisePct: number;
  /** Panels lose a little each year (per cent). */
  degradationPct: number;
  /** kg of CO₂ saved per kWh of solar used or exported. */
  co2PerKwh: number;
};

export const DEFAULT_SETTINGS: EstimatorSettings = {
  importPence: 26.3,
  standingPence: 54.8,
  exportPence: 12,
  panelWatts: 450,
  homePerKwp: 1350,
  businessPerKwp: 950,
  batteryPerKwh: 800,
  batteryKwh: 5,
  priceRisePct: 0,
  degradationPct: 0.5,
  co2PerKwh: 0.2,
};

/** Settings from storage or a request, each number kept within a sensible range, the rest defaulted. */
export function cleanSettings(v: unknown): EstimatorSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const num = (k: keyof EstimatorSettings, lo: number, hi: number) => {
    const n = Number(o[k]);
    return Number.isFinite(n) && o[k] !== '' && o[k] != null ? Math.min(hi, Math.max(lo, n)) : DEFAULT_SETTINGS[k];
  };
  return {
    importPence: num('importPence', 5, 100),
    standingPence: num('standingPence', 0, 150),
    exportPence: num('exportPence', 0, 60),
    panelWatts: num('panelWatts', 250, 700),
    homePerKwp: num('homePerKwp', 300, 5000),
    businessPerKwp: num('businessPerKwp', 300, 5000),
    batteryPerKwh: num('batteryPerKwh', 100, 3000),
    batteryKwh: num('batteryKwh', 2, 30),
    priceRisePct: num('priceRisePct', 0, 10),
    degradationPct: num('degradationPct', 0, 3),
    co2PerKwh: num('co2PerKwh', 0.01, 0.8),
  };
}

export type Who = 'home' | 'business';
export type Shade = 'none' | 'some' | 'lots';
export type Daytime = 'out' | 'some' | 'home';

/** Roof directions offered, with PVGIS's aspect (degrees from south; it is symmetrical) and the fallback factor. */
export const DIRECTIONS = [
  { key: 'south', label: 'South', aspect: 0, factor: 1.0 },
  { key: 'se_sw', label: 'South-east or south-west', aspect: 45, factor: 0.96 },
  { key: 'east_west', label: 'East or west', aspect: 90, factor: 0.86 },
  { key: 'ne_nw', label: 'North-east or north-west', aspect: 135, factor: 0.7 },
  { key: 'north', label: 'North', aspect: 180, factor: 0.58 },
] as const;
export type DirectionKey = (typeof DIRECTIONS)[number]['key'];

export const PITCHES = [
  { key: 'flat', label: 'Flat or nearly', angle: 10, factor: 0.9 },
  { key: 'low', label: 'Low pitch', angle: 20, factor: 0.96 },
  { key: 'typical', label: 'Typical house roof', angle: 35, factor: 1.0 },
  { key: 'steep', label: 'Steep', angle: 45, factor: 0.98 },
] as const;
export type PitchKey = (typeof PITCHES)[number]['key'];

export const SHADE_FACTOR: Record<Shade, number> = { none: 1, some: 0.9, lots: 0.78 };
const BASE_FALLBACK_YIELD = 950; // kWh per kWp a year for a south roof at a typical pitch in South Wales

export const directionOf = (k: string) => DIRECTIONS.find((d) => d.key === k) ?? DIRECTIONS[1];
export const pitchOf = (k: string) => PITCHES.find((p) => p.key === k) ?? PITCHES[2];

/** Yield per kWp if PVGIS can't be reached: the South Wales base scaled for the roof's direction and pitch. */
export const fallbackYield = (dir: string, pitch: string) => Math.round(BASE_FALLBACK_YIELD * directionOf(dir).factor * pitchOf(pitch).factor);

/** UK generation by month as a share of the year (sums to 1): used when only a yearly figure is known. */
export const MONTH_SHARE = [0.03, 0.047, 0.079, 0.113, 0.133, 0.138, 0.136, 0.118, 0.091, 0.061, 0.032, 0.022].map((x, _, a) => x / a.reduce((s, y) => s + y, 0));

export type Inputs = {
  who: Who;
  /** kWh per kWp a year for this roof (PVGIS or the fallback), before shading. */
  yieldKwhPerKwp: number;
  /** PVGIS's monthly kWh per kWp for this roof (12 numbers), if we have it. */
  monthlyPerKwp?: number[] | null;
  shade: Shade;
  usage: { kind: 'bill' | 'kwh'; value: number };
  daytime: Daytime;
  battery: boolean;
  ev: boolean;
  heatpump: boolean;
};

export type Estimate = {
  /** kWh a year the home or site is expected to use, including an EV or heat pump if ticked. */
  consumption: number;
  kwp: number;
  panels: number;
  generation: number;
  selfPct: number;
  selfUsed: number;
  exported: number;
  /** £ a year saved on the bill plus export income. */
  saving: number;
  savingLow: number;
  savingHigh: number;
  cost: number;
  costLow: number;
  costHigh: number;
  paybackYears: number;
  paybackLow: number;
  paybackHigh: number;
  /** Total saved over 25 years less the cost. */
  net25: number;
  co2Tonnes: number;
  billNow: number;
  billAfter: number;
  monthly: number[];
  /** The panel count needs the network operator's G99 application (over 3.68 kW on one phase). */
  needsG99: boolean;
  batteryKwh: number;
};

const EV_KWH = 2000;
const HEATPUMP_KWH = 3000;
const SPREAD = 0.12; // the range shown either side of the central figure

export const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** kWh a year from what the visitor entered: a bill is turned into kWh using the unit rate and standing charge. */
export function consumptionFrom(usage: Inputs['usage'], s: EstimatorSettings): number {
  if (usage.kind === 'kwh') return Math.max(0, usage.value);
  const yearly = Math.max(0, usage.value) * 12;
  return Math.max(0, (yearly - (s.standingPence / 100) * 365) / (s.importPence / 100));
}

export function estimate(i: Inputs, s: EstimatorSettings = DEFAULT_SETTINGS): Estimate {
  const home = i.who === 'home';
  const base = consumptionFrom(i.usage, s);
  const consumption = base + (i.ev ? EV_KWH : 0) + (i.heatpump ? HEATPUMP_KWH : 0);
  const eff = Math.max(300, i.yieldKwhPerKwp) * SHADE_FACTOR[i.shade];

  // Size: enough to cover about 95% of the year's use, within what a home roof can take (2 to about 10 kWp) or a site's (5 to 250).
  const wantKwp = (consumption * 0.95) / eff;
  const [minKwp, maxKwp] = home ? [2, 10] : [5, 250];
  const panels = Math.max(Math.ceil((minKwp * 1000) / s.panelWatts), Math.min(Math.floor((maxKwp * 1000) / s.panelWatts), Math.round((wantKwp * 1000) / s.panelWatts)));
  const kwp = (panels * s.panelWatts) / 1000;
  const generation = kwp * eff;

  // How much of it is used in the building: more with someone at home in the day, a battery, an EV or a heat pump.
  let selfPct = (home ? { out: 0.3, some: 0.4, home: 0.5 }[i.daytime] : { out: 0.5, some: 0.55, home: 0.6 }[i.daytime]) + (i.ev ? 0.04 : 0) + (i.heatpump ? 0.04 : 0);
  if (i.battery) selfPct += home ? 0.3 : 0.2;
  selfPct = Math.min(selfPct, 0.85);
  const selfUsed = Math.min(generation * selfPct, consumption * 0.92);
  const exported = Math.max(generation - selfUsed, 0);

  const imp = s.importPence / 100;
  const saving = selfUsed * imp + exported * (s.exportPence / 100);
  const batteryKwh = i.battery ? s.batteryKwh : 0;
  const cost = kwp * (home ? s.homePerKwp : s.businessPerKwp) + batteryKwh * s.batteryPerKwh;
  const savingLow = saving * (1 - SPREAD);
  const savingHigh = saving * (1 + SPREAD);
  const costLow = cost * (1 - 0.08);
  const costHigh = cost * (1 + 0.08);

  let total = 0;
  for (let y = 0; y < 25; y++) total += saving * Math.pow(1 - s.degradationPct / 100, y) * Math.pow(1 + s.priceRisePct / 100, y);

  const monthly = (i.monthlyPerKwp && i.monthlyPerKwp.length === 12 ? (() => {
    const sum = i.monthlyPerKwp.reduce((a, b) => a + b, 0) || 1;
    return i.monthlyPerKwp.map((m) => (m / sum) * generation);
  })() : MONTH_SHARE.map((m) => m * generation));

  const billNow = i.usage.kind === 'bill' ? i.usage.value * 12 : consumption * imp + (s.standingPence / 100) * 365;
  return {
    consumption,
    kwp,
    panels,
    generation,
    selfPct,
    selfUsed,
    exported,
    saving,
    savingLow,
    savingHigh,
    cost,
    costLow,
    costHigh,
    paybackYears: saving > 0 ? cost / saving : 0,
    paybackLow: savingHigh > 0 ? costLow / savingHigh : 0,
    paybackHigh: savingLow > 0 ? costHigh / savingLow : 0,
    net25: total - cost,
    co2Tonnes: ((selfUsed + exported) * s.co2PerKwh) / 1000,
    billNow,
    billAfter: Math.max(billNow - saving, 0),
    monthly,
    needsG99: home && kwp > 3.68,
    batteryKwh,
  };
}

/** A plain rating of the roof from what each kWp makes in a year (after shading): 1 to 5 suns. */
export function potentialOf(yieldPerKwpAfterShade: number): { suns: 1 | 2 | 3 | 4 | 5; label: string; line: string } {
  const y = yieldPerKwpAfterShade;
  if (y >= 900) return { suns: 5, label: 'Excellent solar potential', line: 'Your roof is a very good fit for solar.' };
  if (y >= 820) return { suns: 4, label: 'Very good solar potential', line: 'Solar should work well on your roof.' };
  if (y >= 720) return { suns: 3, label: 'Good solar potential', line: 'Solar can work well, with a little less from each panel.' };
  if (y >= 600) return { suns: 2, label: 'Fair solar potential', line: 'Solar can still pay back, but the roof is not ideal. A survey will tell us more.' };
  return { suns: 1, label: 'Limited solar potential', line: 'This roof is a poor match for solar as it is. We would look at other options on a survey.' };
}
