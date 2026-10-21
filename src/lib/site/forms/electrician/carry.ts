/**
 * Asked once, carried across (owner, 21 Oct: the same fact or reading must not be asked in two places
 * and come out different on two documents). Where the electrician's pack asks the same thing twice,
 * the first answer given is carried into the other boxes: shown there as "From earlier on this job",
 * counted as answered, printed on that box's own document, and changed by typing over it (their own
 * answer then stands, and clearing it brings the carried one back). Nothing is carried that wasn't
 * given on this job: the survey's earthing is only offered (a suggestion), never carried.
 *
 * - Earthing arrangements: the EV charger record and the EIC (each in its own keys, mapped through
 *   site/earthing.ts).
 * - The installation's earth electrode: its reading (the battery's back-up changeover test, the EV record on a
 *   TT supply, the EIC's RA/Ze), its type and where it is. Only where the box is about that
 *   electrode: an EV charger's own rod on a PME supply, or a back-up battery's electrode on a TN
 *   supply, is a different electrode, so nothing is carried into or out of those.
 * - The heat pump circuit's insulation resistance: the heat pump supply record (tested at 500 V, as its
 *   questions say) and that circuit's Live - Earth and Live - Live columns on the EIC (single-phase,
 *   where line to neutral is live to live, and only for a 500 V test).
 *
 * The rules' context applies it (rules.ts makeCtx), so the phone, the server's gate, the flags and the
 * documents all read the same values. Pure, with type-only imports and the EIC's pure model.
 */
import { earthingFromEic, earthingFromEv, earthingToEv } from '../../earthing';
import type { FormCtx } from '../types';
import { boardsOf, circuitKey, circuitName, readingOf, routeOf, threePhase, type Circuit, type Rec } from './eic-model';

export type CarriedFrom = { from: string };

/** One place a fact is asked: its key, where that is in words, when it's asked about this thing, and its own codes. */
type Box = { key: string; where: string; on: (c: FormCtx) => boolean; read?: (v: unknown) => unknown; write?: (v: unknown) => unknown };

export const WHERE = {
  eic: 'the certificate',
  ev: 'the EV charger record',
  eess: 'the battery tests',
  hp: 'the heat pump supply record',
};

const has = (c: FormCtx, p: string) => c.products.includes(p);
const is = (c: FormCtx, k: string, v: unknown) => c.values[k] === v;
/** An answer is there: not empty, not taken away. */
export const given = (v: unknown) => v !== undefined && v !== null && v !== 'off' && !(typeof v === 'string' && !v.trim()) && !(Array.isArray(v) && !v.length);

/* When each box is asked (as the forms' own show rules: scripts/test-site-carry.mjs checks they agree). */

/** The EIC's Section F (every route but their own certificate). */
const eicSupply = (c: FormCtx) => routeOf(c) !== 'own';
/** The EIC's installation earth electrode (Section G: an EIC, with TT or an electrode as the means of earthing). */
export const eicElectrode = (c: FormCtx) => (routeOf(c) === 'eic' || routeOf(c) === 'eic_single') && (is(c, 'eic_means', 'electrode') || is(c, 'eic_earthing', 'tt'));
const ev = (c: FormCtx) => has(c, 'ev');
/** The EV record's electrode on a TT supply: the installation's own. */
export const evElectrode = (c: FormCtx) => ev(c) && is(c, 'ev_earthing', 'tt');
/** The installation is earthed by its own electrode (TT), as the EIC or the EV record says (each in its own codes). */
export const installationTT = (c: FormCtx) => is(c, 'eic_means', 'electrode') || (earthingFromEic(c.values.eic_earthing) ?? earthingFromEv(c.values.ev_earthing)) === 'tt';
/** The battery's back-up changeover test (its earth electrode reading), on a TT installation: the same electrode. */
export const eessElectrode = (c: FormCtx) => has(c, 'battery') && is(c, 'eess_backup', 'yes') && installationTT(c);

/** Each group is one fact; they're carried in this order (the electrode's boxes depend on the earthing). */
const GROUPS: Box[][] = [
  [
    { key: 'ev_earthing', where: WHERE.ev, on: ev, read: earthingFromEv, write: earthingToEv },
    { key: 'eic_earthing', where: WHERE.eic, on: eicSupply, read: earthingFromEic, write: earthingFromEic },
  ],
  [
    { key: 'bat_bu_ra', where: WHERE.eess, on: eessElectrode },
    { key: 'ev_ra', where: WHERE.ev, on: evElectrode },
    { key: 'eic_ra', where: WHERE.eic, on: eicElectrode },
  ],
  [
    { key: 'ev_rod_type', where: WHERE.ev, on: evElectrode },
    { key: 'eic_rod_type', where: WHERE.eic, on: eicElectrode },
  ],
  [
    { key: 'ev_rod_loc', where: WHERE.ev, on: evElectrode },
    { key: 'eic_rod_loc', where: WHERE.eic, on: eicElectrode },
  ],
];

/** The heat pump's circuit on the EIC: the one added from the job's suggestion, else the first described as a heat pump. */
export function heatPumpCircuit(values: Record<string, unknown>): Circuit | null {
  const { circuits } = boardsOf(values);
  return circuits.find((x) => x.sug === 'heatpump') ?? circuits.find((x) => typeof x.desc === 'string' && /heat\s*pump/i.test(x.desc)) ?? null;
}

/** The heat pump record's boxes and the circuit's columns that are the same test. */
export const HP_IR: [string, string][] = [
  ['hp_ir_le', 'ir_le'],
  ['hp_ir_ln', 'ir_ll'],
];

function heatPumpIr(c: FormCtx, own: Record<string, unknown>, values: Record<string, unknown>, carried: Record<string, CarriedFrom>) {
  const now: FormCtx = { ...c, values };
  if (!has(c, 'heatpump') || routeOf(now) === 'own') return;
  // Single-phase only: on three phases the record's line to neutral isn't the schedule's live to live.
  if (is(now, 'hp_phase', 'three') || threePhase(now)) return;
  const x = heatPumpCircuit(values);
  if (!x) return;
  const key = circuitKey(x.id);
  const mine = (values[key] ?? {}) as Rec;
  const at500 = readingOf(mine.ir_v) === 500;
  const next: Rec = { ...mine };
  let into = false;
  for (const [hp, col] of HP_IR) {
    if (given(own[hp]) && !given(mine[col]) && (at500 || !given(mine.ir_v))) {
      next[col] = own[hp];
      carried[`${key}.${col}`] = { from: WHERE.hp };
      into = true;
    } else if (given(mine[col]) && !given(own[hp]) && at500) {
      values[hp] = mine[col];
      carried[hp] = { from: `${WHERE.eic}, ${circuitName(x, boardsOf(values).boards)}` };
    }
  }
  if (!into) return;
  // The record's readings are at 500 V (its questions say so): the test voltage goes with them.
  if (!given(mine.ir_v)) {
    next.ir_v = 500;
    carried[`${key}.ir_v`] = { from: WHERE.hp };
  }
  values[key] = next;
}

/** The context with what's carried across filled in (values) and said where it's from (carried). The electrician's pack only. */
export function carryAcross(c: FormCtx): FormCtx {
  if (c.trade !== 'electrician') return c;
  const own = c.values;
  const values: Record<string, unknown> = { ...own };
  const carried: Record<string, CarriedFrom> = {};
  for (const group of GROUPS) {
    const now: FormCtx = { ...c, values };
    const boxes = group.filter((b) => b.on(now));
    const from = boxes.find((b) => given(own[b.key]) && given(b.read ? b.read(own[b.key]) : own[b.key]));
    if (!from) continue;
    const v = from.read ? from.read(own[from.key]) : own[from.key];
    for (const b of boxes) {
      if (b === from || given(own[b.key])) continue;
      const w = b.write ? b.write(v) : v;
      if (!given(w)) continue;
      values[b.key] = w;
      carried[b.key] = { from: from.where };
    }
  }
  heatPumpIr(c, own, values, carried);
  return Object.keys(carried).length ? { ...c, values, carried } : c;
}
