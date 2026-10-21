/**
 * F44A Solar PV Commissioning Checklist (SPEC 2.7, D13): Heliaxis's own until the owner sends his
 * form, built from the commissioning steps (MIS 3002, BS EN IEC 62446-1). Most rows are answered by
 * what's already been given and show "Done in [section]"; the rest are one tap. Any of them can be
 * changed. Type-only imports, plus the rules.
 */
import { perStringValues } from '../../rules';
import type { Field, FormCtx, Step } from '../types';
import { f43Field } from './f43';
import { el, has, is, num, tick } from './shared';

/** One constant, printed in the footer. */
export const F44A_REVISION = 'Rev 1';
export const F44A_TITLE = 'Solar PV Commissioning Checklist';

export const F44A_ROWS = [
  { n: 1, key: 'f44a_1', label: 'Inverter started to the manufacturer’s procedure' },
  { n: 2, key: 'f44a_2', label: 'Grid protection settings checked against G98/G99' },
  { n: 3, key: 'f44a_3', label: 'Export limit set and proved where the design has one (G100)' },
  { n: 4, key: 'f44a_4', label: 'AC and DC isolators switched and proved' },
  { n: 5, key: 'f44a_5', label: 'Generation meter fitted and opening reading recorded' },
  { n: 6, key: 'f44a_6', label: 'Monitoring commissioned' },
  { n: 7, key: 'f44a_7', label: 'Labels fitted at the origin, meter and consumer unit' },
  { n: 8, key: 'f44a_8', label: 'System seen producing or exporting' },
  { n: 9, key: 'f44a_9', label: 'Customer shown how to isolate' },
];

const isoChecks = (c: FormCtx) => perStringValues(f43Field('f43_iso_func'), c);
/** F44's labelling rows: all done, and F44A's labels row is done too. */
const LABELS = ['f44_29', 'f44_33', 'f44_34', 'f44_35'];

const rows: Record<number, Partial<Field>> = {
  1: { auto: (c) => (c.values.EF1 === true ? 'done' : undefined), autoWaits: (c) => c.values.EF1 !== true, autoFrom: () => 'Done in Finish', hint: 'Ticks itself when you confirm the inverter is commissioned (Finish).' },
  2: { evidence: ['EP27'], note: (c) => (el(c).dno_route ? `DNO route: ${el(c).dno_route?.toUpperCase()}` : null) },
  3: {
    auto: (c) => (el(c).export_limit_kw === null ? 'na' : undefined),
    autoFrom: (c) => (el(c).export_limit_kw === null ? 'No export limit in the design' : null),
    note: (c) => (el(c).export_limit_kw !== null ? `The design has a ${el(c).export_limit_kw} kW export limit.` : null),
  },
  4: { note: (c) => (isoChecks(c).length && isoChecks(c).every((v) => v === 'pass') ? 'DC: F43 isolator checks passed ✓. Confirm the AC isolator too.' : 'DC: the F43 isolator checks. Confirm the AC isolator too.') },
  5: {
    auto: (c) => ((c.photos.EP26 ?? 0) > 0 && num(c.values.EP26r) !== null ? 'done' : undefined),
    autoWaits: (c) => !((c.photos.EP26 ?? 0) > 0 && num(c.values.EP26r) !== null),
    autoFrom: (c) => (num(c.values.EP26r) !== null ? `Done in Serials: ${c.values.EP26r} kWh` : 'Done in Serials'),
  },
  6: {
    auto: (c) => (c.values.EF2 === 'yes' ? 'done' : c.values.EF2 === 'not_possible' ? 'problem' : undefined),
    autoWaits: (c) => c.values.EF2 === undefined,
    autoFrom: (c) => (c.values.EF2 === 'not_possible' ? 'Not possible: from Finish' : 'Done in Finish'),
    hint: 'Answered when you say whether it’s on the customer’s internet (Finish).',
  },
  7: {
    auto: (c) => (LABELS.every((k) => is(c, k, 'done')) ? 'done' : undefined),
    autoWaits: (c) => LABELS.some((k) => c.values[k] === undefined),
    autoFrom: () => 'Done in PV checklist (F44)',
    evidence: ['EP08'],
  },
  8: {},
  9: {},
};

export const F44A_FIELDS: Field[] = F44A_ROWS.flatMap((r) => {
  const extra = rows[r.n] ?? {};
  // A row answered by Finish can't have its note on this screen: Finish holds the why.
  return r.n === 6 ? [{ key: r.key, type: 'TICK' as const, label: `${r.n}. ${r.label}`, level: 'must' as const, ...extra }] : tick(r.key, `${r.n}. ${r.label}`, extra);
});

export const F44A_STEP: Step = {
  key: 'f44a',
  title: 'PV commissioning (F44A)',
  intro: 'Most of these tick themselves from what you’ve already done. Tap the rest.',
  show: (c) => has(c, 'solar'),
  fields: F44A_FIELDS,
};
