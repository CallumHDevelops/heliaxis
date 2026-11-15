/**
 * The summary the solar estimator sends with a lead: one fact to a line, "Label: value", under a "Solar estimator" heading, so it reads well in the
 * CRM, in the alert email and when someone rings them back. Pure: the estimator builds it, the emails and the CRM card read it.
 */
export type EstimateFact = { label: string; value: string };

type Facts = {
  kwp: number;
  panels: number;
  batteryKwh: number;
  generation: string;
  saving: string;
  cost: string;
  payback: string;
  uses: string;
  shade: string;
  daytime: string;
  ev: boolean;
  heatpump: boolean;
  roof: string;
  packageName?: string | null;
};

export function buildEstimateMessage(f: Facts): string {
  const lines: [string, string][] = [
    ['System', `${f.kwp.toFixed(2)} kWp (${f.panels} panels)`],
    ...(f.packageName ? ([['Package', f.packageName]] as [string, string][]) : []),
    ...(f.batteryKwh ? ([['Battery', `${f.batteryKwh} kWh`]] as [string, string][]) : []),
    ['Generation', `about ${f.generation} kWh a year`],
    ['Saving', `about ${f.saving} a year`],
    ['Indicative cost', f.cost],
    ['Payback', `about ${f.payback} years`],
    ['Uses', f.uses],
    ['Shade', f.shade],
    ['Daytime', f.daytime],
    ...(f.ev ? ([['Electric car', 'yes']] as [string, string][]) : []),
    ...(f.heatpump ? ([['Heat pump', 'yes']] as [string, string][]) : []),
    ['Roof', f.roof],
  ];
  return `Solar estimator\n${lines.map(([l, v]) => `${l}: ${v}`).join('\n')}`;
}

/** The facts in an estimator lead's message, or null when it isn't one (older leads keep their single sentence). */
export function parseEstimate(message?: string | null): EstimateFact[] | null {
  const m = String(message ?? '');
  if (!/^Solar estimator\s*\n/.test(m)) return null;
  const out: EstimateFact[] = [];
  for (const line of m.split('\n').slice(1)) {
    const i = line.indexOf(': ');
    if (i > 0) out.push({ label: line.slice(0, i).trim(), value: line.slice(i + 2).trim() });
  }
  return out.length ? out : null;
}

/** The headline figures first, in the order a person wants them when they pick up the phone. */
export const HEADLINE = ['System', 'Package', 'Battery', 'Saving', 'Indicative cost', 'Payback', 'Generation'];
export function headline(facts: EstimateFact[]): EstimateFact[] {
  return HEADLINE.flatMap((l) => facts.filter((f) => f.label === l));
}
export function rest(facts: EstimateFact[]): EstimateFact[] {
  return facts.filter((f) => !HEADLINE.includes(f.label));
}
