/**
 * What the electrician's sections share: reading answers, the job's facts (FormCtx.el), Claude's
 * reads, the checklist row with its ✗ note and photo, and the technology words. Type-only imports
 * (and relative ones), so the tests load the forms straight into node.
 */
import { isAnswered, visibleFields } from '../../rules';
import type { ElectricianFacts, Field, FormCtx, LabelReadResult, Step } from '../types';

export const is = (c: FormCtx, k: string, v: unknown) => c.values[k] === v;
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const has = (c: FormCtx, ...products: string[]) => c.products.some((p) => products.includes(p));

const NO_FACTS: ElectricianFacts = {
  cert_route: 'eic',
  customer_first: '',
  dno_route: null,
  dno_ref: null,
  export_limit_kw: null,
  inverter_kw: null,
  battery_kwh: null,
  ev_model: null,
  heat_pump_model: null,
  survey_battery_spot: null,
  survey_earthing: null,
  roofer: null,
  voc_tolerance: 10,
  instruments: null,
  name: null,
  scheme: null,
  scheme_number: null,
};
/** The job's facts for the electrician (never undefined: unknown is empty). */
export const el = (c: FormCtx): ElectricianFacts => c.el ?? NO_FACTS;

/** The roofer's answer to a question, if they've given one. */
export const roofer = (c: FormCtx, key: string): unknown => el(c).roofer?.values[key];

/** The latest good read of a photo slot (this trade's, or the roofer's with `from: 'roofer'`). */
export function readOf(c: FormCtx, slot: string, from: 'me' | 'roofer' = 'me'): LabelReadResult | null {
  const list = from === 'roofer' ? (el(c).roofer?.reads ?? []) : c.reads;
  const r = [...list].reverse().find((x) => x.key === slot && x.status === 'read');
  return r?.result ?? null;
}
export const unreadable = (c: FormCtx, slot: string) => [...c.reads].reverse().find((x) => x.key === slot)?.status === 'unreadable';

/** Models compared loosely: case, spaces and dashes don't count, and one may contain the other. Unknown is never a mismatch. */
export const sameModel = (a: string | null | undefined, b: string | null | undefined) => {
  const n = (s: string) => s.toLowerCase().replace(/[\s\-_/]+/g, '');
  if (!a || !b) return true;
  return n(a).includes(n(b)) || n(b).includes(n(a));
};

/** Optimisers on this roof: what the roofer said, else the design. */
export const optimisers = (c: FormCtx): boolean | null => {
  const r = roofer(c, 'RF7');
  return r === 'yes' ? true : r === 'no' ? false : c.design.optimisers;
};

/** Panels fitted: the roofer's count, else the design's. */
export const panelsFitted = (c: FormCtx): number | null => num(roofer(c, 'RX5')) ?? c.system.panel_count;

/** Serials as kept by a SCAN field ({ s, src, unread?, photo? }). */
export type Captured = { s: string; src: string; unread?: boolean; photo?: string };
export const captures = (v: unknown): Captured[] => (Array.isArray(v) ? (v as Captured[]).filter((x) => x && typeof x === 'object' && typeof x.s === 'string') : []);

/** "the solar app", "the battery app", "the charger app", "the heat pump controls" (EF3, by technology). */
export function appWordsFor(products: string[]): string {
  if (products.includes('solar')) return 'the solar app';
  if (products.includes('battery')) return 'the battery app';
  if (products.includes('ev')) return 'the charger app';
  if (products.includes('heatpump')) return 'the heat pump controls';
  return 'how it all works';
}
export const appWords = (c: FormCtx) => appWordsFor(c.products);

export const yn = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, type: 'YN', label, level: 'must', ...extra });

/**
 * A checklist row (P9): ✓ Done · ✗ Problem · N/A. ✗ opens a note (needed) and offers a photo, as
 * `<key>n` and `<key>p` under the row. N/A on a row that doesn't allow it is flagged for the office.
 */
export function tick(key: string, label: string, extra: Partial<Field> = {}): Field[] {
  const problem = (c: FormCtx) => is(c, key, 'problem');
  return [
    { key, type: 'TICK', label, level: 'must', ...extra },
    { key: `${key}n`, type: 'TEXT', label: 'What’s the problem?', hint: 'It goes on the form as a numbered note.', level: 'must', parent: key, show: problem },
    { key: `${key}p`, type: 'PHOTOS', label: 'A photo of it, if it helps', level: 'should', need: 0, parent: key, show: problem },
  ];
}

/** "Done in PV tests (F43)": where a worked-out tick comes from. */
export const doneIn = (section: string) => () => `Done in ${section}`;

/** A step is complete: every must on it that's asked now is answered (F44 item 37 reads F43's). */
export const stepComplete = (step: Step, c: FormCtx) =>
  (!step.show || step.show(c)) && visibleFields(step, c).every((f) => f.level !== 'must' || f.type === 'SIG' || (f.type === 'AUTO' && !f.done) || isAnswered(f, c));
