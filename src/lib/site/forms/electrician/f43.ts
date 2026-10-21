/**
 * F43 PV Array Test Report (FORMS 1.1, SPEC 2.5, screen P8): the title rows, then one card per
 * string with the form's groups in order (Array → Array parameters → OCPD → Wiring → String test →
 * Polarity → Insulation resistance → Earth continuity → Isolator → Inverter). What the roofer and the
 * design already know is offered with a chip; measured values never are. Expected Voc shows beside
 * the measured box (not with optimisers), and gentle checks go to the office as Review flags.
 * Type-only imports, plus the rules' derived values.
 */
import { IR_MINIMUM } from '../../fixed/iec62446';
import { expectedStringVoc, irMinimum, perStringValues } from '../../rules';
import type { Field, FlagRule, FormCtx, Step, Suggestion } from '../types';
import { captures, el, has, num, optimisers, panelsFitted, readOf, roofer, text } from './shared';

/** Strings on F43: the electrician's count, else the roofer's, else the design's. */
export const stringsF43 = (c: FormCtx): number => num(c.values.f43_strings) ?? num(roofer(c, 'RF10')) ?? c.design.strings_design?.length ?? 1;
const n = (c: FormCtx) => Math.min(12, Math.max(1, Math.round(stringsF43(c))));
const all = (c: FormCtx, v: unknown) => Array.from({ length: n(c) }, () => v);

/** The panel's Voc: the roofer's answer (they read it off the label). */
export const panelVoc = (c: FormCtx) => num(roofer(c, 'RF14'));
/** Panels on each string: what the electrician has, else the roofer's. */
export function panelsPerString(c: FormCtx): (number | null)[] {
  const mine = Array.isArray(c.values.f43_qty) ? (c.values.f43_qty as unknown[]) : [];
  const theirs = Array.isArray(roofer(c, 'RF11')) ? (roofer(c, 'RF11') as unknown[]) : [];
  return Array.from({ length: n(c) }, (_, i) => num(mine[i]) ?? num(theirs[i]) ?? c.design.strings_design?.[i] ?? null);
}
/** The expected open-circuit voltage of string i (null with optimisers, or when panels or Voc aren't known). */
export const expectedVoc = (c: FormCtx, i: number) => expectedStringVoc(panelsPerString(c)[i] ?? null, panelVoc(c), optimisers(c));

/** "New 7.2 kWp solar PV array: 16 × Aiko … in 2 strings, Sigenergy …": only the parts that are known. */
export function describeArray(c: FormCtx): string | null {
  const panels = panelsFitted(c);
  const model = (typeof roofer(c, 'RF13') === 'string' ? (roofer(c, 'RF13') as string) : null) ?? c.system.panel_model;
  const strings = stringsF43(c);
  const parts = [
    c.system.kwp ? `New ${c.system.kwp} kWp solar PV array` : 'New solar PV array',
    panels && model ? `${panels} × ${model}` : model,
    strings ? `in ${strings} string${strings === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  const head = parts.length > 1 ? `${parts[0]}: ${parts.slice(1).join(' ')}` : String(parts[0]);
  return `${head}${c.system.inverter_model ? `, ${c.system.inverter_model}` : ''}`;
}

const per = (key: string, label: string, extra: Partial<Field>): Field => ({ key, type: 'TEXT', label, level: 'must', perString: true, strings: n, ...extra });
const NONE = 'None fitted';

/** A per-string suggestion: the same value for every string. */
const forAll = (c: FormCtx, v: unknown, src: Suggestion['src'], words: string): Suggestion => ({ v: all(c, v), src, text: words });

export const F43_FIELDS: Field[] = [
  {
    key: 'f43_kind',
    type: 'SEL',
    label: 'PV System Verification Certificate',
    level: 'must',
    options: [
      { key: 'initial', label: 'Initial verification' },
      { key: 'periodic', label: 'Periodic verification' },
    ],
    suggest: () => ({ v: 'initial', src: 'job', text: 'Initial verification (a new install)' }),
  },
  {
    key: 'f43_strings',
    type: 'NUM',
    label: 'How many strings?',
    level: 'must',
    chips: [1, 2, 3, 4],
    min: 1,
    max: 12,
    suggest: (c) => {
      const r = num(roofer(c, 'RF10'));
      if (r) return { v: r, src: 'roofer', text: String(r) };
      const d = c.design.strings_design?.length;
      return d ? { v: d, src: 'design', text: String(d) } : null;
    },
  },
  { key: 'f43_desc', type: 'TEXT', label: 'Description of work under test', level: 'must', suggest: (c) => ({ v: describeArray(c), src: 'job', text: describeArray(c) ?? '' }) },
  {
    key: 'f43_instruments',
    type: 'TEXT',
    label: 'Test instruments',
    hint: 'Make, model and serial of each.',
    level: 'must',
    suggest: (c) => (el(c).instruments ? { v: el(c).instruments, src: 'last', text: el(c).instruments! } : null),
  },
  { key: 'f43_cal', type: 'TEXT', label: 'Calibration date of the tester', hint: 'A tester out of calibration voids the readings.', level: 'should' },

  // Array
  per('f43_module', 'Module', {
    group: 'Array',
    suggest: (c) => {
      const r = roofer(c, 'RF13');
      if (typeof r === 'string' && r.trim()) return forAll(c, r.trim(), 'roofer', r.trim());
      return c.system.panel_model ? forAll(c, c.system.panel_model, 'design', c.system.panel_model) : null;
    },
  }),
  per('f43_qty', 'Quantity', {
    type: 'NUM',
    unit: 'panels',
    min: 1,
    max: 40,
    suggest: (c) => {
      const r = roofer(c, 'RF11');
      if (Array.isArray(r) && r.length >= n(c) && r.slice(0, n(c)).every((x) => num(x))) return { v: r.slice(0, n(c)), src: 'roofer', text: r.slice(0, n(c)).join(' + ') };
      const d = c.design.strings_design;
      return d && d.length === n(c) ? { v: d, src: 'design', text: d.join(' + ') } : null;
    },
  }),
  // Array parameters (as specified)
  per('f43_spec_voc', 'Voc (STC)', {
    group: 'Array parameters (as specified)',
    type: 'NUM',
    unit: 'V',
    dp: 1,
    min: 1,
    max: 1500,
    hint: 'With optimisers, enter what the optimiser maker gives.',
    suggest: (c) => {
      const list = Array.from({ length: n(c) }, (_, i) => expectedVoc(c, i));
      return list.every((x) => x !== null) ? { v: list, src: 'calc', text: `${list.map((x) => `${x} V`).join(' + ')} (panels × ${panelVoc(c)} V)` } : null;
    },
  }),
  per('f43_spec_isc', 'Isc (STC)', {
    type: 'NUM',
    unit: 'A',
    dp: 2,
    min: 0,
    max: 50,
    suggest: (c) => {
      const isc = readOf(c, 'RF12', 'roofer')?.panel?.isc_a;
      return typeof isc === 'number' ? forAll(c, isc, 'photo', `${isc} A from the panel label`) : null;
    },
  }),
  // String over-current protective device
  per('f43_ocpd_type', 'Type', { group: 'String over-current protective device', choices: [NONE, 'gPV fuse', 'DC MCB'], fills: { when: NONE, keys: ['f43_ocpd_a', 'f43_ocpd_v', 'f43_ocpd_ka'], v: 'na' } }),
  per('f43_ocpd_a', 'Rating (A)', { type: 'NUM', unit: 'A', na: true, min: 0, max: 100 }),
  per('f43_ocpd_v', 'DC Rating (V)', { type: 'NUM', unit: 'V', na: true, min: 0, max: 1500 }),
  per('f43_ocpd_ka', 'Capacity (kA)', { type: 'NUM', unit: 'kA', na: true, min: 0, max: 100 }),
  // String wiring
  per('f43_wire_type', 'Type', { group: 'String wiring', same: true, choices: ['H1Z2Z2-K', 'PV1-F'] }),
  per('f43_wire_phase', 'Phase CSA (mm²)', { type: 'NUM', unit: 'mm²', chips: [4, 6, 10], min: 1, max: 50 }),
  per('f43_wire_earth', 'Earth CSA (mm²)', { type: 'NUM', unit: 'mm²', na: true, chips: [4, 6, 10], min: 1, max: 50 }),
  // String test (measured: never offered)
  per('f43_test_voc', 'Voc (STC)', {
    group: 'String test',
    type: 'NUM',
    unit: 'V',
    dp: 1,
    min: 0,
    max: 1500,
    stringNote: (c, i) => {
      const e = expectedVoc(c, i);
      return e === null ? (optimisers(c) ? 'Optimisers fitted: no expected figure.' : null) : `Expected about ${e} V (${panelsPerString(c)[i]} × ${panelVoc(c)} V)`;
    },
  }),
  per('f43_test_isc', 'Isc (STC)', { type: 'NUM', unit: 'A', dp: 2, min: 0, max: 50 }),
  per('f43_irr', 'Irradiance', { type: 'NUM', unit: 'W/m²', same: true, min: 0, max: 1500 }),
  // Polarity
  per('f43_polarity', 'Polarity check', { group: 'Polarity', type: 'PF' }),
  // Array insulation resistance
  per('f43_ir_v', 'Test voltage (V)', { group: 'Array insulation resistance', type: 'NUM', unit: 'V', chips: [250, 500, 1000], same: true, min: 50, max: 1500 }),
  per('f43_ir_pos', 'Pos - Earth (MΩ)', { type: 'NUM', unit: 'MΩ', gt: true, min: 0, max: 10000, stringNote: (c, i) => irNote(c, i) }),
  per('f43_ir_neg', 'Neg - Earth (MΩ)', { type: 'NUM', unit: 'MΩ', gt: true, min: 0, max: 10000, stringNote: (c, i) => irNote(c, i) }),
  // Earth continuity (where fitted)
  per('f43_earth_cont', 'Earth continuity (where fitted)', {
    group: 'Earth continuity',
    type: 'NUM',
    unit: 'Ω',
    na: true,
    dp: 2,
    min: 0,
    max: 100,
    note: (c) => (Array.isArray(c.values.f44_t2) && (c.values.f44_t2 as string[]).length === 1 && (c.values.f44_t2 as string[])[0] === 'd' ? 'F44 Table 2 has only d) ticked: usually N/A.' : null),
  }),
  // Array isolator
  per('f43_iso_a', 'Rating (A)', { group: 'Array isolator', type: 'NUM', unit: 'A', same: true, min: 0, max: 200 }),
  per('f43_iso_v', 'Rating (V)', { type: 'NUM', unit: 'V', same: true, min: 0, max: 1500 }),
  per('f43_iso_loc', 'Location', { same: true, choices: ['Built into inverter', 'Next to inverter', 'Loft'] }),
  per('f43_iso_func', 'Functional check', { type: 'PF' }),
  // Inverter
  per('f43_inv_model', 'Make and model', {
    group: 'Inverter',
    same: true,
    suggest: (c) => {
      const read = readOf(c, 'EP21');
      const words = read?.model ? [read.make, read.model].filter(Boolean).join(' ') : null;
      if (words) return forAll(c, words, 'photo', words);
      return c.system.inverter_model ? forAll(c, c.system.inverter_model, 'design', c.system.inverter_model) : null;
    },
  }),
  per('f43_inv_serial', 'Serial number', {
    same: true,
    suggest: (c) => {
      const list = captures(c.values.SN_INV).filter((x) => !x.unread);
      return list.length === 1 ? forAll(c, list[0].s, 'scan', `${list[0].s} (from Serials)`) : null;
    },
  }),
  per('f43_inv_func', 'Functional check', { type: 'PF' }),

  {
    key: 'f43_failn',
    type: 'LONG',
    label: 'What failed, and what you did about it?',
    hint: 'A failed polarity, isolator or inverter check can’t be signed off without this.',
    level: 'must',
    show: (c) => failures(c).length > 0,
  },
  { key: 'f43_comments', type: 'LONG', label: 'Comments', level: 'optional' },
];
const F43_BY_KEY = new Map(F43_FIELDS.map((f) => [f.key, f]));
export const f43Field = (key: string) => F43_BY_KEY.get(key)!;

function irNote(c: FormCtx, i: number): string | null {
  const v = num(perStringValues(F43_BY_KEY.get('f43_ir_v')!, c)[i]);
  const min = irMinimum(v);
  if (min === null) return null;
  return IR_MINIMUM.verified ? `At least ${min} MΩ at ${v} V` : `${min} MΩ at ${v} V is the figure we have: check the reading against BS EN IEC 62446-1`;
}

/** Polarity, isolator and inverter checks that failed: "String 2 polarity". */
export function failures(c: FormCtx): string[] {
  const out: string[] = [];
  for (const [key, what] of [
    ['f43_polarity', 'polarity'],
    ['f43_iso_func', 'isolator'],
    ['f43_inv_func', 'inverter'],
  ] as const) {
    perStringValues(F43_BY_KEY.get(key)!, c).forEach((v, i) => v === 'fail' && out.push(`String ${i + 1} ${what}`));
  }
  return out;
}

/** A measured reading: a number, or ">999" as the number. */
const reading = (v: unknown) => num(v) ?? (typeof v === 'string' && /^>\s*\d/.test(v) ? Number(v.replace(/^>\s*/, '')) : null);

/** Insulation readings below the minimum for their test voltage. */
function lowIr(c: FormCtx): { i: number; side: string; v: number; min: number; at: number }[] {
  const volts = perStringValues(F43_BY_KEY.get('f43_ir_v')!, c);
  const out: { i: number; side: string; v: number; min: number; at: number }[] = [];
  for (const [key, side] of [
    ['f43_ir_pos', '+'],
    ['f43_ir_neg', '−'],
  ] as const) {
    perStringValues(F43_BY_KEY.get(key)!, c).forEach((raw, i) => {
      const v = reading(raw);
      const at = num(volts[i]);
      const min = irMinimum(at);
      if (v !== null && at !== null && min !== null && v < min && !(typeof raw === 'string' && raw.startsWith('>'))) out.push({ i, side, v, min, at });
    });
  }
  return out;
}

/** Strings whose measured Voc is further than the tolerance from expected, with "looks one panel short" when it fits. */
export function vocOff(c: FormCtx): { i: number; got: number; want: number; short: boolean }[] {
  const tol = el(c).voc_tolerance / 100;
  const out: { i: number; got: number; want: number; short: boolean }[] = [];
  perStringValues(F43_BY_KEY.get('f43_test_voc')!, c).forEach((raw, i) => {
    const got = num(raw);
    const want = expectedVoc(c, i);
    if (got === null || want === null || Math.abs(got - want) <= want * tol) return;
    const panels = panelsPerString(c)[i];
    const oneShort = panels && panels > 1 ? expectedStringVoc(panels - 1, panelVoc(c), false) : null;
    out.push({ i, got, want, short: !!oneShort && Math.abs(got - oneShort) <= oneShort * tol && Math.abs(got - oneShort) < Math.abs(got - want) });
  });
  return out;
}

/** Strings with the same number of panels whose measured Voc differs by more than 5%. */
export function unevenStrings(c: FormCtx): [number, number][] {
  const vocs = perStringValues(F43_BY_KEY.get('f43_test_voc')!, c).map(num);
  const panels = panelsPerString(c);
  const out: [number, number][] = [];
  for (let a = 0; a < vocs.length; a++)
    for (let b = a + 1; b < vocs.length; b++) {
      const x = vocs[a];
      const y = vocs[b];
      if (x === null || y === null || !panels[a] || panels[a] !== panels[b]) continue;
      if (Math.abs(x - y) > Math.max(x, y) * 0.05) out.push([a, b]);
    }
  return out;
}

const explained = (c: FormCtx) => !!text(c, 'f43_failn');

export const F43_FLAGS: FlagRule[] = [
  ...(
    [
      ['F43_POL', 'f43_polarity', 'polarity'],
      ['F43_ISO', 'f43_iso_func', 'isolator'],
      ['F43_INV', 'f43_inv_func', 'inverter'],
    ] as const
  ).map(
    ([code, key, what]): FlagRule => ({
      code,
      key,
      severity: (c) => (explained(c) ? 'urgent' : 'stop'),
      when: (c) => failures(c).some((f) => f.endsWith(what)),
      text: (c) => {
        const which = failures(c).filter((f) => f.endsWith(what)).join(', ');
        return explained(c) ? `F43 ${which} failed: ${text(c, 'f43_failn')}` : `F43 ${which} failed: put it right, or say what you did about it`;
      },
    })
  ),
  {
    code: 'F43_IR',
    key: 'f43_ir_pos',
    severity: () => (IR_MINIMUM.verified ? 'urgent' : 'review'),
    when: (c) => lowIr(c).length > 0,
    text: (c) => {
      const words = lowIr(c)
        .map((x) => `string ${x.i + 1} ${x.side} to earth ${x.v} MΩ at ${x.at} V`)
        .join('; ');
      return IR_MINIMUM.verified ? `Insulation resistance below the minimum: ${words}` : `Check the reading against BS EN IEC 62446-1: ${words}`;
    },
  },
  {
    code: 'F43_VOC',
    key: 'f43_test_voc',
    severity: 'review',
    when: (c) => vocOff(c).length > 0,
    text: (c) =>
      vocOff(c)
        .map((x) => `String ${x.i + 1}: ${x.got} V measured, about ${x.want} V expected${x.short ? '. Looks one panel short' : ''}`)
        .join('; '),
  },
  {
    code: 'F43_EVEN',
    key: 'f43_test_voc',
    severity: 'review',
    when: (c) => unevenStrings(c).length > 0,
    text: (c) =>
      `Strings with the same panels read more than 5% apart: ${unevenStrings(c)
        .map(([a, b]) => `${a + 1} and ${b + 1}`)
        .join(', ')}`,
  },
  {
    code: 'F43_STR',
    key: 'f43_strings',
    severity: 'review',
    when: (c) => num(c.values.f43_strings) !== null && num(roofer(c, 'RF10')) !== null && num(c.values.f43_strings) !== num(roofer(c, 'RF10')),
    text: (c) => `F43 has ${c.values.f43_strings} strings; the roofer said ${roofer(c, 'RF10')}`,
  },
];

export const F43_STEP: Step = {
  key: 'f43',
  title: 'PV tests (F43)',
  intro: 'One card per string. What the roofer gave is offered: tap ✓ to use it. Your readings are never filled in for you.',
  layout: 'strings',
  show: (c) => has(c, 'solar'),
  fields: F43_FIELDS,
};
