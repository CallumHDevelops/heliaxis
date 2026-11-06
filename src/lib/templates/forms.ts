/**
 * Filling in a form for a project: opening it, saving answers, signing, revising, and exchanging answers with
 * SimpliHeat. The rules live here; where the records are kept is a FormStore (templates/store.ts is the database's,
 * the tests use one in memory), so the same rules run in both.
 *
 * Two people can save at once (the office in HAP, SimpliHeat's push), so every change is made against the version
 * of the record that was read and tried again if it has moved: nobody's answer is lost to someone else's save.
 */
import { applyAnswers, fromSimpliHeat, outstanding, progress, signerKeys, toSimpliHeat, type FormState, type Provenance, type SignedLine, type SimpliHeatRecord, type Source } from './answers';
import { visibility } from './rules';
import type { Answers, DocTemplate } from './types';

export type FormStatus = 'draft' | 'signed' | 'superseded';
export type FormRow = {
  id: string;
  project_id: string;
  template_code: string;
  issue: string;
  revision: number;
  status: FormStatus;
  answers: Answers;
  provenance: Record<string, Provenance>;
  signed: Record<string, SignedLine>;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface FormStore {
  /** The live (not superseded) record for a project and form. */
  live(projectId: string, code: string): Promise<FormRow | null>;
  /** A new draft; 'exists' when another one has just been made (the caller reads it instead). */
  insert(row: { project_id: string; template_code: string; issue: string; created_by: string | null }): Promise<FormRow | 'exists'>;
  /** Change a record only if it is still the version that was read (`seen` is its updated_at); null when it has moved on. */
  update(id: string, seen: string, patch: Partial<Pick<FormRow, 'answers' | 'provenance' | 'signed' | 'status'>>, by: string | null): Promise<FormRow | null>;
  /** Supersede a signed record and start revision + 1 as a draft; the new record's id. */
  revise(id: string, by: string | null): Promise<string>;
  get(id: string): Promise<FormRow | null>;
}

export type Who = { id: string | null; name: string | null };
const TRIES = 5;

/** Run a change against the record as read; read it again and retry if someone else saved in between. */
async function change(store: FormStore, row: FormRow, make: (row: FormRow) => Partial<Pick<FormRow, 'answers' | 'provenance' | 'signed' | 'status'>> | null, by: string | null): Promise<FormRow> {
  let cur = row;
  for (let i = 0; i < TRIES; i++) {
    const patch = make(cur);
    if (!patch) return cur;
    const done = await store.update(cur.id, cur.updated_at, patch, by);
    if (done) return done;
    const again = await store.get(cur.id);
    if (!again) throw new Error('The record has gone.');
    cur = again;
  }
  throw new Error('Someone else is saving this form. Try again.');
}

const state = (r: FormRow): FormState => ({ answers: r.answers, provenance: r.provenance, signed: r.signed });

/** The record for a project and form, started as a draft if there isn't one. */
export async function openForm(store: FormStore, t: DocTemplate, projectId: string, by: Who): Promise<FormRow> {
  for (let i = 0; i < 3; i++) {
    const have = await store.live(projectId, t.code);
    if (have) return have;
    const made = await store.insert({ project_id: projectId, template_code: t.code, issue: 'Issue 1', created_by: by.id });
    if (made !== 'exists') return made;
  }
  throw new Error('Could not open the form.');
}

export type Saved = { ok: true; row: FormRow; changed: string[]; unknown: string[]; problems: string[] } | { ok: false; why: string };

/** Save answers entered here (or from anywhere that has a name). A signed form is locked: revise it. */
export async function saveAnswers(store: FormStore, t: DocTemplate, projectId: string, patch: Record<string, unknown>, by: Who, source: Source, now: string): Promise<Saved> {
  const row = await openForm(store, t, projectId, by);
  if (row.status !== 'draft') return { ok: false, why: 'This form is signed. Revise it to change an answer.' };
  let result = { changed: [] as string[], unknown: [] as string[], problems: [] as string[] };
  const out = await change(
    store,
    row,
    (cur) => {
      if (cur.status !== 'draft') return null;
      const r = applyAnswers(t, state(cur), patch, { name: by.name }, source, now);
      result = { changed: r.changed, unknown: r.unknown, problems: r.problems };
      return r.changed.length ? { answers: r.state.answers, provenance: r.state.provenance } : null;
    },
    by.id
  );
  return { ok: true, row: out, ...result };
}

export type Signed = { ok: true; row: FormRow } | { ok: false; why: string };

/**
 * Sign a line. The first line (the person who did the work) can only sign when nothing is left to answer, and
 * signing it makes the form the record: answers are locked. The other lines (the customer) can sign afterwards,
 * and sign once. `image` is a drawn signature (a PNG data URL).
 */
export async function signLine(store: FormStore, t: DocTemplate, projectId: string, line: string, signer: { name: string; image?: string }, by: Who, source: SignedLine['source'], now: string): Promise<Signed> {
  const lines = signerKeys(t);
  const idx = lines.findIndex((l) => l.key === line);
  if (idx < 0) return { ok: false, why: 'This form has no such signature line.' };
  if (!signer.name.trim()) return { ok: false, why: 'The name is needed to sign.' };
  if (signer.image !== undefined && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signer.image)) return { ok: false, why: 'The signature must be a PNG image.' };
  const row = await openForm(store, t, projectId, by);
  let why = '';
  const out = await change(
    store,
    row,
    (cur) => {
      if (cur.signed[line]) {
        why = 'That line is already signed.';
        return null;
      }
      const mark: SignedLine = { name: signer.name.trim(), at: now, source, ...(signer.image ? { image: signer.image } : {}) };
      if (idx === 0) {
        if (cur.status !== 'draft') {
          why = 'This form is already signed.';
          return null;
        }
        const left = outstanding(t, cur.answers).length;
        if (left) {
          why = `${left} question${left === 1 ? ' is' : 's are'} still to answer before it can be signed.`;
          return null;
        }
        return { signed: { ...cur.signed, [line]: mark }, status: 'signed' };
      }
      if (cur.status !== 'signed') {
        why = 'The first signature has to be given before this one.';
        return null;
      }
      return { signed: { ...cur.signed, [line]: mark } };
    },
    by.id
  );
  return why ? { ok: false, why } : { ok: true, row: out };
}

/** Revise a signed form: it becomes a draft again as the next revision, from its answers. */
export async function reviseForm(store: FormStore, t: DocTemplate, projectId: string, by: Who): Promise<Signed> {
  const row = await store.live(projectId, t.code);
  if (!row) return { ok: false, why: 'There is no form to revise.' };
  if (row.status !== 'signed') return { ok: false, why: 'Only a signed form is revised.' };
  const id = await store.revise(row.id, by.id);
  const next = await store.get(id);
  return next ? { ok: true, row: next } : { ok: false, why: 'The revision could not be read back.' };
}

export type Received = { ok: true; row: FormRow; changed: string[]; conflicts: { key: string; hap: string | number | null; simpliheat: string | number }[]; dropped: string[]; skipped: string[]; locked: boolean };

/**
 * What SimpliHeat holds, taken in. While the form is still being filled in: a question it has answered that has
 * no answer here is filled; one that holds SimpliHeat's own earlier answer is updated; one entered here is
 * never replaced: SimpliHeat's different answer is kept beside it (`other`) and reported as a conflict. Once
 * SimpliHeat's technician has signed, what was signed is the record: its answers replace ours exactly (any
 * answer only entered here, which nobody signed for, is dropped and listed) and the form is signed. A form
 * already signed here is locked: only a customer signature can be added to it.
 */
export async function receiveSimpliHeat(store: FormStore, t: DocTemplate, projectId: string, rec: SimpliHeatRecord & { savedAt?: string }, now: string): Promise<Received> {
  const at = rec.savedAt ?? now;
  const sh = fromSimpliHeat(t, rec, at);
  const first = signerKeys(t)[0]?.key;
  const row = await openForm(store, t, projectId, { id: null, name: 'SimpliHeat' });
  const result = { changed: [] as string[], conflicts: [] as Received['conflicts'], dropped: [] as string[], skipped: sh.skipped, locked: false };

  const out = await change(
    store,
    row,
    (cur) => {
      result.changed = [];
      result.conflicts = [];
      result.dropped = [];
      result.locked = cur.status !== 'draft';
      // Already the record: nothing but a signature that is not there yet can be added.
      if (cur.status !== 'draft') {
        const add = Object.fromEntries(Object.entries(sh.state.signed).filter(([k]) => k !== first && !cur.signed[k]));
        return Object.keys(add).length ? { signed: { ...cur.signed, ...add } } : null;
      }
      // Signed in SimpliHeat: that is the record.
      if (first && sh.state.signed[first]) {
        result.dropped = Object.keys(cur.answers).filter((k) => !(k in sh.state.answers));
        result.changed = Object.keys(sh.state.answers).filter((k) => cur.answers[k] !== sh.state.answers[k]);
        return { answers: sh.state.answers, provenance: sh.state.provenance, signed: sh.state.signed, status: 'signed' };
      }
      // Still being filled in.
      const answers = { ...cur.answers };
      const provenance: Record<string, Provenance> = { ...cur.provenance };
      for (const [k, v] of Object.entries(sh.state.answers)) {
        const held = answers[k] ?? null;
        const mine = provenance[k];
        if (held === null) {
          answers[k] = v;
          provenance[k] = sh.state.provenance[k];
          result.changed.push(k);
        } else if (held === v) {
          // SimpliHeat now agrees with the answer held here: the difference is settled.
          if (mine?.other) {
            provenance[k] = { by: mine.by, at: mine.at, source: mine.source };
            result.changed.push(k);
          }
        } else if (mine?.source === 'simpliheat' || !mine) {
          answers[k] = v;
          provenance[k] = sh.state.provenance[k];
          result.changed.push(k);
        } else {
          const same = mine.other?.value === v;
          if (!same) {
            provenance[k] = { ...mine, other: { value: v as string | number, source: 'simpliheat', at } };
            result.changed.push(k);
          }
          result.conflicts.push({ key: k, hap: held as string | number, simpliheat: v as string | number });
        }
      }
      return result.changed.length ? { answers, provenance } : null;
    },
    null
  );
  return { ok: true, row: out, ...result };
}

/**
 * What HAP has for SimpliHeat to show as suggestions: the answers entered here, in SimpliHeat's own types, with who
 * entered them and when, and any it holds that differ from its own. Never the answers SimpliHeat itself gave.
 */
export function feedForSimpliHeat(t: DocTemplate, row: FormRow) {
  const mine: Answers = Object.fromEntries(Object.entries(row.answers).filter(([k]) => row.provenance[k]?.source === 'hap'));
  return {
    template: t.code,
    revision: row.revision,
    status: row.status,
    suggestions: toSimpliHeat(t, mine),
    entered: Object.fromEntries(Object.entries(row.provenance).filter(([, p]) => p.source === 'hap').map(([k, p]) => [k, { by: p.by, at: p.at }])),
    updatedAt: row.updated_at,
  };
}


/**
 * What the screen shows for a form: where it is, how much is done, which sections and questions are asked and
 * which are still to answer, and who has signed (without the drawn signature, which is large: `image` says there is one).
 * `row` null is a form not started.
 */
export function formView(t: DocTemplate, row: FormRow | null) {
  const answers = row?.answers ?? {};
  // Filling in: the questions that are asked for the answers so far (a form not started has none, so only the unconditional ones).
  const vis = visibility(t, answers);
  return {
    code: t.code,
    title: t.title,
    purpose: t.purpose ?? null,
    status: (row?.status ?? 'none') as FormStatus | 'none',
    revision: row?.revision ?? 0,
    issue: row?.issue ?? 'Issue 1',
    answers,
    provenance: row?.provenance ?? {},
    signed: Object.fromEntries(Object.entries(row?.signed ?? {}).map(([k, v]) => [k, { name: v.name, at: v.at, source: v.source, image: !!v.image }])),
    progress: progress(t, answers),
    outstanding: outstanding(t, answers).map((f) => f.key),
    visible: { sections: vis.sections, fields: [...vis.fields] },
    updatedAt: row?.updated_at ?? null,
  };
}
