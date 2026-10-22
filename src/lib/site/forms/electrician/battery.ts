/**
 * HX-BAT-01 Battery inspection record (WORDING-SPEC 4) and the steps both battery records are made
 * from. The driver question first (will the battery keep circuits on in a power cut?), then
 * Heliaxis's own checks in its own sections: where it is (with the location questions on PAS 63100
 * jobs), the kit as fitted, cables and switchgear, shock protection and earthing, the back-up supply,
 * labels, and the reference to the BS 7671 tests. With no back-up, the back-up rows offer one tap
 * for N/A, never a pre-answer. The tests (HX-BAT-02) are on their own step (battery-tests.ts).
 * Type-only imports.
 */
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { BAT_TEST_FIELDS, BAT_TESTS } from './battery-tests';
import { certRef } from './cert';
import { captures, el, has, is, text, tick, yn } from './shared';

export const BAT_INSPECT_SECTIONS = [
  'Where it is',
  'The kit as fitted',
  'Cables, switchgear and other services',
  'Shock protection and earthing',
  'Back-up supply',
  'Labels and notices',
  'Electrical tests',
  'Notes',
] as const;
export type BatInspectSection = (typeof BAT_INSPECT_SECTIONS)[number];

/** One ✓ / ✗ / N/A row: key, section, question, help, and whether it's a back-up row. */
export type BatInspectRow = { key: string; section: BatInspectSection; q: string; help?: string; backup?: boolean };

export const BAT_INSPECT_ROWS: BatInspectRow[] = [
  { key: 'bat_space_vent', section: 'Where it is', q: 'Is the space ventilated well enough for the battery?', help: 'Enough air in and out for the battery and the kit beside it, as the battery’s maker asks.' },
  {
    key: 'bat_conditions',
    section: 'Where it is',
    q: 'Does everything suit the conditions where it’s fitted?',
    help: 'Battery, inverter, isolators and cables. IP rating right for any damp, dust or weather, and fine with the heat, cold and knocks they’ll get there.',
  },
  { key: 'bat_heat', section: 'Where it is', q: 'Is it far enough from anything hot?', help: 'Boilers, flues, hot pipes, heaters: as far away as the maker’s manual asks. N/A if there’s nothing hot near it.' },
  {
    key: 'bat_fire',
    section: 'Where it is',
    q: 'Are the fire precautions this battery needs in place?',
    help: 'Smoke or heat detection where the battery is, and anything else its maker or the design asks for to prevent a fire or warn of one.',
  },
  {
    key: 'bat_design',
    section: 'The kit as fitted',
    q: 'Is it installed to the design?',
    help: 'Same battery, inverter, positions and circuits as the design. If anything changed, mark ✗ and say what, so the office can update the design.',
  },
  {
    key: 'bat_standards',
    section: 'The kit as fitted',
    q: 'Is the kit right for the job and made to its product standards?',
    help: 'Check the labels and the makers’ paperwork for the battery, inverter, isolators and breakers.',
  },
  { key: 'bat_undamaged', section: 'The kit as fitted', q: 'Is everything undamaged?', help: 'No dents, cracks or crushed cables from delivery or fitting.' },
  {
    key: 'bat_manual',
    section: 'The kit as fitted',
    q: 'Is it all fitted as the makers’ manuals say?',
    help: 'Battery, inverter and their parts: mounting, fixings, connections and anything else the installation manuals set out.',
  },
  { key: 'bat_space', section: 'The kit as fitted', q: 'Is there the space around it that the maker asks for?', help: 'The gaps to walls, ceiling, floor and other kit given in the installation manual.' },
  {
    key: 'bat_vents_clear',
    section: 'The kit as fitted',
    q: 'Are its own vents clear, and will they stay clear?',
    help: 'Air into and out of the battery and inverter as the maker’s manual asks, with nothing blocking it and nowhere for things to get stacked against them.',
  },
  { key: 'bat_reach', section: 'The kit as fitted', q: 'Can everything be reached to switch off, use and service?', help: 'Isolators, display and the battery itself, without moving things, and with room to work.' },
  {
    key: 'bat_cable_rating',
    section: 'Cables, switchgear and other services',
    q: 'Are the cables sized for the voltage and current?',
    help: 'AC and DC, for the battery’s highest charge and discharge current, allowing for how each cable is run.',
  },
  {
    key: 'bat_cable_ends',
    section: 'Cables, switchgear and other services',
    q: 'Are the cables connected, marked and run properly?',
    help: 'Every termination tight and in the right place, DC positive and negative marked, runs supported and protected.',
  },
  {
    key: 'bat_device_rating',
    section: 'Cables, switchgear and other services',
    q: 'Are the isolators, breakers, fuses and other devices rated for the voltage and current?',
    help: 'DC devices rated for DC at the battery’s voltage.',
  },
  { key: 'bat_device_fit', section: 'Cables, switchgear and other services', q: 'Are the isolators, breakers and other devices fitted and connected properly?' },
  {
    key: 'bat_apart',
    section: 'Cables, switchgear and other services',
    q: 'Is the battery system kept from harming other services, and them from harming it?',
    help: 'Gas, water, heating, data and other circuits: far enough away, or protected, so heat, damage or interference can’t pass between them.',
  },
  { key: 'bat_live_parts', section: 'Shock protection and earthing', q: 'Are all live parts insulated or enclosed?', help: 'Insulation intact. Covers, barriers and enclosures fitted, with an IP rating that suits.' },
  {
    key: 'bat_earthing',
    section: 'Shock protection and earthing',
    q: 'Are the earthing and bonding right for the supply to switch off on a fault?',
    help: 'A suitable main earth, the battery system’s earth connections made properly, main protective bonding in place, and an RCD where fault protection needs one (for example on a TT supply).',
  },
  {
    key: 'bat_extra_prot',
    section: 'Shock protection and earthing',
    q: 'Where extra protection is needed, is it there?',
    help: 'A 30 mA RCD, or supplementary bonding (BS 7671 Section 415). N/A if no part of the battery’s circuits needs it.',
  },
  {
    key: 'bat_other_prot',
    section: 'Shock protection and earthing',
    q: 'If SELV, PELV or double insulation is relied on for protection, is it done properly?',
    help: 'For example Class II (double-insulated) kit. N/A if none of these is relied on.',
  },
  {
    key: 'bat_bu_isolate',
    section: 'Back-up supply',
    q: 'In a power cut, is the back-up supply cut off from the grid on every live conductor?',
    help: 'Line and neutral both, by the changeover switch or the inverter’s back-up relay, so nothing can feed back into the grid.',
    backup: true,
  },
  {
    key: 'bat_bu_electrode',
    section: 'Back-up supply',
    q: 'Does the house have its own earth electrode for when it’s on back-up?',
    help: 'So there’s still an earth when the house is cut off from the grid. Take the earth electrode photo; the reading goes on the tests step.',
    backup: true,
  },
  {
    key: 'bat_bu_rcd',
    section: 'Back-up supply',
    q: 'On back-up, will a fault still switch off fast enough?',
    help: 'The battery gives much less fault current than the grid, so a breaker on its own may be too slow. RCDs make up for it.',
    backup: true,
  },
  { key: 'bat_bu_spd', section: 'Back-up supply', q: 'Is surge protection fitted for the back-up supply?', help: 'As the design’s surge risk assessment asks.', backup: true },
  {
    key: 'bat_bu_load',
    section: 'Back-up supply',
    q: 'Will the back-up supply cope when it switches over?',
    help: 'Loads brought on in stages, or less important ones dropped, so the inverter isn’t overloaded at the moment it switches.',
    backup: true,
  },
  { key: 'bat_labels', section: 'Labels and notices', q: 'Is every battery circuit, isolator and device labelled, and will the labels last?', help: 'Fixed on firmly, and made to stay readable.' },
  {
    key: 'bat_notices',
    section: 'Labels and notices',
    q: 'Are the warning notices up for a second supply and for the battery?',
    help: 'A notice that the house has more than one source of supply, and one saying there’s a battery in the installation: at the origin, at the meter if it’s somewhere else, at the consumer unit the battery connects to, and at every point where a supply can be isolated (BS 7671 Reg 514.15). Made to last.',
  },
  {
    key: 'bat_signs',
    section: 'Labels and notices',
    q: 'Are any safety signs this battery needs in place, and will they last?',
    help: 'For example on the door of the room or garage it’s in, where its maker or the design asks for one. N/A if none is needed.',
  },
];
const ROW = new Map(BAT_INSPECT_ROWS.map((r) => [r.key, r]));
export const batInspectRow = (key: string) => ROW.get(key);

export const BACKUP_KEYS = BAT_INSPECT_ROWS.filter((r) => r.backup).map((r) => r.key);
const noBackup = (c: FormCtx) => is(c, 'eess_backup', 'no');

/* ── Where it is: the battery location questions (PAS 63100 jobs) ─────────── */

/** The survey's battery spots (solar-schema F5); the last four are where the survey says a battery can't go. */
export const BATTERY_SPOTS = [
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'detached_garage', label: 'Detached garage or outbuilding' },
  { key: 'attached_garage_fire', label: 'Attached garage with a fire door' },
  { key: 'attached_garage_open', label: 'Attached garage, open to the house' },
  { key: 'indoor_room', label: 'A room indoors' },
  { key: 'loft', label: 'Loft' },
  { key: 'escape_route', label: 'Hall, stairs or escape route' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'cellar_no_exit', label: 'Cellar with no way out' },
];
const BLOCKED = ['loft', 'escape_route', 'bedroom', 'cellar_no_exit'];
const spotWords = (k: unknown) => BATTERY_SPOTS.find((s) => s.key === k)?.label ?? String(k);

const WHERE: Field = {
  key: 'bl_where',
  type: 'SEL',
  label: 'Where is the battery?',
  level: 'must',
  options: BATTERY_SPOTS,
  suggest: (c) => (el(c).survey_battery_spot ? { v: el(c).survey_battery_spot, src: 'job', text: `${spotWords(el(c).survey_battery_spot)} (the survey)` } : null),
};
const WHY_NOT: Field = {
  key: 'bl_whynot',
  type: 'TEXT',
  label: 'Why isn’t it outside?',
  hint: 'A short reason, for example no suitable outside wall.',
  level: 'must',
  parent: 'bl_where',
  show: (c) => !!c.values.bl_where && !is(c, 'bl_where', 'outdoors'),
};
const DETECT = yn('bl_detect', 'Is there a smoke or heat detector where the battery is?');
const IMPACT = yn('bl_impact', 'Is it protected from knocks?', { hint: 'A car, a door swinging into it, or anything else that could hit it.' });
const PLACE_NOTES: Field = { key: 'bl_notes', type: 'LONG', label: 'Anything else about where it’s fitted?', level: 'optional' };
/** The location questions, asked inside the battery inspection when the job has PAS 63100 ticked. */
export const LOCATION_FIELDS: Field[] = [WHERE, WHY_NOT, DETECT, IMPACT, PLACE_NOTES];

export const LOCATION_FLAGS: FlagRule[] = [
  {
    code: 'BL_SPOT',
    key: 'bl_where',
    severity: 'urgent',
    when: (c) => BLOCKED.includes(String(c.values.bl_where ?? '')),
    text: (c) => `Battery fitted in a spot the survey marks as not for a home battery: ${spotWords(c.values.bl_where)}${text(c, 'bl_whynot') ? ` (${text(c, 'bl_whynot')})` : ''}`,
  },
  ...(
    [
      ['bl_detect', 'No smoke or heat detector where the battery is'],
      ['bl_impact', 'Battery not protected from knocks'],
    ] as const
  ).map(([key, words]): FlagRule => ({ code: key.toUpperCase(), key, severity: 'review', when: (c: FormCtx) => is(c, key, 'no'), text: () => words })),
];

/* ── The fields ──────────────────────────────────────────────────────────── */

const EVIDENCE: Record<string, string[]> = {
  bat_space_vent: ['EP30', 'EP35'],
  bat_conditions: ['EP30', 'EP35'],
  bat_heat: ['EP30'],
  bat_fire: ['EP30', 'EP35'],
  bat_space: ['EP30'],
  bat_vents_clear: ['EP30'],
  bat_reach: ['EP30'],
  bat_device_fit: ['EP33'],
  bat_bu_isolate: ['EP36'],
  bat_bu_electrode: ['EP37'],
  bat_bu_load: ['EP36'],
  bat_labels: ['EP34'],
  bat_notices: ['EP34'],
  bat_signs: ['EP30', 'EP34'],
};
const NOTE: Record<string, (c: FormCtx) => string | null> = {
  bat_design: () => 'Models are checked against the design on the Serials step.',
  bat_standards: (c) => {
    const s = captures(c.values.SN_BAT).filter((x) => !x.unread);
    return s.length ? `Battery serial${s.length > 1 ? 's' : ''}: ${s.map((x) => x.s).join(', ')} (from Serials)` : null;
  },
};
const SECTION_NOTE: Partial<Record<BatInspectSection, string>> = {
  'Where it is': 'The space the battery is in, and what’s around it.',
  'Back-up supply': 'Only for a battery that keeps circuits on in a power cut.',
};

const rowFields = (r: BatInspectRow): Field[] =>
  tick(r.key, r.q, {
    ...(r.help ? { hint: r.help } : {}),
    ...(EVIDENCE[r.key] ? { evidence: EVIDENCE[r.key] } : {}),
    ...(r.backup ? { note: (c: FormCtx) => (noBackup(c) ? 'No back-up on this battery: N/A, unless it applies anyway.' : null) } : NOTE[r.key] ? { note: NOTE[r.key] } : {}),
    // The first back-up row carries the one-tap N/A for all five.
    ...(r.key === 'bat_bu_isolate' ? { bulk: { label: 'N/A: no back-up on this battery', keys: BACKUP_KEYS, v: 'na', when: noBackup } } : {}),
  });
const section = (s: BatInspectSection) => BAT_INSPECT_ROWS.filter((r) => r.section === s).flatMap(rowFields);
/** The first field of each section carries its heading (and note). */
const headed = (s: BatInspectSection, fields: Field[]): Field[] => fields.map((f, i) => (i === 0 ? { ...f, group: s, ...(SECTION_NOTE[s] ? { groupNote: SECTION_NOTE[s] } : {}) } : f));

export const BACKUP_FIELD: Field = {
  key: 'eess_backup',
  type: 'YN',
  label: 'Will this battery keep any circuits on in a power cut?',
  hint: 'Back-up, EPS or island mode. Your answer decides whether the back-up checks here and on the tests step apply.',
  level: 'must',
  suggest: (c) =>
    c.design.battery_backup === true ? { v: 'yes', src: 'design', text: 'Yes' } : c.design.battery_backup === false ? { v: 'no', src: 'design', text: 'No' } : null,
};

export const BAT_TESTS_FIELDS: Field[] = [
  {
    key: 'bat_tests_done',
    type: 'YNN',
    label: 'Have the BS 7671 tests on the battery’s circuits been done?',
    hint: 'Inspection first, then testing (BS 7671 Chapter 64), with the results on the electrical certificate.',
    level: 'must',
  },
  {
    key: 'bat_tests_ref',
    type: 'TEXT',
    label: 'Electrical certificate reference',
    hint: 'Its number, and the schedules of inspections and test results. Offered from your certificate when it’s done in the app.',
    level: 'must',
    suggest: (c) => {
      const ref = certRef(c);
      return ref ? { v: `${ref}: Schedule of inspections / Schedule of test results`, src: 'job', text: `${ref}: Schedule of inspections / Schedule of test results` } : null;
    },
  },
];

/** The battery inspection's fields; the location questions only when the assignment has PAS 63100. */
export function batInspectFields(pas: boolean): Field[] {
  const where = section('Where it is');
  // Where it is: the spot first, then the space, then detection and knocks beside the fire precautions.
  const place = pas ? [WHERE, WHY_NOT, ...where, DETECT, IMPACT, PLACE_NOTES] : where;
  return [
    BACKUP_FIELD,
    ...headed('Where it is', place),
    ...headed('The kit as fitted', section('The kit as fitted')),
    ...headed('Cables, switchgear and other services', section('Cables, switchgear and other services')),
    ...headed('Shock protection and earthing', section('Shock protection and earthing')),
    ...headed('Back-up supply', section('Back-up supply')),
    ...headed('Labels and notices', section('Labels and notices')),
    ...headed('Electrical tests', BAT_TESTS_FIELDS),
    { key: 'bat_inspect_notes', type: 'LONG', label: 'Anything else about the inspection?', level: 'optional', group: 'Notes' },
  ];
}

/** "BAT_SPACE_VENT": a row's code, named after the check. */
export const batCode = (key: string) => `BAT_${key.replace(/^bat_/, '').toUpperCase()}`;
const backupTests = BAT_TESTS.filter((r) => r.backup).map((r) => r.key);

export const BAT_FLAGS: FlagRule[] = [
  ...BAT_INSPECT_ROWS.map(
    (r): FlagRule => ({
      code: batCode(r.key),
      key: r.key,
      severity: 'urgent',
      when: (c) => is(c, r.key, 'problem'),
      text: (c) => `Battery inspection ✗ ${r.q.replace(/\?$/, '')}${text(c, `${r.key}n`) ? `: ${text(c, `${r.key}n`)}` : ''}`,
    })
  ),
  { code: 'BAT_TESTS', key: 'bat_tests_done', severity: 'urgent', when: (c) => is(c, 'bat_tests_done', 'no'), text: () => 'Battery: BS 7671 tests not done' },
  {
    code: 'BAT_TESTS_REF',
    key: 'bat_tests_ref',
    severity: 'urgent',
    when: (c) => is(c, 'bat_tests_done', 'yes') && !text(c, 'bat_tests_ref'),
    text: () => 'Battery: no certificate reference for the BS 7671 tests',
  },
  ...BAT_TESTS.map(
    (r): FlagRule => ({
      code: `BAT_FAIL_${r.key.replace(/^bat_/, '').toUpperCase()}`,
      key: r.key,
      severity: 'urgent',
      when: (c) => is(c, r.key, 'fail'),
      text: () => `Battery test failed: ${r.q.replace(/\?$/, '')}`,
    })
  ),
  {
    code: 'BAT_ONLINE',
    key: 'bat_online',
    severity: 'review',
    when: (c) => !!c.values.bat_online && !is(c, 'bat_online', 'pass'),
    text: () => 'The battery isn’t online: set the monitoring up remotely',
  },
  {
    code: 'BAT_BACKUP',
    key: 'eess_backup',
    severity: 'review',
    when: (c) => (is(c, 'eess_backup', 'yes') && [...backupTests, ...BACKUP_KEYS].some((k) => is(c, k, 'na'))) || (is(c, 'eess_backup', 'no') && BACKUP_KEYS.some((k) => is(c, k, 'done'))),
    text: (c) => (is(c, 'eess_backup', 'yes') ? 'The battery gives back-up, but back-up checks are marked N/A' : 'The battery gives no back-up, but back-up checks are ticked'),
  },
];

export const batInspectStep = (pas: boolean): Step => ({
  key: 'battery-inspect',
  title: 'Battery inspection',
  intro: 'Before you switch on. Check the whole battery installation, AC side and DC side, against BS 7671 and each maker’s installation manual. Tap ✓, ✗ or N/A. ✗ needs a short note.',
  show: (c) => has(c, 'battery'),
  fields: batInspectFields(pas),
});
export const BAT_TESTS_STEP: Step = {
  key: 'battery-tests',
  title: 'Battery switch-on and tests',
  intro: 'After the BS 7671 tests. Switch on, run the maker’s commissioning, then work down the list. Pass, Fail or N/A for each. Tap ⓘ for how to do the test.',
  show: (c) => has(c, 'battery'),
  fields: BAT_TEST_FIELDS,
};
