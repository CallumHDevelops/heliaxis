/**
 * What the electrician gives for HX-HO-02, the system summary and sign-off (WORDING-SPEC 7.1; the
 * handover pack makes the document). Most of the summary comes from elsewhere: the design (system
 * class, usable storage, estimate, where the panels are), the roofer and the serials (what was
 * fitted), the string tests and the certificate (the records behind it). The electrician adds only
 * what they see on site, is shown what will print so they can say if it's wrong, and sees the part
 * they sign. The office fills its own fields before the pack goes; empty ones are flagged for it,
 * never guessed. Type-only imports.
 */
import { SUMMARY_DECLARATIONS, summaryStandards } from '../../declaration';
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { eicSummary } from './eic';
import { describeArray, pvStringCount, TEST_KINDS } from './pv-tests';
import { has, num, panelsFitted, readOf } from './shared';

/** The panel power (kW DC) against panels fitted × the panel's Wp read from the badge: null when either isn't known. */
export function ratedPowerCheck(c: FormCtx): { design: number; fitted: number } | null {
  const wp = readOf(c, 'RF12', 'roofer')?.panel?.pmax_w;
  const panels = panelsFitted(c);
  if (!c.system.kwp || !wp || !panels) return null;
  return { design: c.system.kwp, fitted: Math.round(panels * wp) / 1000 };
}

/**
 * "2 PV strings; Solar PV inverter (circuit 7)": the summary's circuits tested from the string tests'
 * strings and the AC circuits on the EIC made in the app, the same as the phone suggests; null until
 * the EIC lists them.
 */
export function circuitsTested(c: FormCtx): string | null {
  const s = pvStringCount(c);
  const ac = eicSummary(c).circuits;
  return ac.length ? `${s} PV string${s === 1 ? '' : 's'}; ${ac.join('; ')}` : null;
}

const lines = (rows: [string, string | null][]) => rows.map(([k, v]) => `${k}: ${v ?? 'the office adds this'}`).join('\n');

export const SUMMARY_FIELDS: Field[] = [
  {
    key: 'hos_kind',
    type: 'SEL',
    label: 'Is this a new installation or a re-test?',
    hint: 'Pick New installation unless you’re re-testing a system that was already in use.',
    level: 'must',
    options: TEST_KINDS,
    auto: (c) => c.values.pvt_kind,
    autoFrom: (c) => (c.values.pvt_kind ? 'Same as your string tests' : null),
    suggest: (c) => (has(c, 'solar') ? null : { v: 'initial', src: 'job', text: 'New installation' }),
  },
  {
    key: 'hos_pv_view',
    type: 'AUTO',
    label: 'What prints for the solar panels',
    hint: 'From the design and the roofer’s answers. If something’s wrong, tell the office before you sign off.',
    level: 'should',
    show: (c) => has(c, 'solar'),
    suggest: (c) => ({
      v: null,
      src: 'job',
      text: lines([
        ['Fitted', describeArray(c)],
        ['Panel power', c.system.kwp ? `${c.system.kwp} kWp` : null],
        ['Where', c.design.roof_faces],
        ['Estimated generation', c.design.est_kwh_year ? `${c.design.est_kwh_year.toLocaleString('en-GB')} kWh a year` : null],
      ]),
    }),
  },
  {
    key: 'hos_circuits',
    type: 'TEXT',
    label: 'Which circuits did you test?',
    hint: 'The PV strings and the AC circuits, for example “2 PV strings; 1 AC circuit to the inverter”.',
    level: 'should',
    show: (c) => has(c, 'solar'),
    suggest: (c) => {
      const s = pvStringCount(c);
      const pv = `${s} PV string${s === 1 ? '' : 's'}`;
      // The AC circuits from the EIC made in the app, once they're on it.
      const ac = eicSummary(c).circuits;
      return ac.length ? { v: `${pv}; ${ac.join('; ')}`, src: 'job', text: `${pv}; ${ac.join('; ')} (from the EIC)` } : { v: pv, src: 'job', text: `${pv} (add the AC circuits)` };
    },
  },
  {
    key: 'hos_bat_view',
    type: 'AUTO',
    label: 'What prints for the battery',
    hint: 'From the design and the battery’s label. If something’s wrong, tell the office before you sign off.',
    level: 'should',
    show: (c) => has(c, 'battery'),
    suggest: (c) => ({
      v: null,
      src: 'job',
      text: lines([
        ['Battery', c.system.battery_model],
        ['MCS system class', c.design.eess_class ? `Class ${c.design.eess_class}` : null],
        ['Usable storage', c.el?.battery_kwh ? `${c.el.battery_kwh} kWh` : null],
        ['Maximum output', c.design.battery_kw ? `${c.design.battery_kw} kW` : null],
      ]),
    }),
  },
  {
    key: 'hos_bat_kw',
    type: 'NUM',
    label: 'What’s the battery’s maximum output?',
    hint: 'Read it off the battery’s or the inverter’s rating label. It’s only asked because the design doesn’t give it.',
    level: 'should',
    unit: 'kW',
    dp: 2,
    min: 0,
    max: 100,
    show: (c) => has(c, 'battery') && c.design.battery_kw === null,
    suggest: (c) => {
      const kw = readOf(c, 'EP31')?.battery?.rated_kw ?? readOf(c, 'EP32')?.inverter?.rated_ac_kw;
      return typeof kw === 'number' ? { v: kw, src: 'photo', text: `${kw} kW (from the photo)` } : null;
    },
  },
  {
    key: 'hos_decl',
    type: 'AUTO',
    label: 'What you’re signing',
    hint: 'When you sign off at Finish, you also sign this summary’s “Installed, inspected and tested by” part.',
    level: 'should',
    suggest: (c) => ({ v: null, src: 'job', text: SUMMARY_DECLARATIONS.install(summaryStandards(c.products)) }),
  },
];

const missingOffice = (c: FormCtx): string[] => {
  const out: string[] = [];
  if (has(c, 'battery')) {
    if (c.design.eess_class === null) out.push('the battery system class');
    if (c.design.battery_kw === null && num(c.values.hos_bat_kw) === null) out.push('the battery’s maximum output');
    if (!c.el?.battery_kwh) out.push('the battery’s usable storage');
  }
  if (has(c, 'solar') && c.design.est_kwh_year === null) out.push('the estimated generation');
  return out;
};

export const SUMMARY_FLAGS: FlagRule[] = [
  {
    code: 'HOS_OFFICE',
    key: '*summary',
    severity: 'review',
    when: (c) => missingOffice(c).length > 0,
    text: (c) => {
      const m = missingOffice(c);
      return `The system summary needs ${m.length > 1 ? `${m.slice(0, -1).join(', ')} and ${m.at(-1)}` : m[0]} from the design: add it on the job before the pack goes`;
    },
  },
  {
    code: 'HOS_KWP',
    key: '*summary',
    severity: 'review',
    when: (c) => {
      const x = ratedPowerCheck(c);
      return !!x && Math.abs(x.design - x.fitted) > 0.005;
    },
    text: (c) => {
      const x = ratedPowerCheck(c)!;
      return `Panel power: the job says ${x.design} kW, but ${panelsFitted(c)} panels × ${readOf(c, 'RF12', 'roofer')?.panel?.pmax_w} Wp is ${x.fitted} kW`;
    },
  },
];

export const SUMMARY_STEP: Step = {
  key: 'summary',
  title: 'System summary',
  intro: 'This is the customer’s one-page summary of the system. Most of it fills itself in from the design and your other answers. Check what’s shown, and fill in what only you know.',
  fields: SUMMARY_FIELDS,
};
