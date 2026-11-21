/**
 * The cost build-up behind a home's price, and the inverter sizing. Pure (no server imports): the website, the admin preview, the PDF and
 * the tests all use it. Heliaxis keeps its own costs in the admin; the price is each cost total divided by (1 minus the margin), never less than cost plus a minimum profit. The customer never sees a cost or
 * the margin: the browser is given a ready-made price table (buildPriceTable) instead of the costs, and the server re-prices every quote
 * from the real settings.
 */

/** G98 (notify the network operator after install) covers a single-phase inverter up to this AC rating, kW. */
export const G98_LIMIT_KW = 3.68;

export type Phase = 'single' | 'three';

export type CostSettings = {
  /** £ per panel. */
  panel: number;
  /** £ per panel (hooks and rail). */
  mounting: number;
  /** £ per fitting day. */
  labourPerDay: number;
  /** Panels one team fits in a day (minimum one day's labour). */
  panelsPerDay: number;
  /** £ per job. */
  electrical: number;
  /** £ per job: design, grid application, MCS, handover. */
  admin: number;
  /** £ per watt of panels. */
  ancillaryPerWatt: number;
  /** £ per job, when scaffolding is needed. */
  scaffolding: number;
  scaffoldingOn: boolean;
};

export type Inverter = {
  id: string;
  name: string;
  acKw: number;
  phase: Phase;
  /** The most panels (kWp) the inverter's inputs take. */
  maxPvKwp: number;
  hybrid: boolean;
  /** Our cost, £. */
  cost: number;
  active: boolean;
};

export type BatteryOption = { id: string; name: string; kwh: number; cost: number; active: boolean };

export type PriceRow = { low: number; mid: number; high: number; inverter: string; acKw: number; capped: boolean };
/** Ready-made prices for the browser: rows by "phase:batteryKwh", indexed by panel count; the largest array each supply takes. */
export type PriceTable = { rows: Record<string, (PriceRow | null)[]>; capKwp: Record<Phase, number> };

/** What the pricing needs from the estimator's settings. */
export type PricingSettings = {
  costs: CostSettings;
  inverters: Inverter[];
  batteries: BatteryOption[];
  /** Margin on price, per cent: price = cost / (1 - margin). The middle (for payback) is halfway between low and high. */
  marginLow: number;
  marginHigh: number;
  /** Pounds: a job's price is never less than its cost plus this. */
  minProfit: number;
  maxDcAcRatio: number;
  /** AC kW a battery needs per kWh to charge and discharge usefully (0 turns the rule off). */
  batteryKwPerKwh: number;
  solarOnlyInverter: boolean;
  panelWatts: number;
};

export const DEFAULT_COSTS: CostSettings = { panel: 65, mounting: 30, labourPerDay: 700, panelsPerDay: 20, electrical: 750, admin: 400, ancillaryPerWatt: 0.09, scaffolding: 1300, scaffoldingOn: true };

/** PLACEHOLDER costs and generic names until Callum confirms models and prices (editable in Sales › Solar estimator). */
export const DEFAULT_INVERTERS: Inverter[] = [
  { id: 'gw-3-6', name: 'GoodWe 3.6 kW hybrid inverter', acKw: 3.6, phase: 'single', maxPvKwp: 5.4, hybrid: true, cost: 750, active: true },
  { id: 'gw-5', name: 'GoodWe 5 kW hybrid inverter', acKw: 5, phase: 'single', maxPvKwp: 7.5, hybrid: true, cost: 900, active: true },
  { id: 'gw-6', name: 'GoodWe 6 kW hybrid inverter', acKw: 6, phase: 'single', maxPvKwp: 9, hybrid: true, cost: 1000, active: true },
  { id: 'gw-10-3p', name: 'GoodWe 10 kW three-phase hybrid inverter', acKw: 10, phase: 'three', maxPvKwp: 15, hybrid: true, cost: 1400, active: true },
];

export const DEFAULT_BATTERIES: BatteryOption[] = [
  { id: 'gw-bat-5', name: 'GoodWe 5 kWh battery', kwh: 5, cost: 1100, active: true },
  { id: 'gw-bat-8-3', name: 'GoodWe 8.3 kWh battery', kwh: 8.3, cost: 1500, active: true },
];

const txt = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function cleanCosts(v: unknown): CostSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_COSTS;
  return {
    panel: clamp(o.panel, 0, 2000, d.panel),
    mounting: clamp(o.mounting, 0, 1000, d.mounting),
    labourPerDay: clamp(o.labourPerDay, 0, 10000, d.labourPerDay),
    panelsPerDay: Math.round(clamp(o.panelsPerDay, 1, 200, d.panelsPerDay)),
    electrical: clamp(o.electrical, 0, 50000, d.electrical),
    admin: clamp(o.admin, 0, 50000, d.admin),
    ancillaryPerWatt: clamp(o.ancillaryPerWatt, 0, 5, d.ancillaryPerWatt),
    scaffolding: clamp(o.scaffolding, 0, 50000, d.scaffolding),
    scaffoldingOn: o.scaffoldingOn === undefined ? d.scaffoldingOn : o.scaffoldingOn !== false && o.scaffoldingOn !== 'false',
  };
}

export function cleanInverters(v: unknown): Inverter[] {
  if (!Array.isArray(v) || !v.length) return DEFAULT_INVERTERS.map((x) => ({ ...x }));
  const out: Inverter[] = [];
  for (const raw of v.slice(0, 16)) {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const name = txt(o.name, 80);
    const acKw = clamp(o.acKw, 0.5, 100, 0);
    if (!name || !acKw) continue;
    out.push({
      id: txt(o.id, 30).replace(/[^\w-]/g, '') || `inv${out.length + 1}`,
      name,
      acKw,
      phase: o.phase === 'three' ? 'three' : 'single',
      maxPvKwp: clamp(o.maxPvKwp, 0, 200, acKw * 1.5) || acKw * 1.5,
      hybrid: o.hybrid !== false && o.hybrid !== 'false',
      cost: clamp(o.cost, 0, 100000, 0),
      active: o.active !== false,
    });
  }
  return out.length ? out : DEFAULT_INVERTERS.map((x) => ({ ...x }));
}

export function cleanBatteries(v: unknown): BatteryOption[] {
  if (!Array.isArray(v) || !v.length) return DEFAULT_BATTERIES.map((x) => ({ ...x }));
  const out: BatteryOption[] = [];
  for (const raw of v.slice(0, 8)) {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const name = txt(o.name, 80);
    const kwh = clamp(o.kwh, 1, 100, 0);
    if (!name || !kwh) continue;
    out.push({ id: txt(o.id, 30).replace(/[^\w-]/g, '') || `bat${out.length + 1}`, name, kwh, cost: clamp(o.cost, 0, 100000, 0), active: o.active !== false });
  }
  return out.length ? out : DEFAULT_BATTERIES.map((x) => ({ ...x }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The most one inverter takes: its AC rating times the DC/AC ratio, within its own input limit (kWp). */
export const inverterCapacityKwp = (inv: Inverter, ratio: number) => Math.min(inv.acKw * ratio, inv.maxPvKwp > 0 ? inv.maxPvKwp : Infinity);

/** The active battery closest in size to what was asked for (or the smallest, when none is named); null with no battery. */
export function batteryOption(s: Pick<PricingSettings, 'batteries'>, kwh: number | undefined): BatteryOption | null {
  const act = s.batteries.filter((b) => b.active).sort((a, b) => a.kwh - b.kwh);
  if (!act.length) return null;
  if (!kwh) return act[0];
  return act.reduce((best, b) => (Math.abs(b.kwh - kwh) < Math.abs(best.kwh - kwh) ? b : best), act[0]);
}

export type Sized = { inverter: Inverter | null; /** the array fits this inverter. */ fits: boolean; /** The most (kWp) the largest eligible inverter takes. */ capKwp: number };

/**
 * The inverter for an array. Always a hybrid on homes (battery-ready) unless the admin allows solar-only; the smallest whose AC rating
 * times the DC/AC ratio takes the array; with a battery, one whose AC rating is at least 85% of what the battery needs. A single-phase
 * supply only takes single-phase inverters. When nothing takes the array, the largest eligible one comes back with fits false (the array is then capped).
 */
export function chooseInverter(s: PricingSettings, kwp: number, opts: { phase?: Phase; batteryKwh?: number } = {}): Sized {
  const phase = opts.phase ?? 'single';
  const battery = (opts.batteryKwh ?? 0) > 0;
  const needHybrid = battery || !s.solarOnlyInverter;
  const pool = s.inverters.filter((i) => i.active && (phase === 'three' || i.phase === 'single') && (!needHybrid || i.hybrid));
  const bySize = [...pool].sort((a, b) => a.acKw - b.acKw || a.cost - b.cost);
  if (!bySize.length) return { inverter: null, fits: false, capKwp: 0 };
  const capKwp = Math.max(...bySize.map((i) => inverterCapacityKwp(i, s.maxDcAcRatio)));
  const batteryNeedKw = battery ? (opts.batteryKwh ?? 0) * s.batteryKwPerKwh * 0.85 : 0;
  const takes = (i: Inverter) => inverterCapacityKwp(i, s.maxDcAcRatio) + 1e-9 >= kwp;
  const pick = bySize.find((i) => takes(i) && i.acKw + 1e-9 >= batteryNeedKw) ?? bySize.find(takes);
  return pick ? { inverter: pick, fits: true, capKwp } : { inverter: bySize[bySize.length - 1], fits: false, capKwp };
}

/** G98 for a single-phase inverter up to 3.68 kW AC; anything bigger needs a G99 application before the install. Set from the inverter, not the array. */
export const gridRouteFor = (acKw: number): 'G98' | 'G99' => (acKw <= G98_LIMIT_KW + 1e-9 ? 'G98' : 'G99');

export type CostLines = { panels: number; mounting: number; labour: number; electrical: number; admin: number; ancillaries: number; scaffolding: number; inverter: number; battery: number; total: number; days: number };

/** Our cost for a job, line by line (never shown to a customer). */
export function costBuild(s: PricingSettings, panels: number, inverter: Inverter | null, battery: BatteryOption | null): CostLines {
  const c = s.costs;
  const days = Math.max(1, Math.ceil(panels / Math.max(1, c.panelsPerDay)));
  const l = {
    panels: round2(c.panel * panels),
    mounting: round2(c.mounting * panels),
    labour: round2(c.labourPerDay * days),
    electrical: round2(c.electrical),
    admin: round2(c.admin),
    ancillaries: round2(c.ancillaryPerWatt * panels * s.panelWatts),
    scaffolding: c.scaffoldingOn ? round2(c.scaffolding) : 0,
    inverter: round2(inverter?.cost ?? 0),
    battery: round2(battery?.cost ?? 0),
  };
  const total = round2(Object.values(l).reduce((a, b) => a + b, 0));
  return { ...l, total, days };
}

/** Price from cost at a margin on price, but never under cost plus the minimum profit. */
export const priced = (cost: number, marginPct: number, minProfit: number) => Math.max(cost / (1 - Math.min(marginPct, 95) / 100), cost + minProfit);
export const marginMid = (s: Pick<PricingSettings, 'marginLow' | 'marginHigh'>) => (s.marginLow + s.marginHigh) / 2;

export type HomePrice = { cost: number; low: number; mid: number; high: number; /** Which prices the minimum profit sets (rather than the margin). */ floor: { low: boolean; mid: boolean; high: boolean }; inverter: Inverter | null; battery: BatteryOption | null; lines: CostLines; capped: boolean; capKwp: number };

/** The full price for a home system from the cost build-up. */
export function homePrice(s: PricingSettings, panels: number, opts: { phase?: Phase; batteryKwh?: number } = {}): HomePrice {
  const kwp = (panels * s.panelWatts) / 1000;
  const battery = opts.batteryKwh && opts.batteryKwh > 0 ? batteryOption(s, opts.batteryKwh) : null;
  const sized = chooseInverter(s, kwp, { phase: opts.phase, batteryKwh: battery?.kwh });
  const lines = costBuild(s, panels, sized.inverter, battery);
  const at = (m: number) => priced(lines.total, m, s.minProfit);
  const floored = (m: number) => lines.total + s.minProfit > lines.total / (1 - Math.min(m, 95) / 100);
  const mid = marginMid(s);
  return { cost: lines.total, low: at(s.marginLow), mid: at(mid), high: at(s.marginHigh), floor: { low: floored(s.marginLow), mid: floored(mid), high: floored(s.marginHigh) }, inverter: sized.inverter, battery, lines, capped: !sized.fits, capKwp: sized.capKwp };
}

/** The most panels a supply takes (the largest inverter's capacity). */
export function maxPanelsFor(s: PricingSettings, phase: Phase, batteryKwh = 0): number {
  const { capKwp } = chooseInverter(s, 0, { phase, batteryKwh });
  return capKwp > 0 ? Math.floor((capKwp * 1000) / s.panelWatts + 1e-9) : 0;
}

export const TABLE_MAX_PANELS = 60;

/** Prices for 1 to 60 panels, by supply and battery size, for the browser (it has no costs). */
export function buildPriceTable(s: PricingSettings): PriceTable {
  const rows: PriceTable['rows'] = {};
  const batteries = [0, ...s.batteries.filter((b) => b.active).map((b) => b.kwh)];
  for (const phase of ['single', 'three'] as Phase[]) {
    for (const kwh of batteries) {
      const arr: (PriceRow | null)[] = [null];
      for (let n = 1; n <= TABLE_MAX_PANELS; n++) {
        const p = homePrice(s, n, { phase, batteryKwh: kwh });
        arr.push(p.inverter ? { low: p.low, mid: p.mid, high: p.high, inverter: p.inverter.name, acKw: p.inverter.acKw, capped: p.capped } : null);
      }
      rows[`${phase}:${kwh}`] = arr;
    }
  }
  return { rows, capKwp: { single: chooseInverter(s, 0, { phase: 'single' }).capKwp, three: chooseInverter(s, 0, { phase: 'three' }).capKwp } };
}

/** A price from the table: the row for this supply, battery size and panel count (panels beyond the table carry on at the last row's rate per panel). */
export function tableRow(t: PriceTable, phase: Phase, batteryKwh: number, panels: number): PriceRow | null {
  const arr = t.rows[`${phase}:${batteryKwh}`] ?? t.rows[`${phase}:0`];
  if (!arr) return null;
  if (panels < arr.length) return arr[Math.max(1, panels)];
  return arr[arr.length - 1];
}

export type GroupedLine = { key: 'panels_inverter' | 'mounting' | 'battery' | 'scaffolding' | 'installation' | 'admin'; label: string; cost: number; price: number };

/**
 * The quote's lines as a customer understands them, each at its share of the cost (scaled to the headline mid price) in whole pounds, adding up exactly to the
 * headline mid price (any rounding goes into the installation line). Costs are never part of what is returned for display: only `price`.
 */
export function groupedLines(l: CostLines, batteryName: string | null, headlineMid: number): GroupedLine[] {
  const g: Omit<GroupedLine, 'price'>[] = [
    { key: 'panels_inverter', label: 'Solar panels and GoodWe inverter', cost: l.panels + l.inverter },
    { key: 'mounting', label: 'Roof mounting system', cost: l.mounting },
    ...(l.battery > 0 ? [{ key: 'battery' as const, label: batteryName ? `Battery storage (${batteryName})` : 'Battery storage', cost: l.battery }] : []),
    ...(l.scaffolding > 0 ? [{ key: 'scaffolding' as const, label: 'Scaffolding', cost: l.scaffolding }] : []),
    { key: 'installation', label: 'Installation and electrical work', cost: l.labour + l.electrical + l.ancillaries },
    { key: 'admin', label: 'Grid application, design, MCS certification and handover', cost: l.admin },
  ];
  const total = g.reduce((a, b) => a + b.cost, 0) || 1;
  const lines = g.map((x) => ({ ...x, price: Math.round((x.cost / total) * headlineMid) }));
  const diff = Math.round(headlineMid) - lines.reduce((a, b) => a + b.price, 0);
  const inst = lines.find((x) => x.key === 'installation')!;
  inst.price += diff;
  return lines;
}

/** Same method as a lender's representative example: monthly payment on a loan over `years` at a fixed annual rate (per cent). */
export function monthlyPayment(principal: number, aprPct: number, years: number): number {
  const n = Math.max(1, Math.round(years * 12));
  const r = Math.pow(1 + aprPct / 100, 1 / 12) - 1; // APR is the effective yearly rate
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}
