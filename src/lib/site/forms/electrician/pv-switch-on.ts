/**
 * HX-PV-03 Solar PV switch-on record (WORDING-SPEC 3): Heliaxis's own switch-on checks (MIS 3002,
 * BS EN IEC 62446-1). Most rows are answered by what's already been given and show where from
 * ("Done in PV inspection"); the rest are one tap. Any of them can be changed. Type-only imports,
 * plus the rules.
 */
import { perStringValues } from '../../rules';
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { pvTestField } from './pv-tests';
import { el, has, is, num, text, tick } from './shared';

export const PV_SWITCHON_TITLE = 'Solar PV switch-on record';

/** The record's groups, in order. */
export const PV_SWITCHON_GROUPS = ['Before you switch on', 'Switching on', 'Before you leave'] as const;

export type PvSwitchOnRow = { key: string; group: (typeof PV_SWITCHON_GROUPS)[number]; q: string; help?: string };

export const PV_SWITCHON_ROWS: PvSwitchOnRow[] = [
  {
    key: 'pvc_labels',
    group: 'Before you switch on',
    q: 'Warning labels up?',
    help: 'Notices that there’s more than one supply: at the origin, at the meter if it’s somewhere else, at the consumer unit the PV connects to, and at every point where a supply can be isolated (BS 7671 Reg 514.15).',
  },
  { key: 'pvc_start', group: 'Switching on', q: 'Inverter started using the maker’s steps?', help: 'Ticks itself when you confirm at Finish that the inverter is commissioned.' },
  { key: 'pvc_grid', group: 'Switching on', q: 'Inverter on the right UK grid setting?', help: 'The G98 or G99 setting that matches how the DNO was told. Photograph the settings screen.' },
  {
    key: 'pvc_isolators',
    group: 'Switching on',
    q: 'AC and DC isolators switch off and on?',
    help: 'The DC side is already checked string by string. Switch the AC isolator off and on too, and check the inverter drops off and comes back.',
  },
  {
    key: 'pvc_export',
    group: 'Switching on',
    q: 'Export limit set and working?',
    help: 'Only where the design has one (ENA G100). Set it to the design’s figure, then prove it holds export back, the way the maker says.',
  },
  { key: 'pvc_generating', group: 'Switching on', q: 'Seen it generating?', help: 'On the inverter screen or app: making power, or exporting when the house isn’t using it all.' },
  { key: 'pvc_meter', group: 'Switching on', q: 'Generation meter fitted and reading taken?', help: 'Ticks itself when the meter photo and today’s reading are in Serials.' },
  { key: 'pvc_monitoring', group: 'Before you leave', q: 'Monitoring online?', help: 'Comes from your Finish answer about the customer’s internet.' },
  { key: 'pvc_shown', group: 'Before you leave', q: 'Shown the customer how to switch it off?', help: 'Walk them through the switch-off steps on the shutdown notice.' },
];

const isoChecks = (c: FormCtx) => perStringValues(pvTestField('pvt_iso_ok'), c);
/** The PV inspection's labelling rows: all done, and the switch-on's labels row is done too. */
const LABELS = ['pvi_labels', 'pvi_ac_label', 'pvi_dc_label', 'pvi_labels_last'];

const EXTRA: Record<string, Partial<Field>> = {
  pvc_labels: {
    auto: (c) => (LABELS.every((k) => is(c, k, 'done')) ? 'done' : undefined),
    autoWaits: (c) => LABELS.some((k) => c.values[k] === undefined),
    autoFrom: () => 'Done in PV inspection',
    evidence: ['EP08'],
  },
  pvc_start: { auto: (c) => (c.values.EF1 === true ? 'done' : undefined), autoWaits: (c) => c.values.EF1 !== true, autoFrom: () => 'Done in Finish' },
  pvc_grid: { evidence: ['EP27'], note: (c) => (el(c).dno_route ? `DNO route: ${el(c).dno_route?.toUpperCase()}` : null) },
  pvc_isolators: {
    note: (c) => (isoChecks(c).length && isoChecks(c).every((v) => v === 'pass') ? 'DC: passed on every string ✓. Check the AC isolator too.' : 'DC: see String tests. Check the AC isolator too.'),
  },
  pvc_export: {
    auto: (c) => (el(c).export_limit_kw === null ? 'na' : undefined),
    autoFrom: (c) => (el(c).export_limit_kw === null ? 'No export limit in the design' : null),
    note: (c) => (el(c).export_limit_kw !== null ? `The design has a ${el(c).export_limit_kw} kW export limit.` : null),
    evidence: ['EP28'],
  },
  pvc_meter: {
    auto: (c) => ((c.photos.EP26 ?? 0) > 0 && num(c.values.EP26r) !== null ? 'done' : undefined),
    autoWaits: (c) => !((c.photos.EP26 ?? 0) > 0 && num(c.values.EP26r) !== null),
    autoFrom: (c) => (num(c.values.EP26r) !== null ? `Done in Serials: ${c.values.EP26r} kWh` : 'Done in Serials'),
  },
  pvc_monitoring: {
    auto: (c) => (c.values.EF2 === 'yes' ? 'done' : c.values.EF2 === 'not_possible' ? 'problem' : undefined),
    autoWaits: (c) => c.values.EF2 === undefined,
    autoFrom: (c) => (c.values.EF2 === 'not_possible' ? 'Not possible: from Finish' : 'Done in Finish'),
  },
};

export const PV_SWITCHON_FIELDS: Field[] = PV_SWITCHON_ROWS.flatMap((r, i) => {
  const extra: Partial<Field> = { hint: r.help, ...(i === 0 || PV_SWITCHON_ROWS[i - 1].group !== r.group ? { group: r.group } : {}), ...EXTRA[r.key] };
  // A row answered by Finish can't have its note on this screen: Finish holds the why.
  return r.key === 'pvc_monitoring' ? [{ key: r.key, type: 'TICK' as const, label: r.q, level: 'must' as const, ...extra }] : tick(r.key, r.q, extra);
});

/** Where N/A is expected on the switch-on record: only the export limit, when the design has none. */
const naExpected = (key: string, c: FormCtx) => key === 'pvc_export' && el(c).export_limit_kw === null;
export const pvSwitchOnCode = (key: string) => `PVC_${key.replace(/^pvc_/, '').toUpperCase()}`;

export const PV_SWITCHON_FLAGS: FlagRule[] = [
  ...PV_SWITCHON_ROWS.filter((r) => r.key !== 'pvc_monitoring').map(
    (r): FlagRule => ({
      code: pvSwitchOnCode(r.key),
      key: r.key,
      severity: 'urgent',
      when: (c) => is(c, r.key, 'problem'),
      text: (c) => `Switch-on ✗ ${r.q.replace(/\?$/, '')}${text(c, `${r.key}n`) ? `: ${text(c, `${r.key}n`)}` : ''}`,
    })
  ),
  ...PV_SWITCHON_ROWS.map(
    (r): FlagRule => ({
      code: `${pvSwitchOnCode(r.key)}_NA`,
      key: r.key,
      severity: 'review',
      when: (c) => is(c, r.key, 'na') && !naExpected(r.key, c),
      text: () => `Switch-on: N/A on ${r.q.replace(/\?$/, '')}`,
    })
  ),
];

export const PV_SWITCHON_STEP: Step = {
  key: 'pv-switch-on',
  title: 'Switch-on',
  intro: 'Most of these tick themselves from what you’ve already done. Tap the rest.',
  show: (c) => has(c, 'solar'),
  fields: PV_SWITCHON_FIELDS,
};
