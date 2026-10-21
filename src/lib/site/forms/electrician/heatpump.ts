/**
 * Heat pump supply record (SPEC 2.11): the electrical part only; the heat pump itself is commissioned
 * in SimpliHeat. The fields follow SimpliHeat's commissioning schema (elecCertRef, elecTestedBy,
 * elecNotify, the insulation and supply readings): the certificate it came from, who tested it, how
 * it was notified, insulation resistance L–E and L–N, the supply voltages at the unit (three-phase
 * rows when chosen), the isolator, the RCD type, the cable size and the DNO route. Readings are
 * typed, never offered. Type-only imports.
 */
import type { Field, FormCtx, Step } from '../types';
import { certRef } from './cert';
import { el, has, is } from './shared';

export const HP_TITLE = 'Heat Pump Electrical Supply Record';

const three = (c: FormCtx) => is(c, 'hp_phase', 'three');
const volts = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, type: 'NUM', label, level: 'must', unit: 'V', dp: 1, min: 0, max: 500, ...extra });

export const HP_NOTIFY = [
  { key: 'scheme', label: 'Self-certified under a competent person scheme' },
  { key: 'bc', label: 'Notified to building control' },
  { key: 'none', label: 'Not notifiable' },
];

export const HP_FIELDS: Field[] = [
  {
    key: 'hp_cert_ref',
    type: 'TEXT',
    label: 'Electrical certificate reference',
    hint: 'The EIC or Minor Works certificate the readings below come from.',
    level: 'must',
    group: 'The certificate',
    suggest: (c) => (certRef(c) ? { v: certRef(c), src: 'job', text: certRef(c)! } : null),
  },
  {
    key: 'hp_tested_by',
    type: 'TEXT',
    label: 'Tested by',
    hint: 'Name, and scheme number if there is one.',
    level: 'must',
    suggest: (c) => {
      const words = [el(c).name, [el(c).scheme, el(c).scheme_number].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      return words ? { v: words, src: 'job', text: words } : null;
    },
  },
  { key: 'hp_notify', type: 'SEL', label: 'How was the electrical work notified?', level: 'must', options: HP_NOTIFY },
  { key: 'hp_notify_ref', type: 'TEXT', label: 'Scheme or building control reference', level: 'should', parent: 'hp_notify', show: (c) => is(c, 'hp_notify', 'scheme') || is(c, 'hp_notify', 'bc') },

  { key: 'hp_ir_le', type: 'NUM', label: 'Insulation resistance, line to earth (500 V)', level: 'must', unit: 'MΩ', gt: true, min: 0, max: 10000, group: 'Readings' },
  { key: 'hp_ir_ln', type: 'NUM', label: 'Insulation resistance, line to neutral (500 V)', level: 'must', unit: 'MΩ', gt: true, min: 0, max: 10000 },
  {
    key: 'hp_phase',
    type: 'SEL',
    label: 'Electrical supply',
    level: 'must',
    options: [
      { key: 'single', label: 'Single phase' },
      { key: 'three', label: 'Three phase' },
    ],
  },
  volts('hp_v_ln', 'Supply at the unit: L1–N'),
  volts('hp_v_le', 'Supply at the unit: L1–E'),
  volts('hp_v_ne', 'Supply at the unit: N–E'),
  volts('hp_v_l2n', 'L2–N', { show: three }),
  volts('hp_v_l3n', 'L3–N', { show: three }),
  volts('hp_v_l1l2', 'L1–L2', { show: three }),
  volts('hp_v_l2l3', 'L2–L3', { show: three }),
  volts('hp_v_l1l3', 'L1–L3', { show: three }),

  { key: 'hp_iso_type', type: 'TEXT', label: 'Isolator type', level: 'must', group: 'Isolation and protection', choices: ['Rotary isolator'] },
  { key: 'hp_iso_loc', type: 'TEXT', label: 'Isolator location', level: 'must', choices: ['Next to the outdoor unit'] },
  { key: 'hp_rcd', type: 'TEXT', label: 'RCD type, as the maker asks', level: 'must' },
  { key: 'hp_csa', type: 'NUM', label: 'Cable size', level: 'must', unit: 'mm²', chips: [2.5, 4, 6, 10], min: 1, max: 50 },

  {
    key: 'hp_dno',
    type: 'SEL',
    label: 'DNO connect-and-notify route',
    level: 'must',
    group: 'The DNO',
    options: [
      { key: 'notify', label: 'Connect and notify: notify within 28 days' },
      { key: 'apply', label: 'Applied before installing' },
    ],
    note: (c) => (el(c).heat_pump_model ? `The design’s heat pump: ${el(c).heat_pump_model}.` : null),
  },
  { key: 'hp_dno_ref', type: 'TEXT', label: 'DNO reference', level: 'should', parent: 'hp_dno', show: (c) => is(c, 'hp_dno', 'apply') },
  { key: 'hp_notes', type: 'LONG', label: 'Anything else', level: 'optional' },
];

export const HP_STEP: Step = {
  key: 'heatpump',
  title: 'Heat pump supply',
  intro: 'The electrical supply only. The heat pump is commissioned by the heating engineer.',
  show: (c) => has(c, 'heatpump'),
  fields: HP_FIELDS,
};
