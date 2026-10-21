/**
 * The rules for site forms, the same on the phone and the server (the server runs the gate again at
 * sign-off against what it holds). Pure, with type-only imports, so the tests load it into node:
 *
 * - shown / visibleFields: what's asked, from the answers so far. A follow-up whose trigger changes
 *   back keeps its answer in the draft (flipping back restores it) but is left out of the record.
 * - missing: the gate. Every must answer, every photo slot below its minimum, every capture short of
 *   its count; should items listed as "Not filled", never blocking.
 * - flagsFor: FORMS 5 (Stop / Urgent / Review), and mergeFlags to keep when each was raised and how
 *   the office resolved it.
 * - Derived values: the expected string Voc, the F44 item 24 limit, the insulation-resistance minimum.
 */
import type { Field, FormCtx, SiteForm, Step } from './forms/types';
import { IR_MINIMUM } from './fixed/iec62446';
import type { Answers, Flag, Stage } from './types';

export type Missing = { key: string; label: string; step: string; why: string };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The context's values from its answers. */
export function valuesFrom(a: Answers): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(a ?? {})) if (x && typeof x === 'object' && 'v' in x) out[k] = x.v;
  return out;
}

/** A context from its parts: the phone builds them from the job pack and its draft, the server from the database. */
export const makeCtx = (p: Omit<FormCtx, 'values'>): FormCtx => ({ ...p, values: valuesFrom(p.answers) });

/** The photo slots a field fills: one, or one per scaffold side (KEY:front …). */
export function slotsOf(f: Field, c: FormCtx): string[] {
  if (f.type !== 'PHOTOS') return [];
  return f.perSide && c.sides.length ? c.sides.map((s) => `${f.key}:${s}`) : [f.key];
}

export const needOf = (f: Field, c: FormCtx) => (typeof f.need === 'function' ? f.need(c) : (f.need ?? (f.type === 'PHOTOS' ? 1 : 0)));

/** How many strings a PER_STRING field has (at least one, at most twelve). */
export const stringsOf = (f: Field, c: FormCtx) => Math.min(12, Math.max(1, Math.round(f.strings?.(c) ?? 1)));

/** A number as typed, or a ">999" reading from a meter that shows "greater than". */
export const isReading = (v: unknown) => num(v) !== null || (typeof v === 'string' && /^>\s*\d+(\.\d+)?$/.test(v.trim()));

/** Is this field done? (Photos and captures count against their minimum.) */
export function isAnswered(f: Field, c: FormCtx): boolean {
  const v = c.values[f.key];
  switch (f.type) {
    case 'PHOTOS': {
      const need = needOf(f, c);
      return slotsOf(f, c).every((s) => (c.photos[s] ?? 0) >= need);
    }
    case 'SCAN': {
      const list = Array.isArray(v) ? v : [];
      const need = needOf(f, c);
      return need > 0 ? list.length >= need : list.length > 0;
    }
    case 'PER_STRING': {
      const list = Array.isArray(v) ? v : [];
      const n = stringsOf(f, c);
      return list.length >= n && list.slice(0, n).every((x) => isReading(x));
    }
    case 'CONFIRM':
      return v === true || v === 'cant';
    case 'MULTI':
      return Array.isArray(v) && v.length > 0;
    case 'NUM':
      return isReading(v);
    case 'TEXT':
    case 'LONG':
      return text(v).length > 0;
    case 'AUTO':
      return true;
    case 'CUSTOM':
      return !(f.parts?.(c) ?? []).some((p) => (p.level ?? 'must') === 'must');
    case 'SIG':
      return false;
    default:
      return typeof v === 'string' && v.length > 0;
  }
}

/** Fields that are asked now, step by step: a follow-up only while its trigger asks for it. */
export function visibleFields(step: Step, c: FormCtx): Field[] {
  const shownKeys = new Set<string>();
  const out: Field[] = [];
  for (const f of step.fields) {
    if (f.parent && !shownKeys.has(f.parent)) continue;
    if (f.show && !f.show(c)) continue;
    shownKeys.add(f.key);
    out.push(f);
  }
  return out;
}

export const stepShown = (s: Step, c: FormCtx) => !s.show || s.show(c);

/** Every field asked on this form now. */
export const allVisible = (form: SiteForm, c: FormCtx) => form.steps.filter((s) => stepShown(s, c)).flatMap((s) => visibleFields(s, c).map((f) => ({ f, step: s })));

const counts = (f: Field) => f.type !== 'SIG' && f.type !== 'AUTO' && f.level !== 'optional';

function why(f: Field, c: FormCtx): string {
  if (f.type === 'PHOTOS') {
    const need = needOf(f, c);
    const slots = slotsOf(f, c);
    if (slots.length > 1) {
      const short = slots.filter((s) => (c.photos[s] ?? 0) < need).map((s) => s.split(':')[1]);
      return `A photo from the ${short.join(', ')}`;
    }
    const got = c.photos[f.key] ?? 0;
    return `${got} of ${need} photo${need === 1 ? '' : 's'}`;
  }
  if (f.type === 'SCAN') {
    const got = Array.isArray(c.values[f.key]) ? (c.values[f.key] as unknown[]).length : 0;
    const need = needOf(f, c);
    return need ? `${got} of ${need} scanned` : 'Not scanned';
  }
  if (f.type === 'PER_STRING') return 'A number for every string';
  return 'Not answered';
}

/** The gate: what still stops the sign-off (must), and what's worth a look (should). */
export function missing(form: SiteForm, c: FormCtx): { must: Missing[]; should: Missing[] } {
  const must: Missing[] = [];
  const should: Missing[] = [];
  for (const { f, step } of allVisible(form, c)) {
    if (!counts(f)) continue;
    // A field with its own widget lists each thing it still needs ("DB1 circuit 2: test results").
    if (f.type === 'CUSTOM' && f.parts) {
      for (const p of f.parts(c)) ((p.level ?? 'must') === 'must' && f.level === 'must' ? must : should).push({ key: f.key, label: p.label, step: step.key, why: p.why });
      continue;
    }
    if (isAnswered(f, c)) continue;
    // A photo slot with no minimum is never "missing".
    if (f.type === 'PHOTOS' && needOf(f, c) === 0) continue;
    const m = { key: f.key, label: f.label, step: step.key, why: why(f, c) };
    (f.level === 'must' ? must : should).push(m);
  }
  return { must, should };
}

/** "Roof checks · 4 of 9": questions and photo slots done out of those asked (must and should). */
export function stepProgress(step: Step, c: FormCtx): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const f of visibleFields(step, c)) {
    if (!counts(f) || (f.type === 'PHOTOS' && needOf(f, c) === 0)) continue;
    const own = f.type === 'CUSTOM' ? f.progress?.(c) : undefined;
    if (own) {
      done += Math.min(own.done, own.total);
      total += own.total;
      continue;
    }
    total++;
    if (isAnswered(f, c)) done++;
  }
  return { done, total };
}

export function formProgress(form: SiteForm, c: FormCtx): { done: number; total: number } {
  return form.steps.filter((s) => stepShown(s, c)).reduce((a, s) => {
    const p = stepProgress(s, c);
    return { done: a.done + p.done, total: a.total + p.total };
  }, { done: 0, total: 0 });
}

/** "16 questions, 9 photos, about 10 minutes" for the job screen. */
export function summaryLine(form: SiteForm, c: FormCtx): string {
  let questions = 0;
  let photos = 0;
  for (const { f } of allVisible(form, c)) {
    if (!counts(f)) continue;
    if (f.type === 'PHOTOS') photos += needOf(f, c) * slotsOf(f, c).length;
    else questions++;
  }
  return `${questions} question${questions === 1 ? '' : 's'}, ${photos} photo${photos === 1 ? '' : 's'}, about ${form.minutes} minutes`;
}

/** The flags these answers raise (FORMS 5), each once. */
export function flagsFor(form: SiteForm, c: FormCtx): Flag[] {
  const visible = new Set(allVisible(form, c).map(({ f }) => f.key));
  const out: Flag[] = [];
  for (const r of form.flags) {
    // A flag about a question that isn't asked any more doesn't stand.
    if (!visible.has(r.key) && !r.key.startsWith('*')) continue;
    if (!r.when(c)) continue;
    out.push({ code: r.code, severity: typeof r.severity === 'function' ? r.severity(c) : r.severity, key: r.key, text: r.text(c) });
  }
  return out;
}

/**
 * The flags now, keeping when each was first raised and how the office resolved it. A flag the answers
 * no longer raise goes (a tag photo added later clears "Needs tagging"); one that comes back is new.
 */
export function mergeFlags(was: Flag[], now: Flag[], at: string): Flag[] {
  const old = new Map(was.map((f) => [f.code, f]));
  return now.map((f) => {
    const o = old.get(f.code);
    return o && o.severity === f.severity ? { ...f, at: o.at ?? at, resolved_at: o.resolved_at ?? null, resolved_by: o.resolved_by ?? null, note: o.note ?? null } : { ...f, at, resolved_at: null, resolved_by: null, note: null };
  });
}

/** Flags new since the last time (for the Urgent push). */
export const newFlags = (was: Flag[], now: Flag[]) => now.filter((f) => !was.some((o) => o.code === f.code && o.severity === f.severity));

/** Can this form be signed? Not while a Stop flag or a must is open. */
export function signCheck(form: SiteForm, c: FormCtx): { ok: boolean; stops: Flag[]; must: Missing[]; should: Missing[]; flags: Flag[] } {
  const flags = flagsFor(form, c);
  const stops = flags.filter((f) => f.severity === 'stop');
  const { must, should } = missing(form, c);
  return { ok: !stops.length && !must.length, stops, must, should, flags };
}

/**
 * The answers that go on the record: only questions asked now (a hidden follow-up's answer stays on
 * the phone). A KEY:anything answer belongs to field KEY (the EIC's boards and circuits).
 */
export function recordAnswers(form: SiteForm, c: FormCtx): Answers {
  const keys = new Set(allVisible(form, c).map(({ f }) => f.key));
  const out: Answers = {};
  for (const [k, a] of Object.entries(c.answers)) if (keys.has(k) || keys.has(k.split(':')[0])) out[k] = a;
  return out;
}

/** Keys that still take answers once their stage is signed (and the later stage's, once it's open). */
export function lateKeysOf(forms: SiteForm[], signed: Stage[]): string[] {
  const out: string[] = [];
  for (const form of forms) {
    const all = [...form.steps.flatMap((s) => s.fields), form.sig];
    if (signed.includes(form.stage)) out.push(...all.filter((f) => f.late).map((f) => f.key));
    else if (form.after && signed.includes(form.after)) out.push(...all.map((f) => f.key));
  }
  return [...new Set(out)];
}

/** The form a stage uses, and whether it's open yet (the strike after the erection is signed). */
export function openForms(forms: SiteForm[], signed: Stage[]): SiteForm[] {
  return forms.filter((f) => !f.after || signed.includes(f.after));
}

/* ── Derived values ──────────────────────────────────────────────────────────── */

/** A string's expected open-circuit voltage: panels × panel Voc. None with optimisers (they hold the string voltage down). */
export function expectedStringVoc(panels: number | null, panelVoc: number | null, optimisers: boolean | null): number | null {
  if (optimisers || !panels || !panelVoc) return null;
  return Math.round(panels * panelVoc * 10) / 10;
}

/** F44 item 24: an isolator or OCPD's DC rating must be at least the highest string Voc × 1.25. */
export function dcRatingLimit(stringVocs: (number | null)[]): number | null {
  const known = stringVocs.filter((v): v is number => typeof v === 'number' && v > 0);
  return known.length ? Math.round(Math.max(...known) * 1.25 * 10) / 10 : null;
}

/** The insulation-resistance minimum (MΩ) for a test voltage, from the one table (fixed/iec62446.ts). */
export function irMinimum(testVolts: number | null): number | null {
  if (!testVolts) return null;
  const row = IR_MINIMUM.rows.find((r) => testVolts <= r.upToVolts) ?? IR_MINIMUM.rows.at(-1);
  return row ? row.minMegaohm : null;
}

/** Sum of a per-string list (the roofer's panels per string). */
export const sumOf = (v: unknown, n?: number) => (Array.isArray(v) ? v.slice(0, n ?? v.length).reduce((a: number, x) => a + (num(x) ?? 0), 0) : 0);
