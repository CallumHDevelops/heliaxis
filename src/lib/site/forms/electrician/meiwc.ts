/**
 * Minor Works (REGS 1.5): an addition or alteration to one existing circuit that doesn't add a new
 * circuit, one certificate per circuit. It shares the EIC's screens (eic.ts hides what Minor Works
 * doesn't ask): the earthing arrangement, the circuits worked on as cards (each with what was done on
 * it, its device and its essential tests), the instruments, the existing installation, departures and
 * exceptions, and one signature. Pure, so the tests load it straight into node.
 */
import type { FormCtx } from '../types';
import { boardsOf, circuitName, type Circuit } from './eic-model';

/** HX-0042-EIC → HX-0042-MW1, HX-0042-MW2…; a second electrician's HX-0042-EIC2 → HX-0042-MW2.1… */
export function meiwcRef(eicRef: string | null, i: number): string | null {
  if (!eicRef) return null;
  const m = /^(.*)-EIC(\d*)$/.exec(eicRef);
  if (!m) return `${eicRef}-MW${i + 1}`;
  return `${m[1]}-MW${m[2] ? `${m[2]}.` : ''}${i + 1}`;
}

/** One Minor Works per circuit worked on, in board and circuit order. */
export function meiwcList(c: FormCtx): { circuit: Circuit; ref: string | null; name: string; key: string }[] {
  const { boards, circuits } = boardsOf(c.values);
  return circuits.map((x, i) => ({ circuit: x, ref: meiwcRef(c.eic?.ref ?? null, i), name: circuitName(x, boards), key: `MEIWC-${i + 1}` }));
}
