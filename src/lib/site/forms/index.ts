/**
 * Which forms each trade fills in on a job. The technologies are the job's products (D1): they decide
 * the electrician's paperwork (`formsFor`, stored on the assignment when the electrician is
 * assigned, and changed with ticks on the Site tab), and which trades New project suggests.
 *
 * Type-only imports, so scripts/test-site-forms.mjs loads it straight into node.
 */
import type { Design } from '../design';
import type { Trade } from '../types';
import { electricianForm } from './electrician/index';
import { legacySections } from './legacy';
import { ROOFER } from './roofer';
import { SCAFFOLD_DOWN, SCAFFOLD_UP } from './scaffold';
import type { SiteForm } from './types';

/**
 * Bumped when fields are added. Stored on each assignment when it's made, and an assignment is
 * always shown with the forms of its own version (keys never change once used; new ones are added).
 * Version 4: the electrician's records in Heliaxis's own words and keys (WORDING-SPEC 12); answers
 * saved under the old keys are read through LEGACY_KEYS (forms/legacy.ts).
 */
export const SITE_SCHEMA_VERSION = 4;
export { LEGACY_KEYS, withLegacy } from './legacy';

/**
 * The forms for each trade, stage by stage (the scaffolder's erection, then the strike). The
 * electrician's pack is built from the sections on the assignment (forms/electrician).
 */
const BY_TRADE: Partial<Record<Trade, SiteForm[]>> = { roofer: [ROOFER], scaffolder: [SCAFFOLD_UP, SCAFFOLD_DOWN] };
const ELECTRICIAN: ((forms: string[]) => SiteForm)[] = [(forms) => electricianForm(forms, ELECTRICIAN_FORMS)];

/** Every form of every trade (the electrician's with all its sections), for the key checks in the tests. */
export function allForms(): SiteForm[] {
  return [...Object.values(BY_TRADE).flat(), ...ELECTRICIAN.map((make) => make([...ELECTRICIAN_FORMS]))];
}

/** The forms an assignment is filled in with, in stage order (a phone's copy saved before version 4 may still hold the old section ids). */
export function schemaFor(a: { trade: Trade; forms?: string[] | null; schema_version?: number | null }): SiteForm[] {
  if (a.trade === 'electrician') return ELECTRICIAN.map((make) => make(legacySections(a.forms ?? [])));
  return BY_TRADE[a.trade] ?? [];
}

/** The electrician's sections in the order they appear on the phone (SPEC 2.1). */
export const ELECTRICIAN_FORMS = ['photos', 'serials', 'pvinspect', 'pvtests', 'pvswitchon', 'battery', 'pas63100', 'ev', 'heatpump', 'summary', 'cert', 'finish'] as const;
export type ElectricianForm = (typeof ELECTRICIAN_FORMS)[number];
export const isElectricianForm = (v: unknown): v is ElectricianForm => ELECTRICIAN_FORMS.includes(v as ElectricianForm);

export const FORM_LABEL: Record<ElectricianForm, string> = {
  photos: 'Photos as you go',
  serials: 'Serials',
  pvinspect: 'PV inspection',
  pvtests: 'String tests',
  pvswitchon: 'Switch-on',
  battery: 'Battery',
  pas63100: 'Battery location (PAS 63100)',
  ev: 'EV charger record',
  heatpump: 'Heat pump supply',
  summary: 'System summary',
  cert: 'Certificate',
  finish: 'Finish',
};

const has = (products: string[], ...keys: string[]) => products.some((p) => keys.includes(p));

/**
 * The electrician's paperwork for these technologies (SPEC 5.1). Every job: photos, the certificate
 * and the finish. Infrared, LED and other: nothing more.
 */
export function formsFor(products: string[], design: Pick<Design, 'pas63100'> | null = null): ElectricianForm[] {
  const out = new Set<ElectricianForm>(['photos']);
  if (has(products, 'solar', 'battery', 'ev', 'heatpump')) out.add('serials');
  if (has(products, 'solar')) ['pvinspect', 'pvtests', 'pvswitchon'].forEach((f) => out.add(f as ElectricianForm));
  if (has(products, 'battery')) {
    out.add('battery');
    if (design?.pas63100) out.add('pas63100');
  }
  if (has(products, 'ev')) out.add('ev');
  if (has(products, 'heatpump')) out.add('heatpump');
  if (has(products, 'solar', 'battery')) out.add('summary');
  out.add('cert');
  out.add('finish');
  return ELECTRICIAN_FORMS.filter((f) => out.has(f));
}

/** Forms the products now call for that the assignment's list doesn't have ("This job now includes a battery…"). */
export const formsMissing = (current: string[], products: string[], design: Pick<Design, 'pas63100'> | null = null) =>
  formsFor(products, design).filter((f) => !current.includes(f));

/** The roofer's form is for solar jobs only; the scaffold forms for any job with a scaffolder. */
export const rooferApplies = (products: string[]) => has(products, 'solar');

/** The trades New project suggests: in ../trades.ts, which imports no forms (the admin pages load it). */
export { suggestedTrades } from '../trades';
