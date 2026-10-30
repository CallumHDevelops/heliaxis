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
  /** Installed price: a fixed part (scaffold, inverter, labour, grid paperwork) plus a price per kWp, for homes and businesses (pounds). Indicative: a survey sets the real price. */
  homeFixed: number;
  homePerKwp: number;
  businessFixed: number;
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
  homeFixed: 1500,
  homePerKwp: 1000,
  businessFixed: 2000,
  businessPerKwp: 850,
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
    // Settings saved before fixed costs existed keep their old flat price per kWp.
    homeFixed: o.homeFixed === undefined && o.homePerKwp !== undefined ? 0 : num('homeFixed', 0, 50000),
    homePerKwp: num('homePerKwp', 300, 5000),
    businessFixed: o.businessFixed === undefined && o.businessPerKwp !== undefined ? 0 : num('businessFixed', 0, 100000),
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
/** Homes: out, some, home. Businesses: when it is open (office hours, long hours, round the clock, evenings and weekends). */
export type Daytime = 'out' | 'some' | 'home' | 'office' | 'long' | 'always' | 'evening';
export const BUSINESS_HOURS: { key: Daytime; label: string; sub: string; short: string }[] = [
  { key: 'office', label: 'Weekdays, 9 to 5', sub: 'Office, workshop, school: closed evenings and weekends', short: '9 to 5' },
  { key: 'long', label: 'Long hours, 6 or 7 days', sub: 'Shop, café, garage, farm: early starts and late finishes', short: 'Long hours' },
  { key: 'always', label: 'Round the clock', sub: 'Care home, cold store, factory on shifts, 24/7', short: '24/7' },
  { key: 'evening', label: 'Evenings and weekends', sub: 'Pub, gym, club, hall: busiest after work', short: 'Evenings' },
];

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
  /** The most panels the roof has room for, when a satellite lookup found the roof (0 or missing: not known). */
  maxPanels?: number;
  /** 'usage' (the default): sized to cover the electricity used. 'roof': as many panels as the roof takes. */
  sizeMode?: 'usage' | 'roof';
  /** Battery size when a battery is chosen (the settings' size if not given). */
  batteryKwh?: number;
  /** kWh per kWp a year for each panel the roof takes, best face first (a roof with more than one face). Overrides yieldKwhPerKwp. */
  panelYields?: number[];
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
  /** The roof, not the electricity use, is what limits the size. */
  roofLimited: boolean;
  /** The panels that would cover the electricity used, if the roof had no limit; and the most the roof takes (0: not known). */
  panelsWanted: number;
  roofPanels: number;
  /** Money position at the end of each year, 0 to 25 (negative until the system has paid for itself). */
  cashflow: number[];
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

/** A smooth minimum: close to the smaller of two numbers, without a sharp corner where they cross. */
const softMin = (a: number, b: number) => (a <= 0 || b <= 0 ? 0 : Math.pow(Math.pow(a, -4) + Math.pow(b, -4), -0.25));

/** The share of a home's (or site's) electricity used while the sun is up, before any battery. */
/** The share of what is used that falls while the sun is up (before a battery, an electric car or a heat pump). */
const DAY_SHARE: Record<'home' | 'business', Record<Daytime, number>> = {
  home: { out: 0.25, some: 0.33, home: 0.42, office: 0.33, long: 0.33, always: 0.33, evening: 0.33 },
  business: { out: 0.45, some: 0.5, home: 0.55, office: 0.62, long: 0.52, always: 0.42, evening: 0.28 },
};

export function estimate(i: Inputs, s: EstimatorSettings = DEFAULT_SETTINGS): Estimate {
  const home = i.who === 'home';
  const base = consumptionFrom(i.usage, s);
  const consumption = base + (i.ev ? EV_KWH : 0) + (i.heatpump ? HEATPUMP_KWH : 0);
  const shadeF = SHADE_FACTOR[i.shade];
  const panelKw = s.panelWatts / 1000;

  // What n panels make a year: from each panel's own yield when the roof has several faces, otherwise one yield for all.
  const py = i.panelYields && i.panelYields.length ? i.panelYields : null;
  const avg = py ? py.reduce((a, b) => a + b, 0) / py.length : Math.max(300, i.yieldKwhPerKwp);
  const genFor = (n: number) => {
    const kwh = py ? py.slice(0, n).reduce((a, b) => a + b, 0) + Math.max(0, n - py.length) * avg : n * avg;
    return kwh * panelKw * shadeF;
  };

  // Size: enough panels to cover about 95% of the year's use, within what a home roof can take (2 to about 10 kWp) or a site's (5 to 250).
  const [minKwp, maxKwp] = home ? [2, 10] : [5, 250];
  const minPanels = Math.ceil((minKwp * 1000) / s.panelWatts);
  const typeMax = Math.floor((maxKwp * 1000) / s.panelWatts);
  const roofCap = i.maxPanels && i.maxPanels > 0 ? Math.max(4, i.maxPanels) : 0;
  const target = consumption * 0.95;
  let wanted = minPanels;
  while (wanted < typeMax && genFor(wanted) < target) wanted++;
  const cap = roofCap ? Math.min(typeMax, roofCap) : typeMax;
  const panels = i.sizeMode === 'roof' && roofCap ? cap : Math.min(wanted, cap);
  const roofLimited = !!roofCap && wanted > roofCap && i.sizeMode !== 'roof';
  const kwp = (panels * s.panelWatts) / 1000;
  const generation = genFor(panels);

  // How much is used in the building: limited by what is made and by what the building uses while the sun is up. A battery, an
  // electric car and a heat pump all raise that daytime use; a bigger system on the same use exports more of what it makes.
  const batteryKwh = i.battery ? (i.batteryKwh ?? s.batteryKwh) : 0;
  const batteryBonus = batteryKwh > 0 ? (home ? 0.3 : 0.2) * ((1 - Math.exp(-batteryKwh / 4)) / (1 - Math.exp(-5 / 4))) : 0;
  const dayShare = Math.min(0.9, DAY_SHARE[home ? 'home' : 'business'][i.daytime] + batteryBonus + (i.ev ? 0.04 : 0) + (i.heatpump ? 0.04 : 0));
  const selfUsed = Math.min(generation, softMin(generation * 0.95, consumption * dayShare * 1.15));
  const exported = Math.max(generation - selfUsed, 0);
  const selfPct = generation > 0 ? selfUsed / generation : 0;

  const imp = s.importPence / 100;
  const saving = selfUsed * imp + exported * (s.exportPence / 100);
  const cost = (home ? s.homeFixed + kwp * s.homePerKwp : s.businessFixed + kwp * s.businessPerKwp) + batteryKwh * s.batteryPerKwh;
  const savingLow = saving * (1 - SPREAD);
  const savingHigh = saving * (1 + SPREAD);
  const costLow = cost * (1 - 0.08);
  const costHigh = cost * (1 + 0.08);

  const cashflow = [-cost];
  let total = 0;
  for (let y = 0; y < 25; y++) {
    total += saving * Math.pow(1 - s.degradationPct / 100, y) * Math.pow(1 + s.priceRisePct / 100, y);
    cashflow.push(total - cost);
  }

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
    roofLimited,
    panelsWanted: wanted,
    roofPanels: roofCap,
    cashflow,
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
