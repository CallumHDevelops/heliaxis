/**
 * HX-PV-02 Solar PV string test results (WORDING-SPEC 2, screen P8): the once-per-job rows (about
 * this test), then one card per string in Heliaxis's own groups (what's on this string, the tests
 * with the DC isolator open, at switch-on), then wrapping up. What the roofer and the design already
 * know is offered with a chip; measured values never are. The expected Voc shows beside the measured
 * box (not with optimisers), and gentle checks go to the office as Review flags. Type-only imports,
 * plus the rules' derived values.
 */
import { IR_MINIMUM } from '../../fixed/iec62446';
import { expectedStringVoc, irMinimum, perStringValues } from '../../rules';
import type { Field, FlagRule, FormCtx, Step, Suggestion } from '../types';
import { frameSafetyEarth } from './photos';
import { captures, el, has, num, optimisers, panelsFitted, readOf, roofer, text } from './shared';

/** Strings on the string tests: the electrician's count, else the roofer's, else the design's. */
export const pvStringCount = (c: FormCtx): number => num(c.values.pvt_strings) ?? num(roofer(c, 'RF10')) ?? c.design.strings_design?.length ?? 1;
const n = (c: FormCtx) => Math.min(12, Math.max(1, Math.round(pvStringCount(c))));
const all = (c: FormCtx, v: unknown) => Array.from({ length: n(c) }, () => v);

/** The panel's Voc: the roofer's answer (they read it off the label). */
export const panelVoc = (c: FormCtx) => num(roofer(c, 'RF14'));
/** Panels on each string: what the electrician has, else the roofer's. */
export function panelsPerString(c: FormCtx): (number | null)[] {
  const mine = Array.isArray(c.values.pvt_panels) ? (c.values.pvt_panels as unknown[]) : [];
  const theirs = Array.isArray(roofer(c, 'RF11')) ? (roofer(c, 'RF11') as unknown[]) : [];
  return Array.from({ length: n(c) }, (_, i) => num(mine[i]) ?? num(theirs[i]) ?? c.design.strings_design?.[i] ?? null);
}
/** The expected open-circuit voltage of string i (null with optimisers, or when panels or Voc aren't known). */
export const expectedVoc = (c: FormCtx, i: number) => expectedStringVoc(panelsPerString(c)[i] ?? null, panelVoc(c), optimisers(c));

/** "New 7.2 kWp solar PV array: 16 × Aiko … in 2 strings, Sigenergy …": only the parts that are known. */
export function describeArray(c: FormCtx): string | null {
  const panels = panelsFitted(c);
  const model = (typeof roofer(c, 'RF13') === 'string' ? (roofer(c, 'RF13') as string) : null) ?? c.system.panel_model;
  const strings = pvStringCount(c);
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

/** The options of "New install or a re-test?" (the system summary asks the same). */
export const TEST_KINDS = [
  { key: 'initial', label: 'New installation' },
  { key: 'periodic', label: 'Re-test of an existing system' },
];

export const PV_TEST_FIELDS: Field[] = [
  {
    key: 'pvt_kind',
    type: 'SEL',
    label: 'New install or a re-test?',
    hint: 'Pick New installation unless you’re re-testing a system that’s already in use.',
    level: 'must',
    group: 'About this test',
    options: TEST_KINDS,
    suggest: () => ({ v: 'initial', src: 'job', text: 'New installation' }),
  },
  {
    key: 'pvt_desc',
    type: 'TEXT',
    label: 'What’s being tested?',
    hint: 'Filled in from the job. Change it if what’s fitted is different.',
    level: 'must',
    suggest: (c) => ({ v: describeArray(c), src: 'job', text: describeArray(c) ?? '' }),
  },
  {
    key: 'pvt_tester',
    type: 'TEXT',
    label: 'Which tester did you use?',
    hint: 'Make, model and serial number of each one. We remember it from your last job.',
    level: 'must',
    suggest: (c) => (el(c).instruments ? { v: el(c).instruments, src: 'last', text: el(c).instruments! } : null),
  },
  { key: 'pvt_tester_cal', type: 'TEXT', label: 'When was it last calibrated?', hint: 'The date on its calibration certificate or sticker.', level: 'should' },
  {
    key: 'pvt_strings',
    type: 'NUM',
    label: 'How many strings?',
    hint: 'Each string gets its own card below.',
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

  // What's on this string
  per('pvt_panel', 'Panel make and model', {
    group: 'What’s on this string',
    suggest: (c) => {
      const r = roofer(c, 'RF13');
      if (typeof r === 'string' && r.trim()) return forAll(c, r.trim(), 'roofer', r.trim());
      return c.system.panel_model ? forAll(c, c.system.panel_model, 'design', c.system.panel_model) : null;
    },
  }),
  per('pvt_panels', 'Panels on this string', {
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
  per('pvt_voc_stc', 'Expected open-circuit voltage (V)', {
    type: 'NUM',
    unit: 'V',
    dp: 1,
    min: 1,
    max: 1500,
    hint: 'Panels on the string × the panel’s Voc at STC. With optimisers, use the figure the optimiser maker gives.',
    suggest: (c) => {
      const list = Array.from({ length: n(c) }, (_, i) => expectedVoc(c, i));
      return list.every((x) => x !== null) ? { v: list, src: 'calc', text: `${list.map((x) => `${x} V`).join(' + ')} (panels × ${panelVoc(c)} V)` } : null;
    },
  }),
  per('pvt_isc_stc', 'Expected short-circuit current (A)', {
    type: 'NUM',
    unit: 'A',
    dp: 2,
    min: 0,
    max: 50,
    hint: 'The panel’s Isc at STC, from its label or datasheet.',
    suggest: (c) => {
      const isc = readOf(c, 'RF12', 'roofer')?.panel?.isc_a;
      return typeof isc === 'number' ? forAll(c, isc, 'photo', `${isc} A from the panel label`) : null;
    },
  }),
  per('pvt_cable', 'DC cable type', { same: true, hint: 'For example H1Z2Z2-K.', choices: ['H1Z2Z2-K', 'PV1-F'] }),
  per('pvt_cable_mm2', 'Live conductor size (mm²)', { type: 'NUM', unit: 'mm²', hint: 'The + and − cores.', chips: [4, 6, 10], min: 1, max: 50 }),
  per('pvt_earth_mm2', 'Earth conductor size (mm²)', { type: 'NUM', unit: 'mm²', na: true, hint: 'Tap N/A if the string has no earth conductor.', chips: [4, 6, 10], min: 1, max: 50 }),
  per('pvt_fuse', 'String fuse or breaker', {
    hint: 'Tap None fitted if there isn’t one. The three ratings below are then skipped.',
    choices: [NONE, 'gPV fuse', 'DC MCB'],
    fills: { when: NONE, keys: ['pvt_fuse_a', 'pvt_fuse_v', 'pvt_fuse_ka'], v: 'na' },
  }),
  per('pvt_fuse_a', 'Its current rating (A)', { type: 'NUM', unit: 'A', na: true, hint: 'From the fuse or breaker.', min: 0, max: 100 }),
  per('pvt_fuse_v', 'Its DC voltage rating (V)', { type: 'NUM', unit: 'V', na: true, hint: 'From the fuse or breaker.', min: 0, max: 1500 }),
  per('pvt_fuse_ka', 'Its breaking capacity (kA)', { type: 'NUM', unit: 'kA', na: true, hint: 'From the fuse or breaker.', min: 0, max: 100 }),
  per('pvt_iso_where', 'Where’s the DC isolator?', { same: true, choices: ['Built into inverter', 'Next to inverter', 'Loft'] }),
  per('pvt_iso_a', 'DC isolator current rating (A)', { type: 'NUM', unit: 'A', same: true, hint: 'From its label.', min: 0, max: 200 }),
  per('pvt_iso_v', 'DC isolator voltage rating (V)', { type: 'NUM', unit: 'V', same: true, hint: 'From its label.', min: 0, max: 1500 }),
  per('pvt_inv', 'Inverter make and model', {
    same: true,
    suggest: (c) => {
      const read = readOf(c, 'EP21');
      const words = read?.model ? [read.make, read.model].filter(Boolean).join(' ') : null;
      if (words) return forAll(c, words, 'photo', words);
      return c.system.inverter_model ? forAll(c, c.system.inverter_model, 'design', c.system.inverter_model) : null;
    },
  }),
  per('pvt_inv_serial', 'Inverter serial number', {
    same: true,
    suggest: (c) => {
      const list = captures(c.values.SN_INV).filter((x) => !x.unread);
      return list.length === 1 ? forAll(c, list[0].s, 'scan', `${list[0].s} (from Serials)`) : null;
    },
  }),

  // Tests with the DC isolator open (measured: never offered)
  per('pvt_frame_earth', 'Frame earth continuity (Ω)', {
    group: 'Tests with the DC isolator open',
    groupNote: 'Do these before anything is switched on.',
    type: 'NUM',
    unit: 'Ω',
    na: true,
    dp: 2,
    min: 0,
    max: 100,
    hint: 'Only where the panel frames or rails are earthed or bonded. Otherwise tap N/A.',
    note: (c) => (frameSafetyEarth(c) === false ? 'The PV inspection says the frame isn’t earthed or bonded, so this is usually N/A.' : null),
  }),
  per('pvt_polarity', 'Polarity right?', { type: 'PF', hint: 'Check it before you close the isolator or fit a fuse. A reversed string can damage the inverter.' }),
  per('pvt_voc', 'Open-circuit voltage (V)', {
    type: 'NUM',
    unit: 'V',
    dp: 1,
    min: 0,
    max: 1500,
    hint: 'Measured with the isolator open. A reading well under the expected one can mean a panel is missing or in backwards.',
    stringNote: (c, i) => {
      const e = expectedVoc(c, i);
      return e === null ? null : `Expected about ${e} V (${panelsPerString(c)[i]} × ${panelVoc(c)} V)`;
    },
  }),
  per('pvt_isc', 'Short-circuit current (A)', { type: 'NUM', unit: 'A', dp: 2, min: 0, max: 50, hint: 'Use your tester’s PV current test. Don’t break a DC connection under load.' }),
  per('pvt_irr', 'Irradiance when you measured the current (W/m²)', { type: 'NUM', unit: 'W/m²', same: true, min: 0, max: 1500, hint: 'From your irradiance meter, held at the same angle as the panels.' }),
  per('pvt_ir_v', 'Insulation test voltage (V)', {
    type: 'NUM',
    unit: 'V',
    chips: [250, 500, 1000],
    same: true,
    min: 50,
    max: 1500,
    hint: 'Set it for the array’s maximum voltage, as BS EN IEC 62446-1 sets out.',
  }),
  per('pvt_ir_pos', 'Insulation, + to earth (MΩ)', {
    type: 'NUM',
    unit: 'MΩ',
    gt: true,
    min: 0,
    max: 10000,
    hint: 'If the tester shows over-range, enter it with “>” (for example >999).',
    stringNote: (c, i) => irNote(c, i),
  }),
  per('pvt_ir_neg', 'Insulation, − to earth (MΩ)', { type: 'NUM', unit: 'MΩ', gt: true, min: 0, max: 10000, hint: 'As above.', stringNote: (c, i) => irNote(c, i) }),

  // At switch-on
  per('pvt_iso_ok', 'DC isolator works?', { group: 'At switch-on', type: 'PF', hint: 'Switch it off and on again. The inverter should lose its DC input and then get it back.' }),
  per('pvt_inv_ok', 'Inverter starts and runs?', { type: 'PF', hint: 'Started the way its maker says, with no fault showing.' }),

  {
    key: 'pvt_fail_note',
    type: 'LONG',
    label: 'What failed, and what did you do about it?',
    hint: 'You’ll need this to sign off if a polarity, isolator or inverter check failed.',
    level: 'must',
    group: 'Wrapping up',
    show: (c) => failures(c).length > 0,
  },
  { key: 'pvt_notes', type: 'LONG', label: 'Anything else to note?', level: 'optional' },
];
const BY_KEY = new Map(PV_TEST_FIELDS.map((f) => [f.key, f]));
export const pvTestField = (key: string) => BY_KEY.get(key)!;

function irNote(c: FormCtx, i: number): string | null {
  const v = num(perStringValues(BY_KEY.get('pvt_ir_v')!, c)[i]);
  const min = irMinimum(v);
  if (min === null) return null;
  return IR_MINIMUM.verified ? `At least ${min} MΩ at ${v} V` : `${min} MΩ at ${v} V is the figure we have: check the reading against BS EN IEC 62446-1`;
}

/** The three pass/fail checks, and what each is called in a flag. */
const CHECKS = [
  ['pvt_polarity', 'polarity'],
  ['pvt_iso_ok', 'DC isolator'],
  ['pvt_inv_ok', 'inverter check'],
] as const;

/** Polarity, isolator and inverter checks that failed: "String 2 polarity". */
export function failures(c: FormCtx): string[] {
  const out: string[] = [];
  for (const [key, what] of CHECKS) perStringValues(BY_KEY.get(key)!, c).forEach((v, i) => v === 'fail' && out.push(`String ${i + 1} ${what}`));
  return out;
}
/** The strings (1, 2…) where this check failed. */
const failed = (c: FormCtx, key: string) => perStringValues(BY_KEY.get(key)!, c).flatMap((v, i) => (v === 'fail' ? [i + 1] : []));
const stringsWords = (list: number[]) => `String${list.length > 1 ? 's' : ''} ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]}`;

/** A measured reading: a number, or ">999" as the number. */
const reading = (v: unknown) => num(v) ?? (typeof v === 'string' && /^>\s*\d/.test(v) ? Number(v.replace(/^>\s*/, '')) : null);

/** Insulation readings below the minimum for their test voltage. */
function lowIr(c: FormCtx): { i: number; side: string; v: number; min: number; at: number }[] {
  const volts = perStringValues(BY_KEY.get('pvt_ir_v')!, c);
  const out: { i: number; side: string; v: number; min: number; at: number }[] = [];
  for (const [key, side] of [
    ['pvt_ir_pos', '+'],
    ['pvt_ir_neg', '−'],
  ] as const) {
    perStringValues(BY_KEY.get(key)!, c).forEach((raw, i) => {
      const v = reading(raw);
      const at = num(volts[i]);
      const min = irMinimum(at);
      if (v !== null && at !== null && min !== null && v < min && !(typeof raw === 'string' && raw.startsWith('>'))) out.push({ i, side, v, min, at });
    });
  }
  return out;
}

/** Strings whose measured Voc is further than the tolerance from expected, with "looks 1 panel short" when it fits. */
export function vocOff(c: FormCtx): { i: number; got: number; want: number; short: boolean }[] {
  const tol = el(c).voc_tolerance / 100;
  const out: { i: number; got: number; want: number; short: boolean }[] = [];
  perStringValues(BY_KEY.get('pvt_voc')!, c).forEach((raw, i) => {
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
  const vocs = perStringValues(BY_KEY.get('pvt_voc')!, c).map(num);
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

const explained = (c: FormCtx) => !!text(c, 'pvt_fail_note');

export const PV_TEST_FLAGS: FlagRule[] = [
  ...(
    [
      ['PVT_POL', 'pvt_polarity', 'polarity'],
      ['PVT_ISO', 'pvt_iso_ok', 'DC isolator'],
      ['PVT_INV', 'pvt_inv_ok', 'inverter check'],
    ] as const
  ).map(
    ([code, key, what]): FlagRule => ({
      code,
      key,
      severity: (c) => (explained(c) ? 'urgent' : 'stop'),
      when: (c) => failed(c, key).length > 0,
      text: (c) => `${stringsWords(failed(c, key))} ${what} failed: ${explained(c) ? text(c, 'pvt_fail_note') : 'put it right, or say what you did'}`,
    })
  ),
  {
    code: 'PVT_IR',
    key: 'pvt_ir_pos',
    severity: () => (IR_MINIMUM.verified ? 'urgent' : 'review'),
    when: (c) => lowIr(c).length > 0,
    text: (c) => {
      const words = lowIr(c)
        .map((x) => `string ${x.i + 1} ${x.side} to earth ${x.v} MΩ at ${x.at} V`)
        .join('; ');
      return IR_MINIMUM.verified ? `Insulation below the minimum: ${words}` : `Check against BS EN IEC 62446-1: ${words}`;
    },
  },
  {
    code: 'PVT_VOC',
    key: 'pvt_voc',
    severity: 'review',
    when: (c) => vocOff(c).length > 0,
    text: (c) =>
      vocOff(c)
        .map((x) => `String ${x.i + 1}: ${x.got} V measured, about ${x.want} V expected${x.short ? '. Looks 1 panel short' : ''}`)
        .join('; '),
  },
  {
    code: 'PVT_EVEN',
    key: 'pvt_voc',
    severity: 'review',
    when: (c) => unevenStrings(c).length > 0,
    text: (c) =>
      `Strings with the same panels read more than 5% apart: ${unevenStrings(c)
        .map(([a, b]) => `${a + 1} and ${b + 1}`)
        .join(', ')}`,
  },
  {
    code: 'PVT_STR',
    key: 'pvt_strings',
    severity: 'review',
    when: (c) => num(c.values.pvt_strings) !== null && num(roofer(c, 'RF10')) !== null && num(c.values.pvt_strings) !== num(roofer(c, 'RF10')),
    text: (c) => `String tests have ${c.values.pvt_strings} strings; the roofer said ${roofer(c, 'RF10')}`,
  },
];

export const PV_TEST_STEP: Step = {
  key: 'pv-tests',
  title: 'String tests',
  intro: 'One card per string. What the roofer gave is offered: tap ✓ to use it. Your readings are never filled in for you.',
  layout: 'strings',
  show: (c) => has(c, 'solar'),
  fields: PV_TEST_FIELDS,
};
