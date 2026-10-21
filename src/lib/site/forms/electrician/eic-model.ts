/**
 * The EIC's distribution boards and circuits (REGS 1.2: the Schedules of Circuit Details and of Test
 * Results), kept as ordinary answers so they save on the phone first and sync like everything else:
 * one answer per board (eic_db:b-<id>) and one per circuit (eic_db:c-<id>), both owned by the CUSTOM
 * field eic_db, so two phones editing different circuits never overwrite each other.
 *
 * The columns are data (BOARD, DETAILS, TESTS) so the phone's cards, the gate, the flags and the PDF
 * all read the same list. Test results are marked `test`: never filled in from anywhere, never copied
 * when a circuit is duplicated. Pure, so the tests load it straight into node.
 */
import type { FormCtx } from '../types';
import { irMinimumAt } from '../../fixed/bs7671-ir';
import { maxZsFor, zsCalculated, ZS_MAX } from '../../fixed/bs7671-zs';
import { WIRING_CODES } from '../../fixed/iet-eic';
import { DEFAULT_BS7671 } from '../../design';

export type CertRoute = 'eic' | 'eic_single' | 'meiwc' | 'own';
export const CERT_ROUTES: CertRoute[] = ['eic', 'eic_single', 'meiwc', 'own'];
export const ROUTE_LABEL: Record<CertRoute, string> = {
  eic: 'Electrical Installation Certificate',
  eic_single: 'Single-signature EIC',
  meiwc: 'Minor Works certificate',
  own: 'My own certificate (NAPIT, NICEIC…)',
};
/** One line under each choice on the phone. */
export const ROUTE_HINT: Record<CertRoute, string> = {
  eic: 'New circuits, or a new consumer unit. You sign for building it and testing it; Heliaxis signs the design.',
  eic_single: 'You designed, built and tested it all yourself: you sign in each place.',
  meiwc: 'Work on an existing circuit, no new circuit. One certificate per circuit. Not for a new circuit or a new consumer unit: those need the full certificate.',
  own: 'You’ll upload the certificate from your scheme’s software and give its number.',
};
export const isRoute = (v: unknown): v is CertRoute => CERT_ROUTES.includes(v as CertRoute);

/** The certificate this job is getting: the electrician's choice once made, else the office's. */
export const routeOf = (c: FormCtx): CertRoute => (isRoute(c.values.eic_route) ? c.values.eic_route : officeRoute(c));
/** The office's choice (the assignment's cert_route, carried as FormCtx.eic and FormCtx.el). */
export function officeRoute(c: FormCtx): CertRoute {
  return c.eic?.route ?? (isRoute(c.el?.cert_route) ? c.el.cert_route : 'eic');
}
/** The edition the work was designed to (SPEC 3.1): the job's, else A4:2026. */
export const editionOf = (c: FormCtx) => c.design.bs7671_edition || DEFAULT_BS7671;
export const threePhase = (c: FormCtx) => c.values.eic_live === 'ac_3p3w' || c.values.eic_live === 'ac_3p4w' || c.values.eic_live === 'ac_2p3w';

export type Rec = Record<string, unknown>;
export type Board = Rec & { id: string; o: number };
export type Circuit = Rec & { id: string; board: string; o: number };

export const BOARD_PREFIX = 'eic_db:b-';
export const CIRCUIT_PREFIX = 'eic_db:c-';
export const boardKey = (id: string) => `${BOARD_PREFIX}${id}`;
export const circuitKey = (id: string) => `${CIRCUIT_PREFIX}${id}`;

const obj = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null);

/** The boards (in order) and their circuits (in order) from the answers. */
export function boardsOf(values: Record<string, unknown>): { boards: Board[]; circuits: Circuit[] } {
  const boards: Board[] = [];
  const circuits: Circuit[] = [];
  for (const [k, v] of Object.entries(values)) {
    const o = obj(v);
    if (!o) continue;
    if (k.startsWith(BOARD_PREFIX)) boards.push({ ...o, id: k.slice(BOARD_PREFIX.length), o: Number(o.o) || 0 });
    else if (k.startsWith(CIRCUIT_PREFIX) && typeof o.board === 'string') circuits.push({ ...o, id: k.slice(CIRCUIT_PREFIX.length), board: o.board, o: Number(o.o) || 0 });
  }
  boards.sort((a, b) => a.o - b.o || a.id.localeCompare(b.id));
  const known = new Set(boards.map((b) => b.id));
  const kept = circuits.filter((x) => known.has(x.board));
  kept.sort((a, b) => boards.findIndex((d) => d.id === a.board) - boards.findIndex((d) => d.id === b.board) || a.o - b.o || a.id.localeCompare(b.id));
  return { boards, circuits: kept };
}

/** A short id for a new board or circuit (phone side). */
export const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

/* ── Columns ─────────────────────────────────────────────────────────────────── */

export type PropType = 'NUM' | 'TEXT' | 'SEL' | 'YN' | 'PF' | 'PFN' | 'CONFIRM' | 'MULTI';
/** What a column's show/suggest can depend on beyond its own record: the route, three-phase, a TT supply, and the boards with a T3 SPD. */
export type PropCtx = { route: CertRoute; threePhase: boolean; tt?: boolean; t3?: string[] };
/** A figure offered beside a question (never filled in): tapping it sets the value, and `also` with it. */
export type PropSuggestion = { v: number | string; text: string; also?: Rec };
export type Prop = {
  k: string;
  /** The model form's column number (schedules) */
  col?: number;
  /** The question on the phone, in the form's words. */
  label: string;
  /** The column heading on the PDF (the label when not given). */
  head?: string;
  type: PropType;
  unit?: string;
  dp?: number;
  chips?: number[];
  picks?: string[];
  options?: { key: string; label: string }[];
  gt?: boolean;
  level: 'must' | 'should' | 'optional';
  /** A test result: never filled in from anywhere, never copied by Duplicate. */
  test?: boolean;
  /** Either of a group will do (R1 + R2, or R2). */
  group?: string;
  /** Plain words under the question. */
  hint?: string;
  show?: (x: Rec, p: PropCtx) => boolean;
  /** A worked-out figure to offer (max Zs from first principles). */
  suggest?: (x: Rec, p: PropCtx) => PropSuggestion | null;
};

const yes = (x: Rec, k: string) => x[k] === 'yes';
const notMeiwc = (_: Rec, p: PropCtx) => p.route !== 'meiwc';
const RCD_TYPES = ['AC', 'A', 'F', 'B'];

/** The Distribution board/Consumer unit details at the top of both schedules. */
export const BOARD: Prop[] = [
  { k: 'ref', label: 'Board reference', head: 'DB/CU reference', type: 'TEXT', level: 'must', picks: ['DB1', 'CU1', 'DB2'], hint: '“DB/CU reference” on the certificate. As it’s labelled on the board.' },
  { k: 'loc', label: 'Location', type: 'TEXT', level: 'must', picks: ['Hall cupboard', 'Under the stairs', 'Garage', 'Utility room', 'Kitchen'], hint: 'Where the board is.' },
  { k: 'from', label: 'Supplied from', type: 'TEXT', level: 'must', picks: ['Origin', 'Main switch'], show: notMeiwc, hint: 'The origin, or the board that feeds this one.' },
  { k: 'ocpd_bs', label: 'Distribution circuit OCPD: BS (EN)', type: 'TEXT', level: 'should', picks: ['88-3', '60898-1', '60947-2', '1361'], show: notMeiwc, hint: 'The device protecting the cable that feeds this board (the cut-out fuse for a board at the origin).' },
  { k: 'ocpd_type', label: 'Distribution circuit OCPD: type', type: 'TEXT', level: 'should', picks: ['B', 'C', 'D', 'gG'], show: notMeiwc },
  { k: 'ocpd_a', label: 'Distribution circuit OCPD: rating/setting', type: 'NUM', unit: 'A', level: 'should', chips: [60, 63, 80, 100], show: notMeiwc },
  {
    k: 'spd',
    label: 'SPD details: type(s)',
    type: 'MULTI',
    level: 'must',
    options: [
      { key: 'T1', label: 'T1' },
      { key: 'T2', label: 'T2' },
      { key: 'T3', label: 'T3' },
      { key: 'na', label: 'N/A (no SPD)' },
    ],
    hint: 'The surge protection at this board. A combined T1 + T2 or T2 + T3 device: tick both.',
    show: notMeiwc,
  },
  { k: 'rcd', label: 'RCD for the whole board?', type: 'YN', level: 'must', hint: 'An RCD main switch, or one upstream that protects everything on this board. It goes in the board’s “RCD” line.', show: notMeiwc },
  { k: 'rcd_bs', label: 'Board RCD: BS (EN)', type: 'TEXT', level: 'must', picks: ['61008-1', '61009-1', '62423', '60947-2'], show: (x, p) => p.route !== 'meiwc' && yes(x, 'rcd') },
  { k: 'rcd_type', label: 'Board RCD: type', type: 'TEXT', level: 'must', picks: RCD_TYPES, hint: 'AC, A, F or B; type in anything else.', show: (x, p) => p.route !== 'meiwc' && yes(x, 'rcd') },
  { k: 'rcd_a', label: 'Board RCD: rating', type: 'NUM', unit: 'A', level: 'must', chips: [63, 80, 100], dp: 0, show: (x, p) => p.route !== 'meiwc' && yes(x, 'rcd') },
  { k: 'rcd_idn', label: 'Board RCD: rated residual operating current (IΔn)', type: 'NUM', unit: 'mA', level: 'must', chips: [30, 100, 300], dp: 0, show: (x, p) => p.route !== 'meiwc' && yes(x, 'rcd') },
  { k: 'zdb', label: 'Zdb', head: 'Zdb', type: 'NUM', unit: 'Ω', dp: 2, level: 'must', test: true, hint: 'Earth fault loop impedance measured at this board.', show: notMeiwc },
  { k: 'ipf', label: 'Ipf', head: 'Ipf', type: 'NUM', unit: 'kA', dp: 2, level: 'must', test: true, hint: 'Prospective fault current measured at this board.', show: notMeiwc },
  { k: 'pol', label: 'Confirmed: correct polarity', type: 'CONFIRM', level: 'must', test: true, hint: 'At this board.', show: notMeiwc },
  { k: 'phase', label: 'Confirmed: phase sequence', type: 'CONFIRM', level: 'must', test: true, hint: 'Three-phase boards only.', show: (x, p) => p.route !== 'meiwc' && p.threePhase },
  {
    k: 'spd_ok',
    label: 'SPD: operational status confirmed',
    type: 'SEL',
    level: 'must',
    test: true,
    options: [
      { key: 'yes', label: '✓ Confirmed' },
      { key: 'na', label: 'N/A' },
    ],
    hint: 'You’ve checked its status indicator. Not every SPD has one: N/A then.',
    show: (x, p) => p.route !== 'meiwc' && Array.isArray(x.spd) && (x.spd as string[]).some((s) => s !== 'na'),
  },
];

const WIRING = WIRING_CODES.map((w) => ({ key: w.code, label: `${w.code}: ${w.label}` }));

/** The maximum permitted Zs worked out for this circuit, offered with its source for Remarks (footnote §). */
function zsSuggestion(x: Rec, p: PropCtx): PropSuggestion | null {
  const calc = zsCalculated(x, { tt: p.tt });
  if (!calc) return null;
  return { v: calc.ohms, text: `${calc.ohms} Ω, worked out for this device`, also: { zs_src: calc.source } };
}

/** Schedule of Circuit Details, columns 1–16 (and what Minor Works adds). */
export const DETAILS: Prop[] = [
  { k: 'n', col: 1, label: 'Circuit number', type: 'TEXT', level: 'must', hint: 'The way it’s on in the board.' },
  { k: 'desc', col: 2, label: 'Circuit description', type: 'TEXT', level: 'must', picks: ['Solar PV inverter supply', 'Battery inverter supply', 'EV charge point', 'Heat pump supply', 'Sockets', 'Lights'] },
  { k: 'work', label: 'What was done on this circuit', type: 'TEXT', level: 'must', hint: 'This is the Minor Works description for this circuit.', show: (_, p) => p.route === 'meiwc' },
  { k: 'wiring', col: 3, label: 'Type of wiring', type: 'SEL', level: 'must', options: WIRING, hint: 'The letter from the form’s codes for types of wiring.' },
  { k: 'wiring_other', label: 'Type of wiring: other, please state', type: 'TEXT', level: 'must', show: (x) => x.wiring === 'O' },
  { k: 'ref', col: 4, label: 'Reference method', type: 'TEXT', level: 'must', picks: ['A', 'B', 'C', 'D', 'E', '100', '101', '102', '103'], hint: 'How the cable is installed: BS 7671 Appendix 4, Table 4A2.' },
  { k: 'points', col: 5, label: 'Number of points served', type: 'NUM', level: 'must', chips: [1, 2, 3], dp: 0 },
  { k: 'csa_live', col: 6, label: 'Conductor csa: live', head: 'Live (mm²)', type: 'NUM', unit: 'mm²', level: 'must', chips: [1.5, 2.5, 4, 6, 10, 16] },
  { k: 'csa_cpc', col: 7, label: 'Conductor csa: CPC', head: 'CPC (mm²)', type: 'NUM', unit: 'mm²', level: 'must', chips: [1, 1.5, 2.5, 4, 6, 10] },
  { k: 'ocpd_bs', col: 8, label: 'Overcurrent protective device: BS (EN)', type: 'TEXT', level: 'must', picks: ['60898-1', '61009-1', '60947-2', '88-3', '3036'] },
  { k: 'ocpd_type', col: 9, label: 'Overcurrent protective device: type', type: 'TEXT', level: 'must', picks: ['B', 'C', 'D', 'gG'] },
  { k: 'ocpd_a', col: 10, label: 'Overcurrent protective device: rating', type: 'NUM', unit: 'A', level: 'must', chips: [6, 10, 16, 20, 32, 40, 50] },
  { k: 'ocpd_ka', col: 11, label: 'Overcurrent protective device: breaking capacity', type: 'NUM', unit: 'kA', level: 'must', chips: [6, 10] },
  {
    k: 'zs_max',
    col: 12,
    label: 'Maximum permitted Zs',
    type: 'NUM',
    unit: 'Ω',
    dp: 2,
    level: 'must',
    hint: 'For this device, from BS 7671 Chapter 41, or take the figure worked out for it. Taken from anywhere else? Say where, below.',
    suggest: zsSuggestion,
  },
  { k: 'zs_src', label: 'Where the maximum permitted Zs came from (if not the tables in BS 7671 Chapter 41)', type: 'TEXT', level: 'optional', picks: ['Manufacturer’s data'], hint: 'It goes in Remarks (column 31), as the form asks.' },
  { k: 'rcd', label: 'Protected by an RCD (or RCBO)?', type: 'YN', level: 'must' },
  { k: 'rcd_bs', col: 13, label: 'RCD: BS (EN)', type: 'TEXT', level: 'must', picks: ['61008-1', '61009-1', '62423', '60947-2'], show: (x) => yes(x, 'rcd') },
  { k: 'rcd_type', col: 14, label: 'RCD: type', type: 'TEXT', level: 'must', picks: RCD_TYPES, show: (x) => yes(x, 'rcd') },
  { k: 'rcd_idn', col: 15, label: 'RCD: IΔn', type: 'NUM', unit: 'mA', level: 'must', chips: [30, 100, 300], show: (x) => yes(x, 'rcd') },
  { k: 'rcd_a', col: 16, label: 'RCD: rating', type: 'NUM', unit: 'A', level: 'must', chips: [32, 40, 63, 80, 100], show: (x) => yes(x, 'rcd') },
  { k: 'afdd', label: 'Is there an AFDD on this circuit?', type: 'YN', level: 'must' },
  {
    k: 'spd_t3',
    label: 'T3 surge protector on this circuit: what does it protect?',
    type: 'TEXT',
    level: 'optional',
    hint: 'Only if there’s a T3 SPD on this circuit. It goes in Remarks (column 31), as the form asks.',
    show: (x, p) => !!p.t3?.includes(String(x.board)),
  },
];

/** Schedule of Test Results, columns 17–31. Every one of these is measured or seen: never filled in for them. */
export const TESTS: Prop[] = [
  { k: 'ring', label: 'Ring final circuit?', type: 'YN', level: 'must', hint: 'Radial circuits skip the ring readings.' },
  { k: 'r1', col: 18, label: 'Ring final circuit: r1 (line)', head: 'r1 (line)', type: 'NUM', unit: 'Ω', dp: 2, level: 'must', test: true, show: (x) => yes(x, 'ring') },
  { k: 'rn', col: 19, label: 'Ring final circuit: rn (neutral)', head: 'rn (neutral)', type: 'NUM', unit: 'Ω', dp: 2, level: 'must', test: true, show: (x) => yes(x, 'ring') },
  { k: 'r2', col: 20, label: 'Ring final circuit: r2 (CPC)', head: 'r2 (CPC)', type: 'NUM', unit: 'Ω', dp: 2, level: 'must', test: true, show: (x) => yes(x, 'ring') },
  { k: 'r12', col: 21, label: 'Continuity: (R1 + R2)', head: '(R1 + R2)', type: 'NUM', unit: 'Ω', dp: 2, level: 'must', test: true, group: '(R1 + R2) or R2' },
  { k: 'r2only', col: 22, label: 'Continuity: R2', head: 'R2', type: 'NUM', unit: 'Ω', dp: 2, level: 'must', test: true, group: '(R1 + R2) or R2', hint: 'Only if you measured R2 instead of R1 + R2.' },
  { k: 'ir_v', col: 23, label: 'Insulation resistance: test voltage', head: 'Test voltage', type: 'NUM', unit: 'V', level: 'must', test: true, chips: [250, 500, 1000], dp: 0 },
  { k: 'ir_ll', col: 24, label: 'Insulation resistance: Live - Live', head: 'Live - Live', type: 'NUM', unit: 'MΩ', level: 'must', test: true, gt: true },
  { k: 'ir_le', col: 25, label: 'Insulation resistance: Live - Earth', head: 'Live - Earth', type: 'NUM', unit: 'MΩ', level: 'must', test: true, gt: true },
  { k: 'pol', col: 26, label: 'Polarity', type: 'CONFIRM', level: 'must', test: true, hint: 'A certificate can’t show wrong polarity: put it right first.' },
  { k: 'zs', col: 27, label: 'Zs: maximum measured', head: 'Maximum measured', type: 'NUM', unit: 'Ω', dp: 2, level: 'must', test: true },
  { k: 'rcd_ms', col: 28, label: 'RCD: disconnection time', head: 'Disconnection time (ms)', type: 'NUM', unit: 'ms', level: 'must', test: true, hint: 'At IΔn.', show: (x) => yes(x, 'rcd') },
  {
    k: 'rcd_btn',
    col: 29,
    label: 'RCD: test button operation',
    head: 'Test button operation',
    type: 'PF',
    level: 'must',
    test: true,
    show: (x) => yes(x, 'rcd'),
  },
  {
    k: 'afdd_btn',
    col: 30,
    label: 'AFDD: manual test button operation',
    head: 'Manual test button operation',
    type: 'PFN',
    level: 'must',
    test: true,
    hint: 'N/A if it has no test button.',
    show: (x) => yes(x, 'afdd'),
  },
  {
    k: 'remarks',
    col: 31,
    label: 'Remarks',
    type: 'TEXT',
    level: 'optional',
    test: true,
    hint: 'Anything that could be damaged by testing (an inverter, a charger), and anything else to note.',
  },
];

/** The keys Duplicate copies: the circuit's details, never its readings (nor what its own T3 protects). */
export const COPIED = DETAILS.map((p) => p.k).filter((k) => k !== 'n' && k !== 'spd_t3');

/* ── Filled in? ──────────────────────────────────────────────────────────────── */

/** A reading as a number: 0.45, or ">999" (at least 999). Null when it isn't one. */
export function readingOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /^>\s*(\d+(?:\.\d+)?)$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
}
export const isGt = (v: unknown) => typeof v === 'string' && v.trim().startsWith('>');

export function filled(p: Prop, v: unknown): boolean {
  switch (p.type) {
    case 'NUM':
      return readingOf(v) !== null;
    case 'CONFIRM':
      return v === true;
    case 'MULTI':
      return Array.isArray(v) && v.length > 0;
    default:
      return typeof v === 'string' && v.trim().length > 0;
  }
}

export const propCtx = (c: FormCtx): PropCtx => ({
  route: routeOf(c),
  threePhase: threePhase(c),
  tt: c.values.eic_earthing === 'tt',
  t3: boardsOf(c.values).boards.filter((b) => Array.isArray(b.spd) && (b.spd as string[]).includes('T3')).map((b) => b.id),
});
export const shownProps = (props: Prop[], x: Rec, p: PropCtx) => props.filter((q) => !q.show || q.show(x, p));

/** The must columns still empty, in words ("R1 + R2 (or R2), Max measured Zs"). */
export function missingProps(props: Prop[], x: Rec, p: PropCtx): string[] {
  const out: string[] = [];
  const groups = new Set<string>();
  for (const q of shownProps(props, x, p)) {
    if (q.level !== 'must') continue;
    if (q.group) {
      if (groups.has(q.group)) continue;
      groups.add(q.group);
      if (!props.filter((g) => g.group === q.group).some((g) => filled(g, x[g.k]))) out.push(q.group);
      continue;
    }
    if (!filled(q, x[q.k])) out.push(q.label);
  }
  return out;
}

/** "DB1 circuit 2 (Solar PV inverter supply)". */
export function circuitName(x: Circuit, boards: Board[]): string {
  const b = boards.find((d) => d.id === x.board);
  const desc = typeof x.desc === 'string' && x.desc.trim() ? ` (${x.desc.trim()})` : '';
  return `${String(b?.ref ?? 'Board')} circuit ${String(x.n ?? '?')}${desc}`;
}
export const boardName = (b: Board) => String(b.ref || 'Board');

/** Is this circuit finished: details, and (for test results) every reading? */
export const circuitDone = (x: Circuit, p: PropCtx) => !missingProps(DETAILS, x, p).length && !missingProps(TESTS, x, p).length;
export const boardDone = (b: Board, p: PropCtx) => !missingProps(BOARD, b, p).length;

/* ── Limits beside the readings (never a reading itself) ─────────────────────── */

/** The maximum permitted Zs to check against: the circuit's own (column 12), else the verified table's. */
export const zsLimit = (x: Rec): number | null => readingOf(x.zs_max) ?? maxZsFor(String(x.ocpd_bs ?? ''), String(x.ocpd_type ?? ''), readingOf(x.ocpd_a));
export const zsTableReady = () => ZS_MAX.verified;

/** Circuits whose measured Zs is over the maximum permitted. */
export function zsOver(boards: Board[], circuits: Circuit[]): string[] {
  return circuits
    .filter((x) => {
      const zs = readingOf(x.zs);
      const max = zsLimit(x);
      return zs !== null && max !== null && !isGt(x.zs) && zs > max;
    })
    .map((x) => circuitName(x, boards));
}

/** Circuits with an insulation reading under the Table 64 figure for the test voltage used. */
export function irLow(boards: Board[], circuits: Circuit[]): string[] {
  return circuits
    .filter((x) => {
      const min = irMinimumAt(readingOf(x.ir_v));
      if (min === null) return false;
      return ['ir_ll', 'ir_le'].some((k) => {
        const r = readingOf(x[k]);
        return r !== null && !isGt(x[k]) && r < min;
      });
    })
    .map((x) => circuitName(x, boards));
}

export const failed = (boards: Board[], circuits: Circuit[], k: 'rcd_btn' | 'afdd_btn') => circuits.filter((x) => x[k] === 'fail').map((x) => circuitName(x, boards));
export const unpolarised = (boards: Board[], circuits: Circuit[]) => circuits.filter((x) => x.pol === false).map((x) => circuitName(x, boards));

/* ── Suggested circuits ──────────────────────────────────────────────────────── */

/** What the technologies add (SPEC 3.2.5): a description only; the device and every reading are the electrician's. */
export const SUGGESTED: { sug: string; product: string; desc: string }[] = [
  { sug: 'solar', product: 'solar', desc: 'Solar PV inverter supply' },
  { sug: 'battery', product: 'battery', desc: 'Battery inverter supply' },
  { sug: 'ev', product: 'ev', desc: 'EV charge point' },
  { sug: 'heatpump', product: 'heatpump', desc: 'Heat pump supply' },
];

/** The suggestions still to offer on the first board: not added yet, and not turned down. */
export function suggestionsFor(products: string[], boards: Board[], circuits: Circuit[]) {
  const first = boards[0];
  if (!first) return [];
  const skip = Array.isArray(first.skip) ? (first.skip as string[]) : [];
  const used = new Set(circuits.map((x) => x.sug).filter(Boolean));
  return SUGGESTED.filter((s) => products.includes(s.product) && !used.has(s.sug) && !skip.includes(s.sug));
}

/** The next circuit number on a board: one more than the highest plain number there. */
export function nextNumber(board: string, circuits: Circuit[]): string {
  const nums = circuits.filter((x) => x.board === board).map((x) => Number(x.n)).filter((n) => Number.isInteger(n));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

/* ── Test instruments ────────────────────────────────────────────────────────── */

export const INSTRUMENTS: { k: string; label: string }[] = [
  { k: 'mft', label: 'Multifunction tester' },
  { k: 'cont', label: 'Continuity' },
  { k: 'ir', label: 'Insulation resistance' },
  { k: 'efli', label: 'Earth fault loop impedance' },
  { k: 'rcd', label: 'RCD' },
  { k: 'earth', label: 'Earth electrode resistance' },
];

/** Is an earth electrode on this job (TT, or the installation's own electrode)? Then its tester is needed. */
export const hasElectrode = (c: FormCtx) => c.values.eic_earthing === 'tt' || c.values.eic_means === 'electrode';

/** What's still needed of the instruments: the multifunction tester, or each single tester used. */
export function instrumentsMissing(v: unknown, c: FormCtx, circuits: Circuit[]): string[] {
  const o = obj(v) ?? {};
  const has = (k: string) => typeof o[k] === 'string' && (o[k] as string).trim().length > 0;
  const out: string[] = [];
  if (!has('mft')) {
    const want = ['cont', 'ir', 'efli', ...(circuits.some((x) => x.rcd === 'yes') ? ['rcd'] : [])];
    const short = want.filter((k) => !has(k));
    if (short.length) out.push(has('cont') || has('ir') || has('efli') ? short.map((k) => INSTRUMENTS.find((i) => i.k === k)!.label).join(', ') : 'The multifunction tester (or each tester you used)');
  }
  if (hasElectrode(c) && !has('earth') && !has('mft')) out.push('Earth electrode resistance tester');
  return out;
}
