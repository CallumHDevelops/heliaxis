/**
 * What the electrician gives for F78, the EESS & PV Handover Document (FORMS 1.5, SPEC 2.13; Unit 4
 * makes the document). Most of F78 comes from elsewhere: the design (system class, usable capacity,
 * estimate, location), the roofer and the serials (descriptions), F43 and the certificate
 * (references). The electrician adds only what they see on site, and is shown what will print so
 * they can say if it's wrong. The office fills its own fields before the pack goes; empty ones are
 * flagged for it, never guessed. Type-only imports.
 */
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { describeArray, stringsF43 } from './f43';
import { has, num, panelsFitted, readOf } from './shared';

/** F78's PV rated power (kW DC) against panels fitted × the panel's Wp read from the badge: null when either isn't known. */
export function ratedPowerCheck(c: FormCtx): { design: number; fitted: number } | null {
  const wp = readOf(c, 'RF12', 'roofer')?.panel?.pmax_w;
  const panels = panelsFitted(c);
  if (!c.system.kwp || !wp || !panels) return null;
  return { design: c.system.kwp, fitted: Math.round(panels * wp) / 1000 };
}

const lines = (rows: [string, string | null][]) => rows.map(([k, v]) => `${k}: ${v ?? 'the office adds this'}`).join('\n');

export const F78_FIELDS: Field[] = [
  {
    key: 'f78_kind',
    type: 'SEL',
    label: 'EESS & PV Handover Certificate',
    level: 'must',
    options: [
      { key: 'initial', label: 'Initial verification' },
      { key: 'periodic', label: 'Periodic verification' },
    ],
    auto: (c) => c.values.f43_kind,
    autoFrom: (c) => (c.values.f43_kind ? 'Same as F43' : null),
    suggest: (c) => (has(c, 'solar') ? null : { v: 'initial', src: 'job', text: 'Initial verification (a new install)' }),
  },
  {
    key: 'f78_p_info',
    type: 'AUTO',
    label: 'PV on the handover document',
    level: 'should',
    show: (c) => has(c, 'solar'),
    suggest: (c) => ({
      v: null,
      src: 'job',
      text: lines([
        ['Installed', describeArray(c)],
        ['Rated power', c.system.kwp ? `${c.system.kwp} kW DC` : null],
        ['Location', c.design.roof_faces],
        ['Estimated performance', c.design.est_kwh_year ? `${c.design.est_kwh_year.toLocaleString('en-GB')} kWh a year` : null],
      ]),
    }),
  },
  {
    key: 'f78_p_circuits',
    type: 'TEXT',
    label: 'Circuits tested',
    hint: 'PV strings and AC circuits, e.g. “2 PV strings; 1 AC circuit”.',
    level: 'should',
    show: (c) => has(c, 'solar'),
    suggest: (c) => {
      const s = stringsF43(c);
      return { v: `${s} PV string${s === 1 ? '' : 's'}`, src: 'job', text: `${s} PV string${s === 1 ? '' : 's'} (add the AC circuits)` };
    },
  },
  {
    key: 'f78_e_info',
    type: 'AUTO',
    label: 'Battery on the handover document',
    level: 'should',
    show: (c) => has(c, 'battery'),
    suggest: (c) => ({
      v: null,
      src: 'job',
      text: lines([
        ['Battery', c.system.battery_model],
        ['System class (MIS 3012)', c.design.eess_class ? `Class ${c.design.eess_class}` : null],
        ['Usable capacity', c.el?.battery_kwh ? `${c.el.battery_kwh} kWh` : null],
        ['Max power output', c.design.battery_kw ? `${c.design.battery_kw} kW` : null],
      ]),
    }),
  },
  {
    key: 'f78_e_kw',
    type: 'NUM',
    label: 'Battery maximum power output',
    hint: 'From the battery or inverter label. The design hasn’t got it.',
    level: 'should',
    unit: 'kW',
    dp: 2,
    min: 0,
    max: 100,
    show: (c) => has(c, 'battery') && c.design.battery_kw === null,
    suggest: (c) => {
      const kw = readOf(c, 'EP31')?.battery?.rated_kw ?? readOf(c, 'EP32')?.inverter?.rated_ac_kw;
      return typeof kw === 'number' ? { v: kw, src: 'photo', text: `${kw} kW` } : null;
    },
  },
];

const missingOffice = (c: FormCtx): string[] => {
  const out: string[] = [];
  if (has(c, 'battery')) {
    if (c.design.eess_class === null) out.push('the battery system class');
    if (c.design.battery_kw === null && num(c.values.f78_e_kw) === null) out.push('the battery’s maximum power output');
    if (!c.el?.battery_kwh) out.push('the battery’s usable capacity');
  }
  if (has(c, 'solar') && c.design.est_kwh_year === null) out.push('the estimated performance');
  return out;
};

export const F78_FLAGS: FlagRule[] = [
  {
    code: 'F78_OFFICE',
    key: '*F78',
    severity: 'review',
    when: (c) => missingOffice(c).length > 0,
    text: (c) => {
      const m = missingOffice(c);
      return `F78 needs ${m.length > 1 ? `${m.slice(0, -1).join(', ')} and ${m.at(-1)}` : m[0]} from the design: fill it in on the job before the pack goes`;
    },
  },
  {
    code: 'F78_KWP',
    key: '*F78',
    severity: 'review',
    when: (c) => {
      const x = ratedPowerCheck(c);
      return !!x && Math.abs(x.design - x.fitted) > 0.005;
    },
    text: (c) => {
      const x = ratedPowerCheck(c)!;
      return `F78 rated power: the job says ${x.design} kW, but ${panelsFitted(c)} panels × ${readOf(c, 'RF12', 'roofer')?.panel?.pmax_w} Wp is ${x.fitted} kW`;
    },
  },
];

export const F78_STEP: Step = {
  key: 'f78',
  title: 'Handover document (F78)',
  intro: 'What goes on the customer’s handover document. Most of it is filled in for you: check it, and add what you can see on site.',
  fields: F78_FIELDS,
};
