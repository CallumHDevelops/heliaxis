/**
 * F44 Solar PV Installation Checklist (FORMS 1.2, SPEC 2.6, screen P9): the 38 rows in the form's
 * order and wording (with the FORMS 0.7 corrections), each ✓ Done · ✗ Problem · N/A with the
 * evidence beside it (photos, the roofer's answers, F43). Items 36–38 tick themselves from what the
 * app knows for certain and can be un-ticked. Item 20 with its roof kind, item 24 with the worked
 * limit, and Table 2 with its rules and notes, printed exactly. Type-only imports, plus the rules.
 */
import { dcRatingLimit, perStringValues } from '../../rules';
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { certDone } from './cert';
import { expectedVoc, f43Field, F43_STEP } from './f43';
import { el, has, is, num, optimisers, plural, roofer, stepComplete, text, tick } from './shared';

/** FORMS 0.6: the revision printed in the footer. */
export const F44_REVISION = 'Rev 2';

/** One row: the form's wording (corrected where FORMS 0.7 says, the source kept in `sic`), whether N/A is expected, evidence. */
export type F44Row = { n: number; key: string; label: string; sic?: string; naOk?: boolean };

export const F44_ROWS: F44Row[] = [
  { n: 1, key: 'f44_01', label: 'Equipment compliant with standards, correctly selected and not damaged:' },
  { n: 2, key: 'f44_02', label: 'Equipment accessible for operation, inspection and maintenance:' },
  { n: 3, key: 'f44_03', label: 'Equipment and accessories correctly connected:' },
  { n: 4, key: 'f44_04', label: 'Particular protective measures for special location:', naOk: true },
  { n: 5, key: 'f44_05', label: 'Equipment and protective measures appropriate to external influences:' },
  { n: 6, key: 'f44_06', label: 'System installed to prevent mutual detrimental influence:' },
  { n: 7, key: 'f44_07', label: 'Conductors connected and identified:' },
  { n: 8, key: 'f44_08', label: 'Conductors selected for current carrying capacity and voltage drop:' },
  { n: 9, key: 'f44_09', label: 'Conductors routed in a safe zone or protected against mechanical damage:' },
  { n: 10, key: 'f44_10', label: 'Presence of fire barriers, seals and protection against thermal effects:' },
  { n: 11, key: 'f44_11', label: 'Ventilation provided behind array to prevent overheating /fire risk:' },
  { n: 12, key: 'f44_12', label: 'Array frame and material corrosion proof:' },
  { n: 13, key: 'f44_13', label: 'Array frame correctly fixed and stable; roof fittings weatherproof:' },
  { n: 14, key: 'f44_14', label: 'Cable entry weatherproof:' },
  {
    n: 15,
    key: 'f44_15',
    label: 'Live parts insulated, protected by barrier / enclosure, placed out of reach or Class II:',
    sic: 'Live parts insulated, protected by barrier / enclosure, place out of reach or Class II:',
  },
  { n: 16, key: 'f44_16', label: 'Array frame equipotential bonding present (Only relevant if required - see table 2):', naOk: true },
  { n: 17, key: 'f44_17', label: 'Surge protection devices present (only relevant if required):', naOk: true },
  { n: 18, key: 'f44_18', label: 'RCD provided (only relevant if required):', naOk: true },
  { n: 19, key: 'f44_19', label: 'Frame correctly integrated with existing LPS installation:', naOk: true },
  { n: 20, key: 'f44_20', label: 'Installation of the modules has not affected the fire performance of the roof: (select appropriate)' },
  { n: 21, key: 'f44_21', label: 'Physical separation of AC and DC cables:' },
  { n: 22, key: 'f44_22', label: 'DC switch disconnector fitted (to IEC60364-712.536.2.2):', sic: 'DC switch disconnect or fitted (to IEC60364-712.536.2.2):' },
  { n: 23, key: 'f44_23', label: 'DC cables – protective and reinforced insulation (only relevant if required):', naOk: true },
  { n: 24, key: 'f44_24', label: 'All DC components rated for operation at max DC system voltage (Voc stc x 1.25):' },
  { n: 25, key: 'f44_25', label: 'PV strings fused or blocking diodes fitted (only relevant if required):', naOk: true },
  { n: 26, key: 'f44_26', label: 'AC Isolator lockable in off position only:' },
  { n: 27, key: 'f44_27', label: 'Generation Meter readable without torch or ladder and sealed:' },
  { n: 28, key: 'f44_28', label: 'Inverter protection settings to local regulations:' },
  { n: 29, key: 'f44_29', label: 'General labelling of circuits, protective devices switches and terminals (to IEC60364-6-61):' },
  { n: 30, key: 'f44_30', label: 'PV system schematic displayed on site:' },
  { n: 31, key: 'f44_31', label: 'Protection settings and installer details displayed on site:' },
  { n: 32, key: 'f44_32', label: 'Emergency shutdown procedure displayed on site:' },
  { n: 33, key: 'f44_33', label: 'AC Isolator clearly labeled:' },
  { n: 34, key: 'f44_34', label: 'DC isolator / junction boxes suitably labeled:' },
  { n: 35, key: 'f44_35', label: 'Signs and labels suitably affixed and durable:' },
  { n: 36, key: 'f44_36', label: 'DNO information collected:' },
  { n: 37, key: 'f44_37', label: 'PV Array Report completed:' },
  { n: 38, key: 'f44_38', label: 'Notification to Building Control/ electrical certificates completed:' },
];

/** Item 20's two rows: "Pitched Roof" and "In-roof", one ticked. */
export const F44_20_KINDS = [
  { key: 'pitched', label: 'Pitched Roof' },
  { key: 'in_roof', label: 'In-roof' },
];

/** Table 2: Array Frame Earthing, exactly as the form has it. */
export const F44_TABLE2 = [
  {
    key: 'a',
    condition: 'a) Is the array frame an extraneous-conductive-part as defined in BS 7671?',
    requirement: ['Array frame equipotential bonding', 'Connect to protective earthing system as main protective bonding', '(Section 544 of BS 7671)'],
  },
  {
    key: 'b',
    condition: 'b) Is the array frame an exposed-conductive-part as defined in BS 7671?',
    requirement: ['Array frame earthing', 'Connect to protective earthing via a protective earthing conductor or circuit protective conductor (Section 543 of BS 7671)'],
  },
  {
    key: 'c',
    condition: 'c) Is lightning protection required, or is the array adjacent to a lightning protection system?',
    requirement: ['Array frame earthing for lightning protection', 'Connect to Earth according to BS EN 62305'],
  },
  {
    key: 'd',
    condition: 'd) Neither a), b), nor c) apply',
    requirement: [
      'Array frame functional earthing',
      'Connect to Earth where required, for example, according to panel, inverter or DC power optimizer manufacturer’s instructions, or as specified by the system designer (Chapter 54 and section 444 of BS 7671)',
    ],
  },
];
export const F44_TABLE2_INSTRUCTION = 'Tick to confirm if a, b, c, or d apply and complete relevant earthing. Apply the most onerous requirements if more than one condition in this table applies';
/** The notes under Table 2, printed exactly (FORMS 0.7 corrections; the source said "electronically", "structure", "structure that are"). */
export const F44_TABLE2_NOTES = [
  'Notes on Table 2:',
  'NOTE 1: BS EN 62305 Protection against lightning',
  'NOTE 2: when considering a) and b) array frames cannot be both an extraneous-conductive-part and an exposed-conductive-part, because extraneous-conductive-parts are by definition not part of the electrical installation whereas exposed-conductive-parts are.',
  'The requirements described in this diagram apply only to PV arrays constructed using electrically conducting and interconnected metallic frames. The following mounting structures do not require array frame earthing:',
  '(a) Array mounting structures that are comprised wholly of non-conducting materials (for example, plastic, wood etc.) and',
  '(b) Array mounting assemblies that use discrete metallic elements (for example, brackets, bolts etc.) in such a manner that there is no electrical path from the frame of one module to another.',
];

const t2 = (c: FormCtx): string[] => (Array.isArray(c.values.f44_t2) ? (c.values.f44_t2 as string[]) : []);
/** Table 2's rules (FORMS 1.2): at least one; a) and b) never both; d) only on its own. Null when it's fine. */
export function table2Problem(list: string[]): string | null {
  if (!list.length) return null;
  if (list.includes('a') && list.includes('b')) return 'Table 2: a) and b) can’t both apply (see Note 2)';
  if (list.includes('d') && list.length > 1) return 'Table 2: d) means none of a), b) or c) apply, so it goes on its own';
  return null;
}

/** F44 item 24: the highest string Voc × 1.25, and the F43 isolator and OCPD DC ratings that must be at least that. */
export function item24(c: FormCtx): { limit: number | null; highest: { i: number; panels: number | null; voc: number | null } | null; ratings: { what: string; i: number; v: number }[] } {
  if (optimisers(c)) return { limit: null, highest: null, ratings: [] };
  const strings = perStringValues(f43Field('f43_qty'), c).length;
  const vocs = Array.from({ length: strings }, (_, i) => expectedVoc(c, i));
  const limit = dcRatingLimit(vocs);
  const top = vocs.reduce<number>((best, v, i) => (v !== null && (best < 0 || v > (vocs[best] ?? 0)) ? i : best), -1);
  const ratings: { what: string; i: number; v: number }[] = [];
  for (const [key, what] of [
    ['f43_iso_v', 'Isolator'],
    ['f43_ocpd_v', 'OCPD'],
  ] as const) {
    perStringValues(f43Field(key), c).forEach((v, i) => {
      const n = num(v);
      if (n !== null) ratings.push({ what, i, v: n });
    });
  }
  const qty = perStringValues(f43Field('f43_qty'), c);
  const voc = num(roofer(c, 'RF14'));
  return { limit, highest: top >= 0 ? { i: top, panels: num(qty[top]) ?? null, voc } : null, ratings };
}
const lowRatings = (c: FormCtx) => {
  const x = item24(c);
  return x.limit === null ? [] : x.ratings.filter((r) => r.v < x.limit!);
};

const f43Complete = (c: FormCtx) => stepComplete(F43_STEP, c);

const evidence: Record<number, Partial<Field>> = {
  1: { note: (c) => (c.values.SN_INV || c.values.SN_GENMETER ? 'Serials captured on the Serials step.' : null) },
  9: { evidence: ['EP07'] },
  10: { evidence: ['EP07'] },
  11: { note: (c) => (c.design.mounting ? `Mounting: ${{ on_roof: 'on-roof', in_roof: 'in-roof', flat: 'flat roof', ground: 'ground mount' }[c.design.mounting]} (from the design)` : null) },
  13: {
    rooferEvidence: ['RF2'],
    note: (c) => {
      const words = [roofer(c, 'RX1') === 'yes' ? 'hooks into rafters ✓' : roofer(c, 'RX1') === 'no' ? 'hooks not all into rafters ✗' : '', roofer(c, 'RX2') === 'yes' ? 'tiles dressed flat ✓' : roofer(c, 'RX2') === 'no' ? 'tiles not dressed flat ✗' : ''].filter(Boolean);
      return words.length ? `Roofer: ${words.join(' · ')}` : null;
    },
  },
  14: { rooferEvidence: ['RX4p'], note: (c) => (roofer(c, 'RX4') === 'yes' ? 'Roofer: cable entry weather-sealed ✓' : roofer(c, 'RX4') === 'no' ? 'Roofer: cable entry not sealed ✗' : null) },
  16: { note: (c) => (t2(c).length ? `Table 2: ${t2(c).map((x) => `${x})`).join(', ')}` : 'Answer Table 2 below.') },
  17: { evidence: ['EP09'] },
  19: { note: (c) => (t2(c).includes('c') ? 'Table 2 c) is ticked.' : null) },
  21: { evidence: ['EP07', 'EP24'] },
  22: { evidence: ['EP22'] },
  24: {
    note: (c) => {
      if (optimisers(c)) return 'Optimisers fitted: no string Voc to work from.';
      const x = item24(c);
      if (x.limit === null || !x.highest) return 'Worked out once F43 has the panels per string and the roofer’s panel Voc.';
      const r = x.ratings.length ? ` · ratings: ${x.ratings.map((y) => `${y.what.toLowerCase()} ${y.v} V`).join(', ')}` : '';
      return `Highest string ${x.highest.panels} × ${x.highest.voc} V × 1.25 = ${x.limit} V${r}`;
    },
  },
  25: { note: (c) => (perStringValues(f43Field('f43_ocpd_type'), c).every((v) => v === 'None fitted') ? 'F43: no string fuses fitted.' : null) },
  26: { evidence: ['EP23'] },
  27: { evidence: ['EP26'], note: (c) => (num(c.values.EP26r) !== null ? `Reading ${c.values.EP26r} kWh` : null) },
  28: { evidence: ['EP27'], note: (c) => (el(c).dno_route ? `DNO route: ${el(c).dno_route?.toUpperCase()}` : null) },
  29: { evidence: ['EP08'] },
  30: { evidence: ['EP08'] },
  31: { evidence: ['EP08'] },
  32: { evidence: ['EP08'] },
  33: { evidence: ['EP23'] },
  34: { evidence: ['EP22'] },
  35: { evidence: ['EP08'] },
  36: {
    auto: (c) => (el(c).dno_route && (el(c).dno_ref || el(c).dno_route === 'not_needed') ? 'done' : undefined),
    autoFrom: (c) => (el(c).dno_route ? `From the job: ${el(c).dno_route?.toUpperCase()}${el(c).dno_ref ? `, ref ${el(c).dno_ref}` : ''}` : null),
    hint: 'Ticks itself when the office has the DNO route and reference on the job.',
  },
  37: { auto: (c) => (f43Complete(c) ? 'done' : undefined), autoWaits: (c) => !f43Complete(c), autoFrom: () => 'Done in PV tests (F43)', hint: 'Ticks itself when F43 is complete.' },
  38: {
    auto: (c) => (certDone(c) ? 'done' : undefined),
    autoWaits: (c) => !certDone(c),
    autoFrom: () => 'Done in Certificate',
    hint: 'Ticks itself when your electrical certificate is done. Building Control is notified by the office.',
  },
};

export const F44_FIELDS: Field[] = [
  ...F44_ROWS.flatMap((r) => {
    const row = tick(r.key, `${r.n}. ${r.label}`, evidence[r.n] ?? {});
    if (r.n !== 20) return row;
    const kind: Field = {
      key: 'f44_20_kind',
      type: 'SEL',
      label: '20. Which roof?',
      level: 'must',
      options: F44_20_KINDS,
      suggest: (c) => (c.design.mounting === 'on_roof' ? { v: 'pitched', src: 'design', text: 'Pitched Roof' } : c.design.mounting === 'in_roof' ? { v: 'in_roof', src: 'design', text: 'In-roof' } : null),
    };
    return [kind, ...row];
  }),
  {
    key: 'f44_t2',
    type: 'MULTI',
    label: 'Table 2: Array Frame Earthing',
    hint: F44_TABLE2_INSTRUCTION,
    level: 'must',
    group: 'Table 2: Array Frame Earthing',
    options: F44_TABLE2.map((r) => ({ key: r.key, label: r.condition })),
    info: F44_TABLE2.map((r) => `${r.condition} ${r.requirement.join(' ')}`).join('\n\n') + '\n\n' + F44_TABLE2_NOTES.join('\n'),
    note: (c) => table2Problem(t2(c)) ?? (t2(c).some((x) => x !== 'd') ? 'The array frame earth photo (EP25) is now needed.' : null),
  },
  { key: 'f44_comments', type: 'LONG', label: 'Comments', level: 'optional' },
];

const rowOf = (key: string) => F44_ROWS.find((r) => r.key === key)!;

export const F44_FLAGS: FlagRule[] = [
  ...F44_ROWS.map(
    (r): FlagRule => ({
      code: `F44_${r.n}`,
      key: r.key,
      severity: 'urgent',
      when: (c) => is(c, r.key, 'problem'),
      text: (c) => `F44 item ${r.n} ✗ ${rowOf(r.key).label.replace(/:$/, '')}${text(c, `${r.key}n`) ? `: ${text(c, `${r.key}n`)}` : ''}`,
    })
  ),
  ...F44_ROWS.filter((r) => !r.naOk).map(
    (r): FlagRule => ({
      code: `F44_${r.n}_NA`,
      key: r.key,
      severity: 'review',
      when: (c) => is(c, r.key, 'na'),
      text: () => `F44 item ${r.n} marked N/A: ${r.label.replace(/:$/, '')}`,
    })
  ),
  {
    code: 'F44_24',
    key: 'f44_24',
    severity: 'urgent',
    when: (c) => lowRatings(c).length > 0,
    text: (c) =>
      `DC rating below ${item24(c).limit} V (highest string Voc × 1.25): ${lowRatings(c)
        .map((r) => `${r.what.toLowerCase()} on string ${r.i + 1} is ${r.v} V`)
        .join(', ')}`,
  },
  { code: 'F44_T2', key: 'f44_t2', severity: 'stop', when: (c) => !!table2Problem(t2(c)), text: (c) => table2Problem(t2(c))! },
];

export const F44_STEP: Step = {
  key: 'f44',
  title: 'PV checklist (F44)',
  intro: `One tap per row. ✗ asks for a note. ${plural(38, 'row')}, then Table 2.`,
  show: (c) => has(c, 'solar'),
  fields: F44_FIELDS,
};
