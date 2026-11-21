/**
 * Everything the quote PDF and email say, worked out from the answers and the stored settings. Pure, and made so that nothing in it is a cost:
 * only the figures a customer sees (the range, the mid price behind the grouped lines, savings). The server builds it again from the answers, never from the browser's prices.
 */
import { estimate, type Award, type Estimate, type EstimatorSettings, type Inputs } from './calc';
import { includedItems } from './included';
import { groupedLines, homePrice, type Phase } from './pricing';
import { QUOTE_VALID_DAYS } from './copy';

export type QuoteFacts = {
  reference: string;
  /** YYYY-MM-DD */
  issued: string;
  validUntil: string;
  customerName: string;
  address: string;
  postcode: string;
  home: boolean;
  panels: number;
  panelWatts: number;
  kwp: number;
  inverter: string | null;
  gridRoute: 'G98' | 'G99' | null;
  batteryKwh: number;
  batteryName: string | null;
  generation: number;
  selfPct: number;
  saving: [number, number];
  payback: [number, number];
  net25: number;
  co2Tonnes: number;
  /** The range shown, rounded to £50. */
  priceLow: number;
  priceHigh: number;
  vatLabel: string;
  included: string[];
  /** Grouped prices that add up exactly to `lineTotal` (the mid price), when the admin has switched them on; otherwise null. */
  lines: { label: string; price: number }[] | null;
  lineTotal: number | null;
  award: Award | null;
  workmanshipYears: number;
  phaseCapped: boolean;
  phaseCapKwp: number;
};

export const round50 = (n: number) => Math.round(n / 50) * 50;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function buildQuoteFacts(args: { reference: string; customerName: string; address: string; postcode: string; inputs: Inputs; settings: EstimatorSettings; imp?: number; exp?: number; now?: Date }): QuoteFacts {
  const { inputs, settings } = args;
  const live = { ...settings, ...(args.imp ? { importPence: args.imp } : {}), ...(args.exp !== undefined ? { exportPence: args.exp } : {}) };
  const r: Estimate = estimate(inputs, live);
  const home = inputs.who === 'home';
  const now = args.now ?? new Date();
  const batteryName = r.batteryKwh ? (settings.batteries.find((b) => Math.abs(b.kwh - r.batteryKwh) < 0.01)?.name ?? `${r.batteryKwh} kWh battery`) : null;
  const pkg = settings.packages.find((p) => p.active && p.kind === (r.batteryKwh ? 'solar_battery' : 'solar'));

  let lines: QuoteFacts['lines'] = null;
  let lineTotal: number | null = null;
  if (settings.pdfShowLinePrices && r.pricing === 'costModel') {
    const phase: Phase = r.phase;
    const p = homePrice(live, r.panels, { phase, batteryKwh: r.batteryKwh });
    lineTotal = Math.round(r.cost);
    lines = groupedLines(p.lines, batteryName, settings.markupMid, lineTotal).map((l) => ({ label: l.label, price: l.price }));
  }
  const valid = new Date(now.getTime() + QUOTE_VALID_DAYS * 864e5);
  return {
    reference: args.reference,
    issued: ymd(now),
    validUntil: ymd(valid),
    customerName: args.customerName,
    address: args.address,
    postcode: args.postcode,
    home,
    panels: r.panels,
    panelWatts: settings.panelWatts,
    kwp: r.kwp,
    inverter: r.inverter,
    gridRoute: r.gridRoute,
    batteryKwh: r.batteryKwh,
    batteryName,
    generation: r.generation,
    selfPct: r.selfPct,
    saving: [r.savingLow, r.savingHigh],
    payback: [r.paybackLow, r.paybackHigh],
    net25: r.net25,
    co2Tonnes: r.co2Tonnes,
    priceLow: round50(r.costLow),
    priceHigh: round50(r.costHigh),
    vatLabel: home ? 'fitted, 0% VAT' : 'fitted, plus VAT',
    included: includedItems({ panels: r.panels, inverter: r.inverter, batteryName, scaffolding: settings.costs.scaffoldingOn || !home, workmanshipYears: settings.workmanshipYears, packageIncludes: pkg?.includes }),
    lines,
    lineTotal,
    award: settings.award.on ? settings.award : null,
    workmanshipYears: settings.workmanshipYears,
    phaseCapped: r.phaseCapped,
    phaseCapKwp: r.phaseCapKwp,
  };
}
