/**
 * HX-PV-01 Solar PV inspection record (WORDING-SPEC 1, screen P9): Heliaxis's own checks, round the
 * system to the meter, each ✓ Done · ✗ Problem · N/A with the evidence beside it (photos, the
 * roofer's answers, the string tests). Four Yes/No questions work out what the frame's earthing
 * needs. The paperwork rows and the grid settings tick themselves from what the app knows for
 * certain, and can be changed.
 *
 * The roof is the roofer's (owner, 22 Oct): the electrician isn't asked how the panels are mounted or
 * the Roof and panels rows. The record takes those from the roofer's sign-off (RX1–RX14, forms/roofer),
 * and an older record keeps the answers its electrician gave. Type-only imports, plus the rules.
 */
import { dcRatingLimit, perStringValues } from '../../rules';
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { certDone } from './cert';
import { expectedVoc, pvTestField, PV_TEST_STEP } from './pv-tests';
import { MOUNTINGS } from '../roofer';
import { el, has, is, num, optimisers, roofer, stepComplete, text, tick, yn } from './shared';

export { MOUNTINGS };
/** The mounting: the electrician's own answer on an older record, else the roofer's, else the design's. */
export function mountingOf(c: FormCtx): string | null {
  if (typeof c.values.pvi_mount === 'string') return c.values.pvi_mount;
  const r = roofer(c, 'RX10');
  return typeof r === 'string' ? r : c.design.mounting;
}
const ground = (c: FormCtx) => mountingOf(c) === 'ground';

/** The record's section headings, in order (phone and PDF). */
export const PV_INSPECT_SECTIONS = ['Roof and panels', 'Frame earthing', 'Cable runs', 'Kit and protection', 'Meter and grid settings', 'Labels and notices', 'Paperwork', 'Notes'] as const;
export type PvInspectSection = (typeof PV_INSPECT_SECTIONS)[number];

/** A row's answer from the roofer's sign-off, and their note when it's a ✗. */
export type FromRoofer = { v: 'done' | 'problem' | 'na'; why?: string } | null;
/**
 * A ✓ / ✗ / N/A row: its key, section, question and help, and whether N/A is expected there. A row
 * with `fromRoofer` is the roofer's check: never asked of the electrician, its answer comes from them.
 */
export type PvInspectRow = {
  key: string;
  section: PvInspectSection;
  q: string;
  help?: string;
  naOk?: boolean | ((c: FormCtx) => boolean);
  show?: (c: FormCtx) => boolean;
  fromRoofer?: (c: FormCtx) => FromRoofer;
};

const yes = (c: FormCtx, k: string) => is(c, k, 'yes');
const no = (c: FormCtx, k: string) => is(c, k, 'no');
const metal = (c: FormCtx) => yes(c, 'pvi_frame_metal');
/** The functional-earth row: no connected metal frame, or none of the three conditions. */
const funcShown = (c: FormCtx) => no(c, 'pvi_frame_metal') || (metal(c) && no(c, 'pvi_frame_ext') && no(c, 'pvi_frame_exp') && no(c, 'pvi_frame_lp'));

/** The roofer's Yes / No answers as one row: ✗ if any is No (with their note), ✓ once all are Yes. */
const rooferRow =
  (...keys: string[]) =>
  (c: FormCtx): FromRoofer => {
    const bad = keys.find((k) => roofer(c, k) === 'no');
    if (bad) {
      const n = roofer(c, `${bad}n`);
      return { v: 'problem', ...(typeof n === 'string' && n.trim() ? { why: n.trim() } : {}) };
    }
    return keys.every((k) => roofer(c, k) === 'yes') ? { v: 'done' } : null;
  };
/** Watertight: tiles dressed flat (RX2), and any tiles broken during the works replaced to match (RX3, RX3r). */
const watertight = (c: FormCtx): FromRoofer => {
  if (roofer(c, 'RX2') === 'no') return { v: 'problem', why: typeof roofer(c, 'RX2n') === 'string' ? `Tiles not dressed flat: ${roofer(c, 'RX2n')}` : 'Tiles not dressed flat' };
  if (roofer(c, 'RX3') === 'yes' && roofer(c, 'RX3r') === 'no') return { v: 'problem', why: 'Tiles broken during the works and not replaced to match' };
  return roofer(c, 'RX2') === 'yes' && (roofer(c, 'RX3') === 'no' || roofer(c, 'RX3r') === 'yes') ? { v: 'done' } : null;
};

export const PV_INSPECT_ROWS: PvInspectRow[] = [
  {
    key: 'pvi_fixed',
    section: 'Roof and panels',
    fromRoofer: rooferRow('RX1', 'RX11'),
    q: 'Is the frame fixed firmly to the roof structure?',
    help: 'Rails solid with no movement. Hooks or brackets into the rafters at the spacing the design or kit asks for.',
    naOk: ground,
  },
  {
    key: 'pvi_watertight',
    section: 'Roof and panels',
    fromRoofer: watertight,
    q: 'Is the roof still watertight at every fixing?',
    help: 'Tiles or slates sit flat over each hook, none lifted or cracked. In-roof kits: flashings fitted as the kit’s instructions show.',
    naOk: ground,
  },
  {
    key: 'pvi_entry',
    section: 'Roof and panels',
    fromRoofer: rooferRow('RX4'),
    q: 'Is the cable entry through the roof sealed against the weather?',
    help: 'A proper entry, for example a cable entry tile or a flashed gland, sealed. A gap under a tile doesn’t count.',
    naOk: ground,
  },
  {
    key: 'pvi_corrosion',
    section: 'Roof and panels',
    fromRoofer: rooferRow('RX12'),
    q: 'Will the frame and its fixings last outdoors without corroding?',
    help: 'Rails, hooks, clamps and bolts made for outdoor use (aluminium, stainless steel or similar), with no metals touching that react with each other.',
  },
  {
    key: 'pvi_airflow',
    section: 'Roof and panels',
    fromRoofer: rooferRow('RX13'),
    q: 'Can air get behind the panels to keep them cool?',
    help: 'On-roof: a clear gap between panels and tiles. In-roof: the kit’s own ventilation fitted as its instructions say. Trapped heat is a fire risk.',
  },
  {
    key: 'pvi_roof_fire',
    section: 'Roof and panels',
    fromRoofer: (c) => (ground(c) ? { v: 'na' } : rooferRow('RX14')(c)),
    q: 'Has the roof kept its fire performance?',
    help: 'Check the mounting kit’s fire rating in its paperwork suits this roof. This matters most for in-roof kits, which take the place of the tiles.',
    naOk: ground,
  },
  { key: 'pvi_frame_bonded', section: 'Frame earthing', q: 'Is the main protective bonding to the frame in place?', help: 'Bonded back to the main earthing terminal.', show: (c) => metal(c) && yes(c, 'pvi_frame_ext') },
  {
    key: 'pvi_frame_earthed',
    section: 'Frame earthing',
    q: 'Is the frame earthed with a protective conductor?',
    help: 'Back to the installation’s earth.',
    show: (c) => metal(c) && no(c, 'pvi_frame_ext') && yes(c, 'pvi_frame_exp'),
  },
  {
    key: 'pvi_frame_lps',
    section: 'Frame earthing',
    q: 'Is the frame earthed for lightning protection, and joined into the existing system where there is one?',
    help: 'Following BS EN 62305.',
    show: (c) => metal(c) && yes(c, 'pvi_frame_lp'),
  },
  {
    key: 'pvi_frame_func',
    section: 'Frame earthing',
    q: 'Is any earth the panel, inverter or optimiser maker (or the design) asks for fitted?',
    help: 'This is a functional earth, not a safety earth (BS 7671 Section 444 and Chapter 54). N/A if none of them asks for one.',
    naOk: true,
    show: funcShown,
  },
  {
    key: 'pvi_routes',
    section: 'Cable runs',
    q: 'Are the cables run and protected so they can’t get damaged?',
    help: 'Roof: clipped to the rails, no connectors lying on the tiles. Indoors: in the safe zones, or in conduit or trunking where exposed.',
  },
  { key: 'pvi_ac_dc', section: 'Cable runs', q: 'Are the DC and AC cables kept apart?', help: 'Separate runs or containment, so damage to one can’t reach the other.' },
  {
    key: 'pvi_fire_stop',
    section: 'Cable runs',
    q: 'Are holes through walls, floors and ceilings sealed, and nothing at risk from heat?',
    help: 'Fire-stop every hole a cable goes through so the wall or ceiling keeps its fire resistance. Keep cables and kit clear of anything hot or that could burn.',
  },
  { key: 'pvi_sizes', section: 'Cable runs', q: 'Are the cables sized for the current and the volt drop?', help: 'As the design, allowing for how they’re run (through insulation, in a hot loft).' },
  {
    key: 'pvi_dc_insul',
    section: 'Cable runs',
    q: 'Where the design needs it, is the DC cable double or reinforced insulated?',
    help: 'Purpose-made PV cable. N/A if the design doesn’t call for it.',
    naOk: true,
  },
  { key: 'pvi_ends', section: 'Cable runs', q: 'Are all the cable ends connected properly and marked?', help: 'Every termination tight and in the right place. DC positive and negative marked so they can’t be swapped.' },
  {
    key: 'pvi_kit',
    section: 'Kit and protection',
    q: 'Is all the kit to standard, as designed and undamaged?',
    help: 'Panels, inverter, isolators and devices are the models in the design, made to the right product standards, with no damage from delivery or fitting.',
  },
  {
    key: 'pvi_access',
    section: 'Kit and protection',
    q: 'Can you get to everything to use it, check it and service it?',
    help: 'Isolators, inverter and meter reachable without moving things, with the space round the inverter its maker asks for.',
  },
  { key: 'pvi_connected', section: 'Kit and protection', q: 'Is everything connected as the design and the makers’ instructions show?', help: 'Including the extras: monitoring, CT clamps, communication leads.' },
  {
    key: 'pvi_suits',
    section: 'Kit and protection',
    q: 'Does the kit suit where it’s fitted?',
    help: 'Right IP rating outdoors or in damp places, UV-proof where the sun hits it, fine with the heat or cold of a loft or an outside wall.',
  },
  { key: 'pvi_clear', section: 'Kit and protection', q: 'Is the PV kept clear of other services, so neither can harm the other?', help: 'Away from, or protected from, gas, water, heating, data and other circuits.' },
  {
    key: 'pvi_special',
    section: 'Kit and protection',
    q: 'If any kit is in a special location, are that location’s extra measures in place?',
    help: 'Special locations are in BS 7671 Part 7 (for example a room with a bath or shower, or a farm building). N/A if none of the kit is in one.',
    naOk: true,
  },
  { key: 'pvi_live', section: 'Kit and protection', q: 'Is every live part safe from touch?', help: 'Insulated, covered, enclosed or placed where no one can reach it, or the kit is Class II.' },
  {
    key: 'pvi_dc_switch',
    section: 'Kit and protection',
    q: 'Is there a DC switch-disconnector between the array and the inverter?',
    help: 'It can be built into the inverter. It must be able to switch the DC off under load.',
  },
  {
    key: 'pvi_dc_volts',
    section: 'Kit and protection',
    q: 'Is every DC part rated for the highest voltage the array can make?',
    help: 'Isolators, fuses, connectors and cable. The app works out the limit from your string tests and shows it here; it allows for the voltage rising on cold days.',
  },
  {
    key: 'pvi_string_fuse',
    section: 'Kit and protection',
    q: 'Where the design needs them, are there string fuses or blocking diodes?',
    help: 'Usually only where several strings run in parallel. N/A if the design has none.',
    naOk: true,
  },
  { key: 'pvi_spd', section: 'Kit and protection', q: 'Where the design needs it, is surge protection fitted?', help: 'N/A if the design’s surge risk assessment says none is needed.', naOk: true },
  { key: 'pvi_rcd', section: 'Kit and protection', q: 'Where the design or the inverter maker needs one, is an RCD fitted?', help: 'Of the type they specify. N/A if neither needs one.', naOk: true },
  { key: 'pvi_ac_lock', section: 'Kit and protection', q: 'Can the AC isolator be locked off, and not locked on?', help: 'Locked on, it couldn’t be switched off in an emergency.' },
  {
    key: 'pvi_meter',
    section: 'Meter and grid settings',
    q: 'Can the customer read the generation meter easily, and is it sealed?',
    help: 'From where they’d normally stand, without climbing up or needing a torch.',
  },
  {
    key: 'pvi_grid',
    section: 'Meter and grid settings',
    q: 'Are the inverter’s grid protection settings what the network operator requires?',
    help: 'Checked at switch-on: this ticks itself from the Switch-on step.',
  },
  { key: 'pvi_labels', section: 'Labels and notices', q: 'Is every circuit, switch, terminal and protective device labelled?', help: 'So whoever works on it next can tell what’s what.' },
  { key: 'pvi_ac_label', section: 'Labels and notices', q: 'Does the AC isolator have a clear label?' },
  { key: 'pvi_dc_label', section: 'Labels and notices', q: 'Are the DC isolators and any DC junction boxes labelled?', help: 'Built-in isolators too.' },
  {
    key: 'pvi_schematic',
    section: 'Labels and notices',
    q: 'Is a schematic of the PV system fixed up on site?',
    help: 'Where someone working on the system will look for it, usually by the consumer unit or the inverter.',
  },
  {
    key: 'pvi_settings_note',
    section: 'Labels and notices',
    q: 'Is there a notice on site with our contact details and the inverter’s protection settings?',
    help: 'Heliaxis’s name and phone number, and the settings the inverter is running.',
  },
  { key: 'pvi_shutdown', section: 'Labels and notices', q: 'Are the emergency shutdown steps on display?', help: 'What to switch off, in what order, to make the system safe.' },
  { key: 'pvi_labels_last', section: 'Labels and notices', q: 'Will the labels and notices last?', help: 'Fixed on firmly, and made to stay readable: no fading, peeling or smudging.' },
  {
    key: 'pvi_dno',
    section: 'Paperwork',
    q: 'Does the job have its DNO details?',
    help: 'The connection route (G98 or G99) and the reference. Ticks itself when the office has them on the job.',
  },
  { key: 'pvi_tests', section: 'Paperwork', q: 'Are the string tests done?', help: 'Ticks itself when the String tests step is complete.' },
  { key: 'pvi_cert', section: 'Paperwork', q: 'Is the electrical certificate done?', help: 'Ticks itself when your certificate is complete. Heliaxis tells Building Control.' },
];
const ROW = new Map(PV_INSPECT_ROWS.map((r) => [r.key, r]));
export const naOkFor = (r: PvInspectRow, c: FormCtx) => (typeof r.naOk === 'function' ? r.naOk(c) : !!r.naOk);

/** The frame earthing's four questions (Yes / No). */
export const FRAME_QUESTIONS: Field[] = [
  yn('pvi_frame_metal', 'Is the mounting a connected metal frame?', {
    hint: 'Yes for metal rails that link one panel’s frame to the next. No if the mounting is all non-metal (plastic, timber), or its metal parts (separate brackets, bolts) don’t connect one panel to the next. No means the frame itself needs no earthing; still fit any earth the panel, inverter or optimiser maker asks for.',
  }),
  yn('pvi_frame_ext', 'Could the frame bring in earth potential from outside the electrical installation?', {
    hint: 'For example it touches the ground, or earthed metalwork such as a metal roof or structure. BS 7671 calls that an extraneous-conductive-part. If Yes, the frame gets main protective bonding (BS 7671 Section 544).',
    show: metal,
  }),
  yn('pvi_frame_exp', 'Could the frame become live if the insulation in the panels or cables failed?', {
    hint: 'BS 7671 calls that an exposed-conductive-part. Class II (double-insulated) panels and DC cables normally mean No. If Yes, earth it with a protective conductor back to the installation’s earth (BS 7671 Section 543). A frame can’t be this and the one above at the same time, so this is only asked when the answer above is No.',
    show: (c) => metal(c) && no(c, 'pvi_frame_ext'),
  }),
  yn('pvi_frame_lp', 'Is there lightning protection on or near this roof, or does the building need it?', {
    hint: 'If Yes, the frame is earthed for lightning protection following BS EN 62305, the lightning protection standard.',
    show: metal,
    note: (c) => (funcShown(c) ? null : frameNeedsLine(c)),
  }),
];

/** "The frame needs: main protective bonding and lightning protection earthing": worked out from the four questions, null until they're answered. */
export function frameNeeds(c: FormCtx): string | null {
  if (no(c, 'pvi_frame_metal')) return 'no frame earth: the mounting isn’t a connected metal frame';
  if (!metal(c)) return null;
  const parts = [yes(c, 'pvi_frame_ext') && 'main protective bonding', no(c, 'pvi_frame_ext') && yes(c, 'pvi_frame_exp') && 'a protective earth', yes(c, 'pvi_frame_lp') && 'lightning protection earthing'].filter(Boolean) as string[];
  if (parts.length) return parts.join(' and ');
  return funcShown(c) ? 'no safety earth; a functional earth only where a maker or the design asks' : null;
}
export const frameNeedsLine = (c: FormCtx) => (frameNeeds(c) ? `The frame needs: ${frameNeeds(c)}.` : null);

/** The highest string Voc × 1.25, and the string tests' isolator and fuse DC ratings that must be at least that. */
export function dcVoltageLimit(c: FormCtx): { limit: number | null; highest: { i: number; panels: number | null; voc: number | null } | null; ratings: { what: string; i: number; v: number }[] } {
  if (optimisers(c)) return { limit: null, highest: null, ratings: [] };
  const strings = perStringValues(pvTestField('pvt_panels'), c).length;
  const vocs = Array.from({ length: strings }, (_, i) => expectedVoc(c, i));
  const limit = dcRatingLimit(vocs);
  const top = vocs.reduce<number>((best, v, i) => (v !== null && (best < 0 || v > (vocs[best] ?? 0)) ? i : best), -1);
  const ratings: { what: string; i: number; v: number }[] = [];
  for (const [key, what] of [
    ['pvt_iso_v', 'Isolator'],
    ['pvt_fuse_v', 'Fuse'],
  ] as const) {
    perStringValues(pvTestField(key), c).forEach((v, i) => {
      const x = num(v);
      if (x !== null) ratings.push({ what, i, v: x });
    });
  }
  const qty = perStringValues(pvTestField('pvt_panels'), c);
  const voc = num(roofer(c, 'RF14'));
  return { limit, highest: top >= 0 ? { i: top, panels: num(qty[top]) ?? null, voc } : null, ratings };
}
const lowRatings = (c: FormCtx) => {
  const x = dcVoltageLimit(c);
  return x.limit === null ? [] : x.ratings.filter((r) => r.v < x.limit!);
};

const testsComplete = (c: FormCtx) => stepComplete(PV_TEST_STEP, c);
const roofWords = (c: FormCtx, parts: [string, string, string][]) => {
  const words = parts.map(([k, ok, bad]) => (roofer(c, k) === 'yes' || roofer(c, k) === true ? ok : roofer(c, k) === 'no' || roofer(c, k) === 'cant' ? bad : '')).filter(Boolean);
  return words.length ? `Roofer: ${words.join(' · ')}` : null;
};
const stringOne = (c: FormCtx, key: string) => perStringValues(pvTestField(key), c)[0];

/** The evidence and worked-out answers beside each row (WORDING-SPEC 1, "Logic, evidence"). */
const EXTRA: Record<string, Partial<Field>> = {
  pvi_frame_bonded: { evidence: ['EP25'] },
  pvi_frame_earthed: { evidence: ['EP25'] },
  pvi_frame_lps: { evidence: ['EP25'] },
  pvi_frame_func: { note: frameNeedsLine },
  pvi_routes: {
    evidence: ['EP07', 'EP24'],
    note: (c) =>
      roofWords(c, [
        ['RF8', 'DC cables clipped ✓', 'DC cables not all clipped ✗'],
        ['RF9', 'no DC connectors on the roof ✓', 'DC connectors on the roof ✗'],
      ]),
  },
  pvi_ac_dc: { evidence: ['EP07', 'EP24'] },
  pvi_fire_stop: { evidence: ['EP07'] },
  pvi_sizes: {
    note: (c) => {
      const mm2 = num(stringOne(c, 'pvt_cable_mm2'));
      const kind = stringOne(c, 'pvt_cable');
      return mm2 !== null ? `String cable: ${mm2} mm²${typeof kind === 'string' && kind.trim() ? `, ${kind.trim()}` : ''}` : null;
    },
  },
  pvi_dc_insul: {
    note: (c) => {
      const kind = stringOne(c, 'pvt_cable');
      return typeof kind === 'string' && kind.trim() ? `String cable: ${kind.trim()}` : null;
    },
  },
  pvi_kit: { note: () => 'Serials are on the Serials step.' },
  pvi_access: { evidence: ['EP20'] },
  pvi_connected: { evidence: ['EP28'] },
  pvi_dc_switch: { evidence: ['EP22'] },
  pvi_dc_volts: {
    note: (c) => {
      if (optimisers(c)) return null;
      const x = dcVoltageLimit(c);
      if (x.limit === null || !x.highest) return 'Worked out once the string tests have the panels on each string and the roofer has the panel’s Voc.';
      const r = x.ratings.length ? ` · ratings: ${x.ratings.map((y) => `${y.what.toLowerCase()} ${y.v} V`).join(', ')}` : '';
      return `Highest string ${x.highest.panels} × ${x.highest.voc} V × 1.25 = ${x.limit} V${r}`;
    },
  },
  pvi_string_fuse: { note: (c) => (perStringValues(pvTestField('pvt_fuse'), c).every((v) => v === 'None fitted') ? 'No string fuses in the string tests.' : null) },
  pvi_spd: { evidence: ['EP09'] },
  pvi_ac_lock: { evidence: ['EP23'] },
  pvi_meter: { evidence: ['EP26'], note: (c) => (num(c.values.EP26r) !== null ? `Reading ${c.values.EP26r} kWh` : null) },
  pvi_grid: {
    evidence: ['EP27'],
    auto: (c) => (is(c, 'pvc_grid', 'done') ? 'done' : is(c, 'pvc_grid', 'problem') ? 'problem' : undefined),
    autoWaits: (c) => !is(c, 'pvc_grid', 'done') && !is(c, 'pvc_grid', 'problem'),
    autoFrom: () => 'Done in Switch-on',
  },
  pvi_labels: { evidence: ['EP08'] },
  pvi_ac_label: { evidence: ['EP23'] },
  pvi_dc_label: { evidence: ['EP22'] },
  pvi_schematic: { evidence: ['EP08'] },
  pvi_settings_note: { evidence: ['EP08'] },
  pvi_shutdown: { evidence: ['EP08'] },
  pvi_labels_last: { evidence: ['EP08'] },
  pvi_dno: {
    auto: (c) => (el(c).dno_route && (el(c).dno_ref || el(c).dno_route === 'not_needed') ? 'done' : undefined),
    autoFrom: (c) => (el(c).dno_route ? `From the job: ${el(c).dno_route?.toUpperCase()}${el(c).dno_ref ? `, ref ${el(c).dno_ref}` : ''}` : null),
  },
  pvi_tests: { auto: (c) => (testsComplete(c) ? 'done' : undefined), autoWaits: (c) => !testsComplete(c), autoFrom: () => 'Done in String tests' },
  pvi_cert: { auto: (c) => (certDone(c) ? 'done' : undefined), autoWaits: (c) => !certDone(c), autoFrom: () => 'Done in Certificate' },
};

const SECTION_NOTE: Partial<Record<PvInspectSection, string>> = {
  'Frame earthing': 'Four questions work out what the frame needs. If more than one answer is Yes, do what each one asks; where they overlap, follow the stricter.',
};

const rowFields = (r: PvInspectRow, first: boolean): Field[] =>
  tick(r.key, r.q, { ...(r.help ? { hint: r.help } : {}), ...(r.show ? { show: r.show } : {}), ...(first ? { group: r.section, groupNote: SECTION_NOTE[r.section] } : {}), ...EXTRA[r.key] });

/** The roofer's checks: never shown to the electrician. Kept as fields so answers saved under these keys before (an older record) still read. */
const ROOFERS = () => false;

export const PV_INSPECT_FIELDS: Field[] = [
  { key: 'pvi_mount', type: 'SEL', label: 'How are the panels mounted?', level: 'must', options: MOUNTINGS, show: ROOFERS },
  ...PV_INSPECT_ROWS.filter((r) => r.section === 'Roof and panels').flatMap((r) => rowFields({ ...r, show: ROOFERS }, false)),
  ...FRAME_QUESTIONS.map((f, i) => (i === 0 ? { ...f, group: 'Frame earthing', groupNote: SECTION_NOTE['Frame earthing'] } : f)),
  ...PV_INSPECT_ROWS.filter((r) => r.section !== 'Roof and panels').flatMap((r, i, list) => rowFields(r, r.section !== 'Frame earthing' && (i === 0 || list[i - 1].section !== r.section))),
  { key: 'pvi_notes', type: 'LONG', label: 'Anything else the office should know?', level: 'optional', group: 'Notes' },
];

/** "PVI_FIXED": the row's code, named after the check. */
export const pvInspectCode = (key: string) => `PVI_${key.replace(/^pvi_/, '').toUpperCase()}`;

export const PV_INSPECT_FLAGS: FlagRule[] = [
  ...PV_INSPECT_ROWS.map(
    (r): FlagRule => ({
      code: pvInspectCode(r.key),
      key: r.key,
      severity: 'urgent',
      when: (c) => is(c, r.key, 'problem'),
      text: (c) => `PV inspection ✗ ${r.q.replace(/\?$/, '')}${text(c, `${r.key}n`) ? `: ${text(c, `${r.key}n`)}` : ''}`,
    })
  ),
  ...PV_INSPECT_ROWS.filter((r) => r.naOk !== true).map(
    (r): FlagRule => ({
      code: `${pvInspectCode(r.key)}_NA`,
      key: r.key,
      severity: 'review',
      when: (c) => is(c, r.key, 'na') && !naOkFor(r, c),
      text: () => `PV inspection: N/A on ${r.q.replace(/\?$/, '')}`,
    })
  ),
  {
    code: 'PVI_DC_RATING',
    key: 'pvi_dc_volts',
    severity: 'urgent',
    when: (c) => lowRatings(c).length > 0,
    text: (c) =>
      `DC rating below ${dcVoltageLimit(c).limit} V (highest string Voc × 1.25): ${lowRatings(c)
        .map((r) => `${r.what.toLowerCase()} on string ${r.i + 1} is ${r.v} V`)
        .join(', ')}`,
  },
];

/** A row's question, for the PDF and the office. */
export const pvInspectRow = (key: string) => ROW.get(key);

export const PV_INSPECT_STEP: Step = {
  key: 'pv-inspect',
  title: 'PV inspection',
  intro: 'Work round the system from the frame to the meter. Tap ✓, ✗ or N/A. ✗ needs a short note. The roof checks are the roofer’s: their answers go on this record for you.',
  show: (c) => has(c, 'solar'),
  fields: PV_INSPECT_FIELDS,
};
