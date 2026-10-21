/**
 * The electrician's certificate (SPEC 3, REGS 1.2–1.5): which certificate (D16), then the EIC in the
 * model form's order, one screen per part (P16): supply and earthing, the origin, the 14 inspection
 * lines, the boards and their circuits as cards, the test instruments, the existing installation, the
 * description and extent, and the signatures. Minor Works uses the same screens with what it doesn't
 * ask hidden; "my own certificate" hides them all (Unit 2's upload takes over).
 *
 * Nothing measured is ever filled in for them: supply readings, board readings and every column of
 * the Schedule of Test Results are typed (or picked from chips) by the electrician. Only the client,
 * the address, the signatory's details and the descriptions are offered, each with its source chip.
 *
 * The design part is signed in the office (Site tab → Sign the design part), with the next inspection;
 * a single-signature EIC asks the electrician for it instead. Type-only imports apart from the pure
 * model and the fixed wording, so the tests load it straight into node.
 */
import type { Field, FlagRule, FormCtx, Part, SiteForm, Step, Suggestion } from '../types';
import { missing } from '../../rules';
import { editionWords, INSPECTIONS } from '../../fixed/iet-eic';
import { IR_TABLE_64 } from '../../fixed/bs7671-ir';
import { EARTHING_LABEL, isEarthing } from '../../earthing';
import {
  BOARD,
  boardDone,
  boardName,
  boardsOf,
  circuitDone,
  circuitName,
  DETAILS,
  editionOf,
  failed,
  instrumentsMissing,
  irLow,
  isRoute,
  missingProps,
  numbersTwice,
  officeRoute,
  propCtx,
  ROUTE_HINT,
  ROUTE_LABEL,
  routeOf,
  TESTS,
  threePhase,
  zsOver,
  CERT_ROUTES,
  type CertRoute,
} from './eic-model';

const is = (c: FormCtx, k: string, v: unknown) => c.values[k] === v;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
const has = (c: FormCtx, ...p: string[]) => c.products.some((x) => p.includes(x));
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const route = (c: FormCtx, ...r: CertRoute[]) => r.includes(routeOf(c));
/** An EIC (three-part or single). */
const eic = (c: FormCtx) => route(c, 'eic', 'eic_single');
const notOwn = (c: FormCtx) => !route(c, 'own');
const notMeiwc = (c: FormCtx) => eic(c);
/** An installation earth electrode on this job (TT, or the installation's own electrode). */
const electrodeShown = (c: FormCtx) => is(c, 'eic_means', 'electrode') || is(c, 'eic_earthing', 'tt');

const must = (key: string, type: Field['type'], label: string, extra: Partial<Field> = {}): Field => ({ key, type, label, level: 'must', ...extra });
const yn = (key: string, label: string, extra: Partial<Field> = {}) => must(key, 'YN', label, extra);
const job = (v: unknown, t: string): Suggestion => ({ v, src: 'job', text: t });

/** The other sources of supply the job's technologies suggest, for the schedule (from the job, never a reading). */
export function sourceSuggestions(c: FormCtx): string[] {
  const out: string[] = [];
  if (has(c, 'solar')) out.push(['Solar PV', c.system.kwp ? `${c.system.kwp} kWp` : null, c.system.inverter_model ? `inverter ${c.system.inverter_model}` : null].filter(Boolean).join(', '));
  if (has(c, 'battery')) out.push(['Battery storage', c.system.battery_model].filter(Boolean).join(', '));
  return out;
}

/** "Solar PV (5.28 kWp) and battery storage": what the job is, for the description. */
function describeJob(c: FormCtx): string | null {
  const bits: string[] = [];
  if (has(c, 'solar')) bits.push(`solar PV${c.system.kwp ? ` (${c.system.kwp} kWp)` : ''}`);
  if (has(c, 'battery')) bits.push('battery storage');
  if (has(c, 'ev')) bits.push('an EV charge point');
  if (has(c, 'heatpump')) bits.push('a heat pump supply');
  if (!bits.length) return null;
  const words = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0];
  return `Installation of ${words}`;
}

/** "New circuits: Solar PV inverter supply (DB1 circuit 7)…", from the circuits the electrician has added. */
function extentFrom(c: FormCtx): string | null {
  const { boards, circuits } = boardsOf(c.values);
  const named = circuits.filter((x) => typeof x.desc === 'string' && x.desc.trim());
  if (!named.length) return null;
  const list = named.map((x) => `${String(x.desc).trim()} (${boardName(boards.find((b) => b.id === x.board) ?? { id: '', o: 0 })} circuit ${String(x.n ?? '?')})`);
  return `${is(c, 'eic_work', 'new') ? 'The installation' : `New circuit${named.length === 1 ? '' : 's'}`}: ${list.join('; ')}.`;
}

/** Earthing arrangements, in the form's order (Section F). */
export const EARTHING = [
  { key: 'tn_c', label: 'TN-C' },
  { key: 'tn_s', label: 'TN-S' },
  { key: 'tn_c_s_pme', label: 'TN-C-S (PME)' },
  { key: 'tn_c_s_pnb', label: 'TN-C-S (PNB)' },
  { key: 'tt', label: 'TT' },
  { key: 'it', label: 'IT' },
];
export const LIVE = [
  { key: 'ac_1p2w', label: 'AC 1-phase, 2-wire' },
  { key: 'ac_2p3w', label: 'AC 2-phase, 3-wire' },
  { key: 'ac_3p3w', label: 'AC 3-phase, 3-wire' },
  { key: 'ac_3p4w', label: 'AC 3-phase, 4-wire' },
  { key: 'dc_2w', label: 'DC 2-wire' },
  { key: 'dc_3w', label: 'DC 3-wire' },
  { key: 'other', label: 'Other' },
];
export const MD_UNIT = [
  { key: 'A', label: 'A' },
  { key: 'kVA', label: 'kVA' },
];
export const RA_KIND = [
  { key: 'RA', label: 'RA (earth electrode tester)' },
  { key: 'Ze', label: 'Ze (loop tester)' },
];
/** "If overcurrent protective device: Device type MCCB / ACB / Fuse(s) / other" (Section G, main switch). */
export const MS_DEVICE = [
  { key: 'MCCB', label: 'MCCB' },
  { key: 'ACB', label: 'ACB' },
  { key: 'Fuse(s)', label: 'Fuse(s)' },
  { key: 'other', label: 'Other' },
];
export const HOW = [
  { key: 'enquiry', label: 'By enquiry' },
  { key: 'measured', label: 'Measured' },
];
export const MATERIAL = [
  { key: 'copper', label: 'Copper' },
  { key: 'aluminium', label: 'Aluminium' },
  { key: 'other', label: 'Other' },
];
export const BONDS: { key: string; label: string }[] = [
  { key: 'eic_b_water', label: 'Water installation pipes' },
  { key: 'eic_b_gas', label: 'Gas installation pipes' },
  { key: 'eic_b_oil', label: 'Oil installation pipes' },
  { key: 'eic_b_steel', label: 'Structural steel' },
  { key: 'eic_b_lightning', label: 'Lightning protection system' },
  { key: 'eic_b_other', label: 'Other' },
];
export const COMMENTS = [
  { key: 'no_gas_bond', label: 'No main bonding to gas observed' },
  { key: 'no_water_bond', label: 'No main bonding to water observed' },
  { key: 'no_rcd', label: 'Some existing circuits have no RCD protection' },
  { key: 'ec_small', label: 'Existing earthing conductor smaller than needed today' },
  { key: 'nothing', label: 'Nothing to note' },
];
export const WORK = [
  { key: 'new', label: 'New installation' },
  { key: 'addition', label: 'Adding to an existing installation' },
  { key: 'alteration', label: 'Alteration to an existing installation' },
];
export const INSPECTION_KEY = (i: number) => `eic_i${i + 1}`;

/* ── The parts with their own widget ─────────────────────────────────────────── */

/** The boards and circuits: each board's details, at least one circuit on each, every circuit's details and readings. */
function boardParts(c: FormCtx): Part[] {
  const p = propCtx(c);
  const { boards, circuits } = boardsOf(c.values);
  if (!boards.length) return [{ label: route(c, 'meiwc') ? 'The circuit you worked on' : 'The consumer unit (a board) and its new circuits', why: 'Add a board, then its circuits' }];
  const out: Part[] = [];
  for (const b of boards) {
    const gaps = missingProps(BOARD, b, p);
    if (gaps.length) out.push({ label: `${boardName(b)}: board details`, why: gaps.join(', ') });
    const mine = circuits.filter((x) => x.board === b.id);
    if (!mine.length) out.push({ label: `${boardName(b)}: circuits`, why: 'Add at least one circuit' });
    // Each way on a board has one circuit: two with the same number can't both be right.
    const twice = numbersTwice(b.id, circuits);
    if (twice.length) out.push({ label: `${boardName(b)}: circuit numbers`, why: `${twice.length === 1 ? `Circuit ${twice[0]} is` : `Circuits ${twice.join(', ')} are each`} on this board twice. Give each circuit its own way number.` });
    for (const x of mine) {
      const d = missingProps(DETAILS, x, p);
      const t = missingProps(TESTS, x, p);
      if (d.length) out.push({ label: `${circuitName(x, boards)}: details`, why: d.join(', ') });
      if (t.length) out.push({ label: `${circuitName(x, boards)}: test results`, why: t.join(', ') });
    }
  }
  return out;
}

function boardProgress(c: FormCtx) {
  const p = propCtx(c);
  const { boards, circuits } = boardsOf(c.values);
  const done = boards.filter((b) => boardDone(b, p) && circuits.some((x) => x.board === b.id)).length + circuits.filter((x) => circuitDone(x, p)).length;
  return { done, total: Math.max(1, boards.length + circuits.length) };
}

function boardWords(c: FormCtx): string | null {
  const p = propCtx(c);
  const { boards, circuits } = boardsOf(c.values);
  if (!boards.length) return null;
  return boards
    .map((b) => {
      const mine = circuits.filter((x) => x.board === b.id);
      const list = mine.map((x) => `${String(x.n ?? '?')} ${String(x.desc ?? '')}${circuitDone(x, p) ? ' ✓' : ' (not finished)'}`.trim());
      return `${boardName(b)}${b.loc ? ` (${String(b.loc)})` : ''}: ${mine.length ? list.join(', ') : 'no circuits yet'}`;
    })
    .join(' · ');
}

const sigPart = (slot: string, label: string) => (c: FormCtx): Part[] => ((c.photos[slot] ?? 0) >= 1 ? [] : [{ label, why: 'Not signed yet' }]);

/* ── The steps ───────────────────────────────────────────────────────────────── */

const certStep: Step = {
  key: 'eic-cert',
  title: 'Certificate',
  intro: 'Every new circuit needs an Electrical Installation Certificate. Heliaxis makes it from what you enter here.',
  fields: [
    {
      key: 'eic_route',
      type: 'SEL',
      label: 'Which certificate?',
      level: 'must',
      options: CERT_ROUTES.map((r) => ({ key: r, label: ROUTE_LABEL[r] })),
      suggest: (c) => job(officeRoute(c), `${ROUTE_LABEL[officeRoute(c)]} (what the office chose)`),
      note: (c) => `${ROUTE_HINT[routeOf(c)]}${eic(c) ? ` Printed to BS 7671:2018 amended to ${editionWords(editionOf(c))}.` : ''}`,
    },
    {
      key: 'eic_route_why',
      type: 'TEXT',
      label: 'Why this one? One line for the office.',
      level: 'must',
      parent: 'eic_route',
      show: (c) => isRoute(c.values.eic_route) && c.values.eic_route !== officeRoute(c),
    },
    must('eic_work', 'SEL', 'New installation, or adding to or altering an existing one?', { options: WORK, hint: 'New circuits on a home’s existing wiring are adding to it.', show: eic }),
  ],
};

const supplyStep: Step = {
  key: 'eic-supply',
  title: 'Supply and earthing',
  intro: 'Section F on the certificate: the supply, how it’s earthed and the supplier’s fuse.',
  show: notOwn,
  fields: [
    must('eic_earthing', 'SEL', 'Earthing arrangements', {
      options: EARTHING,
      hint: 'How the supply is earthed.',
      // The surveyor's answer, to confirm on site (the EV record's, once given, is carried across: carry.ts).
      suggest: (c) => {
        const e = c.el?.survey_earthing;
        return isEarthing(e) ? { v: e, src: 'survey', text: EARTHING_LABEL[e] } : null;
      },
    }),
    must('eic_live', 'SEL', 'Number and type of live conductors', { options: LIVE, hint: 'A single-phase house supply is AC 1-phase, 2-wire.', show: notMeiwc }),
    must('eic_polarity', 'CONFIRM', 'Confirmation of supply polarity', { hint: 'You’ve checked the polarity of the incoming supply.', show: notMeiwc }),
    must('eic_u0', 'NUM', 'Nominal voltage, U₀', { unit: 'V', chips: [230], dp: 0, hint: 'Line to earth. By enquiry.', show: notMeiwc }),
    must('eic_u', 'NUM', 'Nominal voltage, U', { unit: 'V', chips: [400], dp: 0, hint: 'Line to line, on a three-phase supply. By enquiry.', show: (c) => notMeiwc(c) && threePhase(c) }),
    must('eic_f', 'NUM', 'Nominal frequency, f', { unit: 'Hz', chips: [50], dp: 0, hint: 'By enquiry.', show: notMeiwc }),
    must('eic_ipf', 'NUM', 'Prospective fault current, Ipf', { unit: 'kA', dp: 2, hint: 'The greater of the short-circuit and earth fault current. By enquiry or measured.', show: notMeiwc }),
    must('eic_ipf_how', 'SEL', 'Ipf: by enquiry or measured?', { options: HOW, show: notMeiwc }),
    must('eic_ze', 'NUM', 'External earth fault loop impedance, Ze', { unit: 'Ω', dp: 2, hint: 'By enquiry or measured.', show: notMeiwc }),
    must('eic_ze_how', 'SEL', 'Ze: by enquiry or measured?', { options: HOW, show: notMeiwc }),
    must('eic_sup_bs', 'TEXT', 'Supply protective device: BS (EN)', { picks: ['88-3', '1361', '88-2'], hint: 'The supplier’s cut-out fuse.', show: notMeiwc }),
    { key: 'eic_sup_type', type: 'TEXT', label: 'Supply protective device: type', level: 'should', show: notMeiwc },
    must('eic_sup_a', 'NUM', 'Supply protective device: rated current', { unit: 'A', chips: [60, 80, 100], dp: 0, show: notMeiwc }),
    must('eic_sup_ka', 'NUM', 'Supply protective device: breaking capacity', { unit: 'kA', chips: [16, 25, 33], hint: 'From the fuse’s marking, or by enquiry.', show: notMeiwc }),
    yn('eic_other', 'Other sources of supply?', {
      hint: 'Solar PV, a battery, a generator… They’re listed on a continuation sheet.',
      show: notMeiwc,
      suggest: (c) => (has(c, 'solar', 'battery') ? job('yes', `Yes: this job has ${has(c, 'solar') ? 'solar PV' : 'a battery'}`) : null),
    }),
    {
      key: 'eic_src',
      type: 'CUSTOM',
      widget: 'eic-sources',
      label: 'The other sources (the schedule attached to the certificate)',
      level: 'must',
      parent: 'eic_other',
      show: (c) => notMeiwc(c) && is(c, 'eic_other', 'yes'),
      parts: (c) => (Array.isArray(c.values.eic_src) && (c.values.eic_src as unknown[]).length ? [] : [{ label: 'Other sources of supply', why: 'List each one' }]),
      words: (c) => (Array.isArray(c.values.eic_src) ? (c.values.eic_src as string[]).join('; ') : null),
    },
  ],
};

const originStep: Step = {
  key: 'eic-origin',
  title: 'At the origin',
  intro: 'Section G on the certificate: earthing, maximum demand, the main protective conductors and the main switch.',
  show: notMeiwc,
  fields: [
    must('eic_means', 'SEL', 'Means of earthing', {
      options: [
        { key: 'distributor', label: 'Distributor’s facility' },
        { key: 'electrode', label: 'Installation earth electrode' },
      ],
    }),
    must('eic_rod_type', 'TEXT', 'Earth electrode: type (rod(s), tape etc)', { picks: ['Rod', 'Rods', 'Tape', 'Plate'], show: electrodeShown }),
    must('eic_rod_loc', 'TEXT', 'Earth electrode: location', { hint: 'Where it is.', show: electrodeShown }),
    must('eic_ra', 'NUM', 'Electrode resistance/impedance, RA/Ze', { unit: 'Ω', dp: 1, hint: 'Measured.', show: electrodeShown }),
    must('eic_ra_kind', 'SEL', 'Measured as RA or Ze?', { options: RA_KIND, hint: 'RA with an earth electrode tester, Ze with a loop tester. The other is struck out on the certificate.', show: electrodeShown }),
    must('eic_md', 'NUM', 'Maximum demand (load)', { dp: 0, hint: 'In amps or kVA: say which next.' }),
    must('eic_md_unit', 'SEL', 'Maximum demand: kVA or A?', { options: MD_UNIT, hint: 'The other is struck out on the certificate.' }),
    must('eic_ec_mat', 'SEL', 'Earthing conductor: material', { options: MATERIAL }),
    must('eic_ec_mat_other', 'TEXT', 'Earthing conductor: what material?', { parent: 'eic_ec_mat', hint: 'It’s written on the certificate in place of “Other”.', show: (c) => is(c, 'eic_ec_mat', 'other') }),
    must('eic_ec_csa', 'NUM', 'Earthing conductor: csa', { unit: 'mm²', chips: [10, 16, 25], hint: 'Its size.' }),
    must('eic_ec_ok', 'CONFIRM', 'Earthing conductor: connection / continuity verified'),
    must('eic_mb_mat', 'SEL', 'Main protective bonding conductors: material', { options: MATERIAL }),
    must('eic_mb_mat_other', 'TEXT', 'Main protective bonding conductors: what material?', { parent: 'eic_mb_mat', hint: 'It’s written on the certificate in place of “Other”.', show: (c) => is(c, 'eic_mb_mat', 'other') }),
    must('eic_mb_csa', 'NUM', 'Main protective bonding conductors: csa', { unit: 'mm²', chips: [10, 16], hint: 'Their size.' }),
    must('eic_mb_ok', 'CONFIRM', 'Main protective bonding conductors: connection / continuity verified'),
    ...BONDS.map((b, i) =>
      must(b.key, 'YNN', `Main bonding to ${b.label.toLowerCase()}`, i === 0 ? { hint: 'Yes: bonded. N/A: there isn’t one.' } : {})
    ),
    must('eic_b_other_what', 'TEXT', 'To other: specify', { hint: 'What else is bonded.', parent: 'eic_b_other', show: (c) => is(c, 'eic_b_other', 'yes') }),
    must('eic_ms_loc', 'TEXT', 'Main switch: location', { picks: ['Consumer unit', 'Meter cupboard', 'Garage'], hint: 'The isolation device, switch-fuse, circuit-breaker or RCD for the installation.' }),
    must('eic_ms_bs', 'TEXT', 'Main switch: BS (EN)', { picks: ['60947-3', '60898-1', '61008-1', '61009-1', '60947-2'] }),
    must('eic_ms_poles', 'NUM', 'Main switch: no of poles', { chips: [1, 2, 3, 4], dp: 0 }),
    must('eic_ms_a', 'NUM', 'Main switch: current rating', { unit: 'A', chips: [60, 80, 100], dp: 0 }),
    must('eic_ms_v', 'NUM', 'Main switch: voltage rating', { unit: 'V', chips: [230, 400], dp: 0 }),
    yn('eic_ms_ocpd', 'Is the main switch an overcurrent protective device?', { hint: 'A switch-fuse or a circuit-breaker. A plain isolator isn’t.' }),
    must('eic_ms_dev', 'SEL', 'Device type', { parent: 'eic_ms_ocpd', options: MS_DEVICE, show: (c) => is(c, 'eic_ms_ocpd', 'yes') }),
    must('eic_ms_dev_other', 'TEXT', 'Device type: other', { parent: 'eic_ms_ocpd', hint: 'What it is.', show: (c) => is(c, 'eic_ms_ocpd', 'yes') && is(c, 'eic_ms_dev', 'other') }),
    must('eic_ms_set', 'NUM', 'Device rating/setting', { parent: 'eic_ms_ocpd', unit: 'A', dp: 0, show: (c) => is(c, 'eic_ms_ocpd', 'yes') }),
    must('eic_ms_ka', 'NUM', 'Breaking capacity', { parent: 'eic_ms_ocpd', unit: 'kA', chips: [6, 10, 16, 25], hint: 'Of the main switch’s overcurrent device.', show: (c) => is(c, 'eic_ms_ocpd', 'yes') }),
    {
      key: 'eic_ms_settings',
      type: 'PHOTOS',
      label: 'Protective device settings (photo)',
      level: 'optional',
      parent: 'eic_ms_ocpd',
      need: 1,
      label_photo: true,
      hint: 'If it has adjustable settings. They go on a continuation sheet, as the form asks.',
      show: (c) => is(c, 'eic_ms_ocpd', 'yes'),
    },
    yn('eic_ms_rcd', 'Is the main switch an RCD?'),
    must('eic_ms_rcd_type', 'TEXT', 'RCD type', { parent: 'eic_ms_rcd', picks: ['AC', 'A', 'F', 'B'], hint: 'AC, A, F or B; type in anything else.', show: (c) => is(c, 'eic_ms_rcd', 'yes') }),
    must('eic_ms_idn', 'NUM', 'Rated residual operating current (IΔn)', { parent: 'eic_ms_rcd', unit: 'mA', chips: [30, 100, 300], dp: 0, show: (c) => is(c, 'eic_ms_rcd', 'yes') }),
    { key: 'eic_ms_delay', type: 'NUM', label: 'Rated time delay', hint: 'A time-delayed RCD’s delay. None: leave it empty.', level: 'should', parent: 'eic_ms_rcd', unit: 'ms', dp: 0, show: (c) => is(c, 'eic_ms_rcd', 'yes') },
    must('eic_ms_time', 'NUM', 'Measured operating time', { parent: 'eic_ms_rcd', unit: 'ms', show: (c) => is(c, 'eic_ms_rcd', 'yes') }),
    must('eic_ms_rcd_ka', 'NUM', 'RCD breaking capacity', { parent: 'eic_ms_rcd', unit: 'kA', chips: [6, 10], show: (c) => is(c, 'eic_ms_rcd', 'yes') }),
  ],
};

const INSPECT_HINT: Record<string, string> = {
  '2.0': 'Includes: the switching for an alternative source (Reg 551.6), a dedicated earthing arrangement where there is one, and the alternative-supply warning notices (Reg 514.15).',
};

const inspectStep: Step = {
  key: 'eic-inspect',
  title: 'Schedule of inspections',
  intro: 'Section H on the certificate. ✓ when it’s inspected and right; N/A when it doesn’t apply here. A ✗ needs putting right before you sign.',
  show: notMeiwc,
  fields: INSPECTIONS.map((it, i) => ({
    key: INSPECTION_KEY(i),
    type: 'TICK' as const,
    label: `${it.n} ${it.label}`,
    level: 'must' as const,
    hint: INSPECT_HINT[it.n],
    note: it.n === '2.0' || it.n === '14.0' ? (c: FormCtx) => (has(c, 'solar', 'battery') ? `This job has ${has(c, 'solar') ? 'solar PV' : 'a battery'}, so ${it.n} applies.` : null) : undefined,
  })),
};

const boardsStep: Step = {
  key: 'eic-boards',
  title: 'Boards and circuits',
  intro: 'The Schedules of Circuit Details and Test Results. One card for each board. Add each circuit with its details, then its test results.',
  show: notOwn,
  fields: [
    {
      key: 'eic_db',
      type: 'CUSTOM',
      widget: 'eic-boards',
      label: 'Boards and circuits',
      level: 'must',
      parts: boardParts,
      progress: boardProgress,
      words: boardWords,
    },
  ],
};

const instrumentsStep: Step = {
  key: 'eic-instruments',
  title: 'Test instruments',
  intro: 'Details of test instruments used, on the Schedule of Test Results: the serial or asset number of each tester. Remembered for your next job.',
  show: notOwn,
  fields: [
    {
      key: 'eic_inst',
      type: 'CUSTOM',
      widget: 'eic-instruments',
      label: 'Test instruments',
      level: 'must',
      parts: (c) => instrumentsMissing(c.values.eic_inst, c, boardsOf(c.values).circuits).map((why) => ({ label: 'Test instruments', why })),
      words: (c) => {
        const o = (c.values.eic_inst ?? {}) as Record<string, string>;
        return Object.values(o).filter((x) => typeof x === 'string' && x.trim()).join(' · ') || null;
      },
    },
  ],
};

const existingStep: Step = {
  key: 'eic-existing',
  title: 'Existing installation',
  intro: 'Section I on the certificate: comments on the existing installation. What you saw of the wiring that was already there, and whether its earthing and bonding are good enough for the new work (Reg 644.1.2).',
  show: (c) => route(c, 'meiwc') || (eic(c) && (is(c, 'eic_work', 'addition') || is(c, 'eic_work', 'alteration'))),
  fields: [
    must('eic_cmt', 'MULTI', 'Anything to note?', { options: COMMENTS }),
    { key: 'eic_cmt_more', type: 'LONG', label: 'Anything else', level: 'optional' },
  ],
};

const extentStep: Step = {
  key: 'eic-extent',
  title: 'Description and extent',
  intro: 'Sections A, B and C on the certificate: the client, the installation, and any departures or permitted exceptions.',
  show: notOwn,
  fields: [
    must('eic_client', 'TEXT', 'Details of the client: name', { hint: 'The person who ordered the work.', suggest: (c) => (c.eic?.client ? job(c.eic.client, c.eic.client) : null) }),
    { key: 'eic_client_addr', type: 'TEXT', label: 'Details of the client: address', level: 'should', suggest: (c) => (c.address ? job(c.address, c.address) : null) },
    must('eic_desc', 'LONG', 'Description of installation', {
      show: notMeiwc,
      suggest: (c) => {
        const d = describeJob(c);
        return d ? job(d, d) : null;
      },
    }),
    must('eic_extent', 'LONG', 'Extent of installation covered by this Certificate', {
      show: notMeiwc,
      suggest: (c) => {
        const d = extentFrom(c);
        return d ? { v: d, src: 'typed', text: d } : null;
      },
      hint: 'What this certificate covers. Offered from the circuits you added; a long one goes on a continuation sheet.',
    }),
    must('eic_mw_fp', 'TEXT', 'Method of fault protection', { picks: ['ADS (automatic disconnection of supply)'], show: (c) => route(c, 'meiwc') }),
    yn('eic_dep', 'Any departures from BS 7671?', { hint: 'Regulations 120.3, 133.1.2, 133.1.3 and 133.5. They go in your parts of the certificate.' }),
    must('eic_dep_what', 'LONG', 'Details of departures', { hint: 'What, and why.', parent: 'eic_dep', show: (c) => is(c, 'eic_dep', 'yes') }),
    yn('eic_exc', 'Any permitted exceptions (Regulation 411.3.3)?', {
      hint: 'For example, a socket without 30 mA RCD protection, backed by a risk assessment. They go in the design part, for the designer to check.',
    }),
    must('eic_exc_what', 'LONG', 'Details of permitted exceptions', { parent: 'eic_exc', show: (c) => is(c, 'eic_exc', 'yes') }),
    must('eic_exc_ra', 'PHOTOS', 'Risk assessment attached (photo)', { hint: 'A photo of each page. It’s attached to the certificate.', parent: 'eic_exc', need: 1, label_photo: true, show: (c) => is(c, 'eic_exc', 'yes') }),
  ],
};

const signStep: Step = {
  key: 'eic-sign',
  title: 'Sign the certificate',
  intro: 'Sections C, D and E on the certificate: your particulars and your signature.',
  show: notOwn,
  fields: [
    must('eic_sig_name', 'TEXT', 'Your name', { hint: 'It prints in capitals.', suggest: (c) => (c.eic?.contact.name ? job(c.eic.contact.name, c.eic.contact.name) : null) }),
    must('eic_sig_co', 'TEXT', 'Company', { suggest: (c) => (c.eic?.contact.company ? job(c.eic.contact.company, c.eic.contact.company) : null) }),
    must('eic_sig_addr', 'TEXT', 'Company address', { suggest: (c) => (c.eic?.contact.address ? job(c.eic.contact.address, c.eic.contact.address) : null) }),
    must('eic_sig_pc', 'TEXT', 'Postcode', { suggest: (c) => (c.eic?.contact.postcode ? job(c.eic.contact.postcode, c.eic.contact.postcode) : null) }),
    must('eic_sig_tel', 'TEXT', 'Phone', { suggest: (c) => (c.eic?.contact.mobile ? job(c.eic.contact.mobile, c.eic.contact.mobile) : null) }),
    must('eic_next', 'NUM', 'Next inspection: an interval of not more than', {
      dp: 0,
      chips: [1, 3, 5, 10],
      hint: 'Section D. You’re the designer on a single-signature certificate, so this is your call: think about how well it will be looked after. There’s no default.',
      show: (c) => route(c, 'eic_single'),
    }),
    must('eic_next_unit', 'SEL', 'Years or months?', {
      options: [
        { key: 'years', label: 'Years' },
        { key: 'months', label: 'Months' },
      ],
      show: (c) => route(c, 'eic_single'),
    }),
    {
      key: 'eic_sig_con',
      type: 'CUSTOM',
      widget: 'eic-sign',
      label: 'Construction: your signature',
      level: 'must',
      show: (c) => route(c, 'eic'),
      parts: sigPart('eic_sig_con', 'Sign for the construction'),
      words: (c) => ((c.photos.eic_sig_con ?? 0) ? 'Signed' : null),
    },
    {
      key: 'eic_sig_ins',
      type: 'CUSTOM',
      widget: 'eic-sign',
      label: 'Inspection and testing: your signature',
      level: 'must',
      show: (c) => route(c, 'eic'),
      parts: sigPart('eic_sig_ins', 'Sign for the inspection and testing'),
      words: (c) => ((c.photos.eic_sig_ins ?? 0) ? 'Signed' : null),
      note: (c) => {
        const d = designOf(c);
        return d ? `Design part signed by ${d.name}.` : 'Heliaxis signs the design part in the office.';
      },
    },
    {
      key: 'eic_sig_one',
      type: 'CUSTOM',
      widget: 'eic-sign',
      label: 'Your signature',
      level: 'must',
      show: (c) => route(c, 'eic_single', 'meiwc'),
      parts: sigPart('eic_sig_one', 'Sign the certificate'),
      words: (c) => ((c.photos.eic_sig_one ?? 0) ? 'Signed' : null),
    },
  ],
};

/** The certificate's screens in order (SPEC 3.2), for the 'cert' section of the electrician's pack. */
export const EIC_STEPS: Step[] = [certStep, supplyStep, originStep, inspectStep, boardsStep, instrumentsStep, existingStep, extentStep, signStep];

/* ── The design part, signed in the office ───────────────────────────────────── */

/** The office's design signature as stored on the assignment (answers.eic_design, written by sign-design). */
export type DesignSign = {
  name: string;
  company: string;
  address: string;
  postcode: string;
  tel: string;
  next_n: number;
  next_unit: 'years' | 'months';
  departures: string | null;
  signed_at: string;
  path: string;
  by: string | null;
};
export function designOf(c: Pick<FormCtx, 'values'>): DesignSign | null {
  const d = c.values.eic_design as DesignSign | undefined;
  return d && typeof d === 'object' && typeof d.name === 'string' && typeof d.path === 'string' ? d : null;
}

/* ── Flags (FORMS 5 style: Stop, Urgent, Review) ─────────────────────────────── */

const listWords = (xs: string[]) => (xs.length > 2 ? `${xs.slice(0, 2).join('; ')} and ${xs.length - 2} more` : xs.join(' and '));
const view = (c: FormCtx) => boardsOf(c.values);

export const EIC_FLAGS: FlagRule[] = [
  {
    code: 'EIC_ROUTE',
    severity: 'review',
    key: 'eic_route',
    when: (c) => isRoute(c.values.eic_route) && c.values.eic_route !== officeRoute(c),
    text: (c) => `Certificate changed from ${ROUTE_LABEL[officeRoute(c)]} to ${ROUTE_LABEL[routeOf(c)]}${text(c, 'eic_route_why') ? `: ${text(c, 'eic_route_why')}` : ''}`,
  },
  ...INSPECTIONS.map(
    (it, i): FlagRule => ({
      code: `EIC_I${i + 1}`,
      severity: 'stop',
      key: INSPECTION_KEY(i),
      when: (c) => is(c, INSPECTION_KEY(i), 'problem'),
      text: () => `Inspection ${it.n} (${it.label}) has a ✗. Put it right before you sign: a certificate can only show ✓ or N/A.`,
    })
  ),
  ...(['2.0', '14.0'] as const).map(
    (n): FlagRule => ({
      code: `EIC_NA_${n.replace('.0', '')}`,
      severity: 'review',
      key: INSPECTION_KEY(INSPECTIONS.findIndex((x) => x.n === n)),
      when: (c) => has(c, 'solar', 'battery') && is(c, INSPECTION_KEY(INSPECTIONS.findIndex((x) => x.n === n)), 'na'),
      text: () => `Inspection ${n} marked N/A on a job with solar PV or a battery`,
    })
  ),
  { code: 'EIC_DEPART', severity: 'review', key: 'eic_dep', when: (c) => is(c, 'eic_dep', 'yes'), text: (c) => `Departures from BS 7671 recorded${text(c, 'eic_dep_what') ? `: ${text(c, 'eic_dep_what')}` : ''}` },
  { code: 'EIC_EXCEPT', severity: 'review', key: 'eic_exc', when: (c) => is(c, 'eic_exc', 'yes'), text: (c) => `Permitted exception (Reg 411.3.3) recorded${text(c, 'eic_exc_what') ? `: ${text(c, 'eic_exc_what')}` : ''}` },
  ...BONDS.filter((b) => b.key !== 'eic_b_other').map(
    (b): FlagRule => ({ code: `EIC_BOND_${b.key.slice(6)}`, severity: 'review', key: b.key, when: (c) => is(c, b.key, 'no'), text: () => `No main bonding to the ${b.label.toLowerCase()}` })
  ),
  {
    code: 'EIC_DEMAND',
    severity: 'review',
    key: 'eic_md',
    when: (c) => {
      const md = num(c.values.eic_md);
      const fuse = num(c.values.eic_sup_a);
      // Amps against amps only: a demand given in kVA isn't compared.
      return c.values.eic_md_unit !== 'kVA' && md !== null && fuse !== null && md > fuse;
    },
    text: (c) => `Maximum demand ${num(c.values.eic_md)} A is more than the ${num(c.values.eic_sup_a)} A supply fuse`,
  },
  {
    code: 'EIC_SUP_KA',
    severity: 'review',
    key: 'eic_sup_ka',
    when: (c) => {
      const ka = num(c.values.eic_sup_ka);
      const ipf = num(c.values.eic_ipf);
      return ka !== null && ipf !== null && ka < ipf;
    },
    text: (c) => `The supply fuse’s breaking capacity (${num(c.values.eic_sup_ka)} kA) is less than the prospective fault current (${num(c.values.eic_ipf)} kA)`,
  },
  {
    code: 'EIC_ZS',
    severity: 'stop',
    key: 'eic_db',
    when: (c) => zsOver(view(c).boards, view(c).circuits).length > 0,
    text: (c) => `Measured Zs is over the maximum permitted on ${listWords(zsOver(view(c).boards, view(c).circuits))}. Put it right, or check the figures.`,
  },
  {
    code: 'EIC_IR',
    severity: () => (IR_TABLE_64.verified ? 'stop' : 'review'),
    key: 'eic_db',
    when: (c) => irLow(view(c).boards, view(c).circuits).length > 0,
    text: (c) => `Insulation resistance below the BS 7671 Table 64 figure on ${listWords(irLow(view(c).boards, view(c).circuits))}`,
  },
  {
    code: 'EIC_RCD_BTN',
    severity: 'stop',
    key: 'eic_db',
    when: (c) => failed(view(c).boards, view(c).circuits, 'rcd_btn').length > 0,
    text: (c) => `The RCD test button didn’t work on ${listWords(failed(view(c).boards, view(c).circuits, 'rcd_btn'))}`,
  },
  {
    code: 'EIC_AFDD_BTN',
    severity: 'stop',
    key: 'eic_db',
    when: (c) => failed(view(c).boards, view(c).circuits, 'afdd_btn').length > 0,
    text: (c) => `The AFDD test button didn’t work on ${listWords(failed(view(c).boards, view(c).circuits, 'afdd_btn'))}`,
  },
];

/* ── For the rest of the pack (the PV inspection, the battery inspection, the system summary) and the office ── */

/** The certificate's screens as a form of their own, for the gate's missing() (the sign-off is the pack's, finish.ts EF_SIG). */
const CERT_SIG: Field = { key: 'EF_SIG', type: 'SIG', label: 'Sign off', level: 'must' };
const certForm = (steps: Step[]): SiteForm => ({ id: 'cert', stage: 'main', title: 'Certificate', steps, sig: CERT_SIG, flags: EIC_FLAGS, minutes: 30 });

/** Everything the certificate needs from the electrician is in (the design part and next inspection aren't theirs). */
export const certMissing = (c: FormCtx) => missing(certForm(EIC_STEPS), c).must;
export const certComplete = (c: FormCtx) => routeOf(c) !== 'own' && certMissing(c).length === 0;

/** The EIC's references for other documents: "HX-0042-EIC: Schedule of inspections…" (the battery inspection), the circuits tested and the next inspection (the system summary). */
export function eicSummary(c: FormCtx): { route: CertRoute; ref: string | null; refs: string | null; circuits: string[]; next: string | null; complete: boolean } {
  const r = routeOf(c);
  const { boards, circuits } = boardsOf(c.values);
  const d = designOf(c);
  const next = r === 'eic_single' ? (num(c.values.eic_next) ? `${num(c.values.eic_next)} ${c.values.eic_next_unit === 'months' ? 'months' : 'years'}` : null) : d ? `${d.next_n} ${d.next_unit}` : null;
  const ref = c.eic?.ref ?? null;
  return {
    route: r,
    ref: r === 'own' ? null : ref,
    refs: r === 'own' || !ref ? null : r === 'meiwc' ? `${ref}: Minor Works` : `${ref}: Schedule of inspections, Schedules of circuit details and test results`,
    circuits: circuits.map((x) => circuitName(x, boards)),
    next,
    complete: certComplete(c),
  };
}

/** How many schedules the certificate has (one of circuit details and one of test results per board). */
export const scheduleCount = (c: FormCtx) => boardsOf(c.values).boards.length;
export const plainCount = (c: FormCtx) => plural(boardsOf(c.values).circuits.length, 'circuit');
