import type { DocKind, QmsComment, QmsDoc } from './types';

/**
 * The QMS checker: what can be checked about a controlled document without a person. Pure (no database),
 * so the register, the document sheet, the approval action and the tests all use the same answers.
 *
 *   fail  – must be fixed before the document can be approved
 *   warn  – worth a look; does not block approval
 *   pass  – fine
 *
 * A person still has to tick the by-hand checklist (types.ts › APPROVAL_CHECKLIST) to approve: the checker
 * cannot tell whether a procedure matches how the work is really done.
 */
export type CheckStatus = 'pass' | 'warn' | 'fail';
export type Check = { id: string; label: string; status: CheckStatus; detail: string };

export const REF_PATTERN: Record<DocKind, RegExp> = {
  internal: /^[AD]\d{2}[A-Z]?$/,
  procedure: /^P\d{2}[A-Z]?$/,
  form: /^F\d{2}[A-Z0-9]*$/,
  external: /^(EX|L)\d{2,3}[A-Z]?\d?(-\d+)?$/,
};

const KIND_WORD: Record<DocKind, string> = { internal: 'an internal document', procedure: 'a procedure', form: 'a form', external: 'an external document' };

/** Which register a ref belongs in, from its letters. */
export function kindOfRef(ref: string): DocKind | null {
  const r = ref.trim().toUpperCase();
  if (/^[AD]\d/.test(r)) return 'internal';
  if (/^P\d/.test(r)) return 'procedure';
  if (/^F\d/.test(r)) return 'form';
  if (/^(EX|L)\d/.test(r)) return 'external';
  return null;
}

/** The section a form belongs in from its number: F01–F19 general, F20–F29 heat pump, F40–F69 solar PV, F70 up battery. */
export function formSectionOfRef(ref: string): string | null {
  const n = Number(/^F(\d{2})/i.exec(ref.trim())?.[1]);
  if (!Number.isFinite(n)) return null;
  if (n < 20) return 'general';
  if (n < 30) return 'heat_pump';
  if (n >= 40 && n < 70) return 'solar_pv';
  if (n >= 70) return 'battery';
  return null;
}

const SECTION_LABEL: Record<string, string> = { general: 'General', heat_pump: 'Heat pump', solar_pv: 'Solar PV', battery: 'Battery' };

const REF_MENTION = /\b(P\d{2}[A-Z]?|F\d{2}[A-Z0-9]{0,3}|EX\d{2,3}[A-Z]?\d?|D\d{2}|A\d{2})\b/g;
const PLACEHOLDER = /\b(TODO|TBC|TBD|lorem ipsum)\b|\[(insert|add|name|date|to confirm)[^\]]*\]|XXX/i;

/** Headings a procedure is expected to have (any heading line containing the word counts). */
export const PROCEDURE_HEADINGS: { key: string; label: string; test: RegExp }[] = [
  { key: 'purpose', label: 'Purpose', test: /purpose/i },
  { key: 'scope', label: 'Scope', test: /scope/i },
  { key: 'responsibilities', label: 'Responsibilities', test: /responsib/i },
  { key: 'procedure', label: 'Procedure', test: /procedure|process|method|steps/i },
  { key: 'records', label: 'Records', test: /record|forms?\b/i },
];

const headings = (md: string) => md.split('\n').filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.replace(/^#+\s*/, ''));

const isoDay = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== '0000-00-00' ? s : null);

export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "3" → "4", "1.7" → "1.8", "2025-A" → "2025-A.1". */
export function bumpRevision(rev: string): string {
  const r = rev.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(r);
  if (!m) return r ? `${r}.1` : '1';
  return m[2] === undefined ? String(Number(m[1]) + 1) : `${m[1]}.${Number(m[2]) + 1}`;
}

export type CheckContext = {
  /** Every document in the register (to find duplicates and unknown references). */
  docs: Pick<QmsDoc, 'id' | 'kind' | 'ref' | 'status'>[];
  /** This document's comments. */
  comments: Pick<QmsComment, 'status'>[];
  /** Today, as YYYY-MM-DD in the UK. */
  today: string;
};

export function runChecks(doc: QmsDoc, ctx: CheckContext): Check[] {
  const out: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => out.push({ id, label, status, detail });
  const ref = doc.ref.trim().toUpperCase();
  const live = ctx.docs.filter((d) => d.status !== 'archived');

  // Reference
  if (!REF_PATTERN[doc.kind].test(ref)) add('ref_format', 'Reference', 'fail', `“${doc.ref}” is not a valid reference for ${KIND_WORD[doc.kind]}.`);
  else add('ref_format', 'Reference', 'pass', `${ref} is a valid reference.`);

  // Filed in the right place
  const should = kindOfRef(ref);
  if (should && should !== doc.kind) add('right_place', 'Filed in the right place', 'fail', `${ref} reads as ${KIND_WORD[should]} but it is filed as ${KIND_WORD[doc.kind]}. Move it.`);
  else if (doc.kind === 'form') {
    const want = formSectionOfRef(ref);
    if (!doc.section) add('right_place', 'Filed in the right place', 'fail', 'It has no section (General, Heat pump, Solar PV or Battery).');
    else if (want && want !== doc.section) add('right_place', 'Filed in the right place', 'warn', `By its number it belongs under ${SECTION_LABEL[want]}, but it is under ${SECTION_LABEL[doc.section] ?? doc.section}.`);
    else add('right_place', 'Filed in the right place', 'pass', 'Right register and section.');
  } else if (doc.kind === 'external' && !doc.section) add('right_place', 'Filed in the right place', 'warn', 'No section (Standards, Guidance, Regulations or Websites).');
  else add('right_place', 'Filed in the right place', 'pass', 'Right register.');

  // One live document per reference
  const dupes = live.filter((d) => d.id !== doc.id && d.kind === doc.kind && d.ref.trim().toUpperCase() === ref);
  if (doc.status !== 'archived' && dupes.length) add('unique_ref', 'Reference used once', 'fail', `${dupes.length} other live ${doc.kind === 'internal' ? 'document' : doc.kind} uses ${ref}.`);
  else add('unique_ref', 'Reference used once', 'pass', 'No other live document uses it.');

  // Title
  const title = doc.title.trim();
  if (title.length < 4 || /^(untitled|new document|tbc)$/i.test(title)) add('title', 'Title', 'fail', 'It needs a proper title.');
  else add('title', 'Title', 'pass', 'Has a title.');

  // Revision and date
  if (!doc.revision.trim()) add('revision', 'Revision', 'fail', 'No revision number.');
  else add('revision', 'Revision', 'pass', `Revision ${doc.revision}.`);
  const date = isoDay(doc.revision_date);
  if (!date) add('revision_date', 'Revision date', doc.kind === 'external' ? 'warn' : 'fail', doc.kind === 'external' ? 'No issue date for this edition: note it from the issuer’s copy.' : 'No revision date.');
  else if (date > ctx.today) add('revision_date', 'Revision date', 'fail', `${date} is in the future.`);
  else add('revision_date', 'Revision date', 'pass', `Dated ${date}.`);

  // Has something in it
  const body = (doc.body_md ?? '').trim();
  const hasFile = !!doc.file_path;
  const hasUrl = !!(doc.source_url ?? '').trim();
  if (doc.kind === 'external') {
    if (!hasFile && !hasUrl) add('content', 'Where to find it', 'fail', 'Add the link to the issuer’s copy or upload one.');
    else if (hasUrl && !/^https?:\/\//i.test(doc.source_url!.trim())) add('content', 'Where to find it', 'fail', 'The link must start with https://.');
    else add('content', 'Where to find it', 'pass', hasFile ? 'A copy is uploaded.' : 'Links to the issuer.');
  } else if (body.length < 40 && !hasFile) add('content', 'Content', 'fail', 'It is empty: write it, upload it, or use Draft with Claude.');
  else add('content', 'Content', 'pass', hasFile && !body ? 'A file is uploaded.' : 'Has content.');

  // Placeholder text left in
  if (body && PLACEHOLDER.test(body)) add('placeholders', 'No placeholders', 'fail', 'Still has TODO / TBC / [insert…] text.');
  else if (body) add('placeholders', 'No placeholders', 'pass', 'No placeholder text.');

  // A procedure's shape
  if (doc.kind === 'procedure' && body) {
    const hs = headings(body);
    const missing = PROCEDURE_HEADINGS.filter((h) => !hs.some((t) => h.test.test(t)));
    if (missing.length) add('structure', 'Procedure layout', 'warn', `No heading for: ${missing.map((m) => m.label).join(', ')}.`);
    else add('structure', 'Procedure layout', 'pass', 'Has purpose, scope, responsibilities, procedure and records.');
  }

  // References to other documents must exist
  if (body) {
    const known = new Set(live.map((d) => d.ref.trim().toUpperCase().replace(/-\d+$/, '')));
    const mentioned = [...new Set((body.toUpperCase().match(REF_MENTION) ?? []).filter((r) => r !== ref && r !== ref.replace(/-\d+$/, '')))];
    const unknown = mentioned.filter((r) => !known.has(r));
    if (unknown.length) add('cross_refs', 'Documents it mentions', 'warn', `Not in the register: ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? '…' : ''}.`);
    else if (mentioned.length) add('cross_refs', 'Documents it mentions', 'pass', `All ${mentioned.length} documents it mentions are in the register.`);
  }

  // Owner
  if (doc.kind !== 'external') {
    if (!(doc.owner ?? '').trim()) add('owner', 'Owner', 'warn', 'Nobody is named as looking after it.');
    else add('owner', 'Owner', 'pass', `Looked after by ${doc.owner}.`);
  }

  // Review date
  const due = isoDay(doc.next_review_on);
  if (due && due < ctx.today) add('review_due', 'Review date', 'fail', `The review was due ${due} (${daysBetween(due, ctx.today)} days ago).`);
  else if (due && daysBetween(ctx.today, due) <= 30) add('review_due', 'Review date', 'warn', `A review is due on ${due}.`);
  else if (!due && doc.status === 'approved') add('review_due', 'Review date', 'warn', 'No next review date set.');
  else if (due) add('review_due', 'Review date', 'pass', `Next review ${due}.`);

  // Comments
  const open = ctx.comments.filter((c) => c.status === 'open').length;
  const addressed = ctx.comments.filter((c) => c.status === 'addressed').length;
  if (open) add('comments', 'Comments', 'fail', `${open} open comment${open === 1 ? '' : 's'} to deal with.`);
  else if (addressed) add('comments', 'Comments', 'warn', `${addressed} answered comment${addressed === 1 ? '' : 's'} waiting for you to check and resolve.`);
  else add('comments', 'Comments', 'pass', 'No open comments.');

  // Approved, then edited
  if (doc.status === 'approved' && doc.approved_revision !== doc.revision) add('approved_current', 'Approval is current', 'fail', `Approved at revision ${doc.approved_revision ?? '?'} but it is now revision ${doc.revision}.`);

  return out;
}

export const failCount = (cs: Check[]) => cs.filter((c) => c.status === 'fail').length;
export const warnCount = (cs: Check[]) => cs.filter((c) => c.status === 'warn').length;
/** Approval is blocked while any check fails. */
export const canApprove = (cs: Check[]) => failCount(cs) === 0;
