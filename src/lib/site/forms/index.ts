/**
 * Which forms each trade fills in on a job. The technologies are the job's products (D1): they decide
 * the electrician's paperwork (`formsFor`, stored on the assignment when the electrician is
 * assigned, and changed with ticks on the Site tab), and which trades New project suggests.
 *
 * Type-only imports, so scripts/test-site-forms.mjs loads it straight into node.
 */
import type { Design } from '../design';
import type { Trade } from '../types';
import { certificateForm } from './electrician/eic';
import { ROOFER } from './roofer';
import { SCAFFOLD_DOWN, SCAFFOLD_UP } from './scaffold';
import type { SiteForm } from './types';

/**
 * Bumped when fields are added. Stored on each assignment when it's made, and an assignment is
 * always shown with the forms of its own version (keys never change once used; new ones are added).
 */
export const SITE_SCHEMA_VERSION = 2;

/**
 * The forms for each trade, stage by stage (the scaffolder's erection, then the strike). The
 * electrician's pack is built from the sections on the assignment (Unit 2 adds them here). Until it
 * does, the electrician's pack is the certificate (electrician/eic.ts EIC_STEPS, with a sign-off).
 */
const BY_TRADE: Partial<Record<Trade, SiteForm[]>> = { roofer: [ROOFER], scaffolder: [SCAFFOLD_UP, SCAFFOLD_DOWN] };
const ELECTRICIAN: ((forms: string[]) => SiteForm)[] = [certificateForm];

/** Every form of every trade (the electrician's with all its sections), for the key checks in the tests. */
export function allForms(): SiteForm[] {
  return [...Object.values(BY_TRADE).flat(), ...ELECTRICIAN.map((make) => make([...ELECTRICIAN_FORMS]))];
}

/** The forms an assignment is filled in with, in stage order. */
export function schemaFor(a: { trade: Trade; forms?: string[] | null; schema_version?: number | null }): SiteForm[] {
  if (a.trade === 'electrician') return ELECTRICIAN.map((make) => make(a.forms ?? []));
  return BY_TRADE[a.trade] ?? [];
}

/** The electrician's sections in the order they appear on the phone (SPEC 2.1). */
export const ELECTRICIAN_FORMS = ['photos', 'serials', 'f43', 'f44', 'f44a', 'f74', 'pas63100', 'ev', 'heatpump', 'f78', 'cert', 'finish'] as const;
export type ElectricianForm = (typeof ELECTRICIAN_FORMS)[number];
export const isElectricianForm = (v: unknown): v is ElectricianForm => ELECTRICIAN_FORMS.includes(v as ElectricianForm);

export const FORM_LABEL: Record<ElectricianForm, string> = {
  photos: 'Photos as you go',
  serials: 'Serials',
  f43: 'PV tests (F43)',
  f44: 'PV checklist (F44)',
  f44a: 'PV commissioning (F44A)',
  f74: 'Battery checks (F74/F75)',
  pas63100: 'Battery location (PAS 63100)',
  ev: 'EV charger record',
  heatpump: 'Heat pump supply',
  f78: 'Handover document data (F78)',
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
  if (has(products, 'solar')) ['f43', 'f44', 'f44a'].forEach((f) => out.add(f as ElectricianForm));
  if (has(products, 'battery')) {
    out.add('f74');
    if (design?.pas63100) out.add('pas63100');
  }
  if (has(products, 'ev')) out.add('ev');
  if (has(products, 'heatpump')) out.add('heatpump');
  if (has(products, 'solar', 'battery')) out.add('f78');
  out.add('cert');
  out.add('finish');
  return ELECTRICIAN_FORMS.filter((f) => out.has(f));
}

/** Forms the products now call for that the assignment's list doesn't have ("This job now includes a battery…"). */
export const formsMissing = (current: string[], products: string[], design: Pick<Design, 'pas63100'> | null = null) =>
  formsFor(products, design).filter((f) => !current.includes(f));

/** The roofer's form is for solar jobs only; the scaffold forms for any job with a scaffolder. */
export const rooferApplies = (products: string[]) => has(products, 'solar');

/** The trades New project suggests (SPEC 1D): solar → scaffolder, roofer, electrician; battery, EV or heat pump → electrician. */
export function suggestedTrades(products: string[]): Trade[] {
  const out: Trade[] = [];
  if (has(products, 'solar')) out.push('scaffolder', 'roofer');
  if (has(products, 'solar', 'battery', 'ev', 'heatpump')) out.push('electrician');
  return out;
}
