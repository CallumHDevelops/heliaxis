/**
 * What is held for a form being filled in, and the rules for changing it: checking an answer against the
 * question it answers, who entered it and from where, how much is left, and the two-way conversion with
 * SimpliHeat's commissioning record (the same questions, kept there as booleans and typed answers).
 *
 * Pure: no I/O. The database and the routes (templates/server.ts) read and write what these return.
 */
import { allFields, visibility } from './rules';
import type { Answers, DocTemplate, TemplateField } from './types';

export type Source = 'hap' | 'simpliheat';
/**
 * Who entered the answer held, when, and from where. `other` is a different answer SimpliHeat has for the same
 * question, kept beside one entered here until someone decides (the one held is never replaced silently).
 */
export type Provenance = { by: string | null; at: string; source: Source; other?: { value: string | number; source: 'simpliheat'; at: string } };
/** A signature line, signed: the name, when, and how it was taken. `image` is a PNG data URL when one was drawn. */
export type SignedLine = { name: string; at: string; source: 'device' | 'remote' | 'hap'; image?: string };

export type FormState = {
  answers: Answers;
  provenance: Record<string, Provenance>;
  signed: Record<string, SignedLine>;
};
export const emptyForm = (): FormState => ({ answers: {}, provenance: {}, signed: {} });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: string) => DAY.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

export type Checked = { ok: true; value: string | number | null } | { ok: false; why: string };

/**
 * An answer, checked against its question and tidied: text trimmed, a number as a number, a yes/no as
 * 'yes' | 'no' | 'na' (no 'na' where the question has none), a choice one of its options, a date as
 * YYYY-MM-DD. Empty clears the answer (value null).
 */
export function checkAnswer(f: TemplateField, v: unknown): Checked {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === 'string' && v.trim() === '') return { ok: true, value: null };
  const name = `“${f.label}”`;
  switch (f.kind) {
    case 'text':
    case 'long': {
      const s = String(v).trim();
      const max = f.kind === 'long' ? 4000 : 300;
      return s.length > max ? { ok: false, why: `${name} is too long (${max} characters at most).` } : { ok: true, value: s };
    }
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : NaN;
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, why: `${name} needs a number.` };
    }
    case 'yesno': {
      const s = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
      if (s === 'na' && f.noNa) return { ok: false, why: `${name} is answered Yes or No.` };
      return ['yes', 'no', 'na'].includes(s) ? { ok: true, value: s } : { ok: false, why: `${name} is answered Yes, No or N/A.` };
    }
    case 'choice': {
      const s = String(v);
      return (f.options ?? []).includes(s) ? { ok: true, value: s } : { ok: false, why: `“${s}” isn’t one of the options for ${name}.` };
    }
    case 'date': {
      const s = String(v).trim();
      return validDay(s) ? { ok: true, value: s } : { ok: false, why: `${name} needs a date.` };
    }
  }
}

export type Patched = { state: FormState; changed: string[]; unknown: string[]; problems: string[] };

/**
 * Apply answers to a form. Only questions in the template are taken (the rest are listed in `unknown`); an
 * answer that doesn't suit its question is refused (in `problems`) and the rest still go in; an answer
 * that is the same as the one held changes nothing, including who entered it. Empty clears an answer.
 * Who entered each changed answer, when and from where is kept beside it.
 */
export function applyAnswers(t: DocTemplate, state: FormState, patch: Record<string, unknown>, by: { name: string | null }, source: Source, now: string): Patched {
  const fields = new Map(allFields(t).map((f) => [f.key, f]));
  const answers: Answers = { ...state.answers };
  const provenance = { ...state.provenance };
  const changed: string[] = [];
  const unknown: string[] = [];
  const problems: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    const f = fields.get(key);
    if (!f) {
      unknown.push(key);
      continue;
    }
    const c = checkAnswer(f, raw);
    if (!c.ok) {
      problems.push(c.why);
      continue;
    }
    const held = answers[key] ?? null;
    if (held === c.value) continue;
    if (c.value === null) {
      delete answers[key];
      delete provenance[key];
    } else {
      answers[key] = c.value;
      provenance[key] = { by: by.name, at: now, source };
    }
    changed.push(key);
  }
  return { state: { ...state, answers, provenance }, changed, unknown, problems };
}

/** A question with nothing entered that prints the job's own value (a pre-fill: the address, the customer) is not left to answer. */
const blank = (f: TemplateField, answers: Answers) => !f.prefill && String(answers[f.key] ?? '').trim() === '';

/** The questions that are asked (shown) and still have no answer, in the order the form asks them. */
export function outstanding(t: DocTemplate, answers: Answers): TemplateField[] {
  const { fields } = visibility(t, answers);
  return allFields(t).filter((f) => fields.has(f.key) && blank(f, answers));
}

/** How much of the form is done: the questions asked, answered and left. */
export function progress(t: DocTemplate, answers: Answers): { asked: number; answered: number; left: number } {
  const { fields } = visibility(t, answers);
  const asked = allFields(t).filter((f) => fields.has(f.key));
  const left = asked.filter((f) => blank(f, answers)).length;
  return { asked: asked.length, answered: asked.length - left, left };
}

/** The signature lines of a template, in order. */
export const signerKeys = (t: DocTemplate): { key: string; label: string }[] => t.sections.flatMap((s) => (s.type === 'sign' ? s.signers : []));

/* ── SimpliHeat ─────────────────────────────────────────────────────────────── */

/** SimpliHeat's commissioning record (lib/commissioning/schema.ts): answers by key, booleans for yes/no, and the signatures. */
export type SimpliHeatSignature = { image?: string; name?: string; signedAt?: string; source?: 'device' | 'remote' };
export type SimpliHeatRecord = {
  answers?: Record<string, string | number | boolean | null>;
  technicianName?: string;
  technicianSignedAt?: string;
  customerName?: string;
  customerSignedAt?: string;
  technicianSignature?: SimpliHeatSignature;
  customerSignature?: SimpliHeatSignature;
};

/**
 * What SimpliHeat holds, as a form here: its answers (true and false as Yes and No), each marked as from
 * SimpliHeat at the time given, and its two signatures as the 'technician' and 'customer' lines. Answers
 * for questions this template doesn't have, or that don't suit the question, are listed in `skipped`.
 */
export function fromSimpliHeat(t: DocTemplate, rec: SimpliHeatRecord, now: string, line = { technician: 'technician', customer: 'customer' }): { state: FormState; skipped: string[] } {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec.answers ?? {})) patch[k] = typeof v === 'boolean' ? (v ? 'yes' : 'no') : v;
  const r = applyAnswers(t, emptyForm(), patch, { name: 'SimpliHeat' }, 'simpliheat', now);
  const signed: Record<string, SignedLine> = {};
  const lines = new Set(signerKeys(t).map((s) => s.key));
  const take = (key: string, sig: SimpliHeatSignature | undefined, name: string | undefined, at: string | undefined) => {
    const who = sig?.name ?? name;
    const when = sig?.signedAt ?? at;
    if (lines.has(key) && who && when) signed[key] = { name: who, at: when, source: sig?.source ?? 'device', ...(sig?.image ? { image: sig.image } : {}) };
  };
  take(line.technician, rec.technicianSignature, rec.technicianName, rec.technicianSignedAt);
  take(line.customer, rec.customerSignature, rec.customerName, rec.customerSignedAt);
  return { state: { ...r.state, signed }, skipped: [...r.unknown, ...r.problems] };
}

/**
 * The answers held here, as SimpliHeat's checklist holds them (Yes and No as true and false), for it to
 * show as suggestions. N/A has no place in SimpliHeat's yes/no, so it isn't sent.
 */
export function toSimpliHeat(t: DocTemplate, answers: Answers): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of allFields(t)) {
    const v = answers[f.key];
    if (v === null || v === undefined || String(v).trim() === '') continue;
    if (f.kind === 'yesno') {
      if (v === 'yes') out[f.key] = true;
      else if (v === 'no') out[f.key] = false;
    } else out[f.key] = v;
  }
  return out;
}
