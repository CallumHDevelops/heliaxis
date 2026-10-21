import 'server-only';
import { ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, DOCS_BUCKET } from '@/lib/crm/server';
import { docFileName, longDate, newDocument, stampWords, type Kit, type PhotoItem, type SignatureItem, type Variant } from '@/lib/documents/pdf-kit';
import { inputsHash, saveGenerated, type Reprint, type SaveResult, type StoredRef } from '@/lib/documents/store';
import { serverCtx } from './form-ctx';
import { schemaFor } from './forms';
import type { Field, FormCtx, SiteForm } from './forms/types';
import { dayWords } from './messages';
import { isPutRightSlot, returnView, REVIEW_STATE_LABEL, reviewState, liveReturnFor, type ReviewStatus } from './review-shared';
import { perStringValues, slotsOf, stepShown, stringsOf, visibleFields } from './rules';
import { readAssignment, type ContactRow, type Db } from './server';
import { SEVERITY_LABEL, type Flag, type Stage } from './types';

/**
 * The trades' own reports (internal: never visible to the customer): the roofer report (answers by
 * step, flags, the declaration and signature, every photo with its slot) and the scaffold report
 * (putting it up, then taking it down once signed, each side's photos up and down together), each
 * with the office's review: every return to site, its put right (the declaration and signature as
 * signed) and the green light. Made with the PDF kit and stored as generated documents RF_REPORT /
 * SC_REPORT, a new version only when something in them changed.
 */

type Signoff = { id: string; stage: Stage; signed_name: string; signed_at: string; signature_path: string; declaration: string; review_status?: ReviewStatus | null; reviewed_at?: string | null; reviewed_by?: string | null };
type Photo = { id: string; slot: string | null; storage_path: string; taken_at: string | null; created_at: string };

const SIDE: Record<string, string> = { front: 'Front', rear: 'Rear', left: 'Left side', right: 'Right side' };
const WORD: Record<string, string> = { yes: 'Yes', no: 'No', na: 'N/A', pass: 'Pass', fail: 'Fail', done: 'Done', problem: 'Problem' };

/** An answer as words for a document. */
export function answerWords(f: Field, v: unknown, c: FormCtx): string | null {
  if (f.type === 'CUSTOM') return f.words?.(c) ?? null;
  if (v === undefined || v === null || v === '') return null;
  // One answer per PV string (the electrician's F43): "String 1: 395.2 V · String 2: …".
  if (f.perString) {
    const list = perStringValues(f, c);
    const one = { ...f, perString: false };
    return list.some((x) => x !== null && x !== '') ? list.map((x, i) => `String ${i + 1}: ${answerWords(one, x, c) ?? '–'}`).join(' · ') : null;
  }
  if (v === 'na') return 'N/A';
  if (v === 'off') return null;
  switch (f.type) {
    case 'CONFIRM':
      return v === true ? 'Confirmed' : v === 'cant' ? 'Couldn’t confirm' : null;
    case 'NUM':
      return `${v}${f.unit ? ` ${f.unit}` : ''}`;
    case 'PER_STRING': {
      const list = Array.isArray(v) ? v.slice(0, stringsOf(f, c)) : [];
      return list.length ? list.map((x, i) => `String ${i + 1}: ${x ?? '–'}${f.unit ? ` ${f.unit}` : ''}`).join(' · ') : null;
    }
    case 'SCAN': {
      const list = (Array.isArray(v) ? v : []) as { s: string; unread?: boolean }[];
      const read = list.filter((x) => !x.unread).map((x) => x.s);
      const unread = list.length - read.length;
      return [read.join(', '), unread ? `${unread} couldn’t be read (photo kept)` : ''].filter(Boolean).join('; ') || null;
    }
    case 'SEL':
      return f.options?.find((o) => o.key === v)?.label ?? String(v);
    case 'MULTI':
      return Array.isArray(v) ? v.map((k) => f.options?.find((o) => o.key === k)?.label ?? String(k)).join(', ') : null;
    default:
      return typeof v === 'string' ? (WORD[v] ?? v) : String(v);
  }
}

async function download(db: Db, bucket: string, path: string): Promise<Uint8Array | null> {
  const { data } = await db.storage.from(bucket).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

const mimeOf = (path: string) => (/\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg');

/** One form's answers, step by step, as rows (photo questions say how many; the photos follow later). */
/** The answers by step. `titled`: the form has its own heading already, so a one-step form doesn't repeat it. */
function answerSections(kit: Kit, form: SiteForm, c: FormCtx, titled = false) {
  for (const step of form.steps.filter((s) => stepShown(s, c))) {
    const fields = visibleFields(step, c).filter((f) => f.type !== 'SIG');
    if (!fields.length) continue;
    if (!(titled && form.steps.length === 1)) kit.section(step.title);
    kit.rows(
      fields.map((f) => {
        if (f.type === 'PHOTOS') {
          const n = slotsOf(f, c).reduce((a, s) => a + (c.photos[s] ?? 0), 0);
          return { label: f.label, value: n ? `${n} photo${n === 1 ? '' : 's'} (below)` : 'None', must: false };
        }
        return { label: f.label, value: answerWords(f, c.values[f.key], c), must: false };
      })
    );
  }
}

function flagSection(kit: Kit, flags: Flag[]) {
  if (!flags.length) return;
  kit.section('Flagged', { intro: 'What the answers raised for the office, and how each was dealt with.' });
  kit.rows(flags.map((f) => ({ label: f.text, value: `${SEVERITY_LABEL[f.severity]}${f.resolved_at ? `: resolved${f.note ? ` (${f.note})` : ''}` : ''}` })));
}

async function photoItems(db: Db, list: Photo[], caption: (p: Photo) => string): Promise<PhotoItem[]> {
  const out: PhotoItem[] = [];
  for (const p of list) {
    const bytes = await download(db, CRM_BUCKET, p.storage_path);
    if (bytes) out.push({ bytes, mime: mimeOf(p.storage_path), caption: caption(p), sub: p.taken_at ? `Taken ${stampWords(p.taken_at)}` : null });
  }
  return out;
}

/** Where a photo slot's field is, for its caption ("Before you start", "Front: up", "Put right 1: photos of the fix"). */
export function labelOf(forms: SiteForm[], slot: string): string {
  if (isPutRightSlot(slot)) return `Put right ${slot.slice(3)}: photos of the fix`;
  const [key, side] = slot.split(':');
  for (const form of forms) for (const s of form.steps) for (const f of s.fields) if (f.key === key) return `${f.label}${side ? ` (${SIDE[side] ?? side})` : ''}`;
  return slot;
}

export type ReportInputs = { a: string; answers: unknown; flags: Flag[]; photos: string[]; signoffs: string[]; review?: unknown };

/** Build and store the trade report for an assignment (roofer or scaffolder, the digital copy); null for trades without one. */
export async function saveTradeReport(db: Db, assignmentId: string): Promise<SaveResult | null> {
  const r = await tradeReport(db, assignmentId);
  if (!r) return null;
  return saveGenerated(db, r.projectId, { key: r.key, name: r.name, bytes: r.bytes, inputs: r.inputs, category: 'commissioning', visible: false });
}

/**
 * The print version of a stored trade report (RF_REPORT, SC_REPORT): made again for the job's roofer
 * or scaffolder whose report it is (what it's made from hashes to the stored copy's), dated as that was.
 */
export async function tradeReportPrint(db: Db, ref: StoredRef): Promise<Reprint> {
  const trade = ref.key === 'RF_REPORT' ? 'roofer' : ref.key === 'SC_REPORT' ? 'scaffolder' : null;
  if (!trade) return null;
  const { data } = await db.from('site_assignments').select('id').eq('project_id', ref.projectId).eq('trade', trade);
  let changed = false;
  for (const row of (data ?? []) as { id: string }[]) {
    const r = await tradeReport(db, row.id, { variant: 'print', asOf: new Date(ref.madeAt) });
    if (!r) continue;
    if (inputsHash(r.inputs) === ref.hash) return r.bytes;
    changed = true;
  }
  return changed ? 'changed' : null;
}

/**
 * The trade report for an assignment as it stands, as a PDF (roofer or scaffolder; null for trades
 * without one), and what saveTradeReport stores it under. `variant`: 'digital' (the default, the
 * stored copy) or 'print' (the ink saver, on request); `asOf`: the day a report not signed yet is
 * dated (today unless said).
 */
export async function tradeReport(
  db: Db,
  assignmentId: string,
  opts: { variant?: Variant; asOf?: Date } = {}
): Promise<{ bytes: Uint8Array; projectId: string; key: string; name: string; inputs: ReportInputs } | null> {
  const a = await readAssignment(db, assignmentId);
  if (!a || (a.trade !== 'roofer' && a.trade !== 'scaffolder')) return null;
  const forms = schemaFor(a);
  const [{ data: p }, { data: contact }, { data: so }, { data: ph }, { data: rt }] = await Promise.all([
    db.from('crm_projects').select('*').eq('id', a.project_id).maybeSingle(),
    db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle(),
    db.from('site_signoffs').select('*').eq('assignment_id', a.id).order('signed_at'),
    db.from('crm_photos').select('id, slot, storage_path, taken_at, created_at').eq('assignment_id', a.id).order('created_at'),
    db.from('site_returns').select('*').eq('assignment_id', a.id).order('n'),
  ]);
  const returnRows = ((rt ?? []) as Record<string, unknown>[]).filter((r) => r.status !== 'withdrawn');
  const project = (p ?? {}) as Record<string, unknown>;
  const person = contact as ContactRow | null;
  const signoffs = (so ?? []) as Signoff[];
  const photos = (ph ?? []) as Photo[];
  const { data: cust } = await db.from('enquiries').select('name').eq('id', String(project.enquiry_id ?? '')).maybeSingle();
  const c = await serverCtx(db, a);
  const jobRef = (project.project_ref as string | null) ?? null;
  const roofer = a.trade === 'roofer';
  const title = roofer ? 'Roofer report' : 'Scaffold report';
  const signed = (s: Stage) => signoffs.find((x) => x.stage === s);
  const issued = ukDay(signoffs.at(-1)?.signed_at ?? opts.asOf ?? new Date());

  const kit = await newDocument({ code: roofer ? 'RF_REPORT' : 'SC_REPORT', label: title, title, jobRef, issued, draft: !signoffs.length, variant: opts.variant });
  kit.header({ meta: [['Job', jobRef ?? '–'], ['Date', longDate(issued)]] });
  kit.idGrid([
    ['Site address', c.address],
    ['Customer', (cust as { name?: string } | null)?.name ?? null],
    [roofer ? 'Roofer' : 'Scaffolder', [person?.name, person?.company].filter(Boolean).join(' · ')],
    ['Mobile', person?.mobile ?? null],
  ]);

  const flags = a.flags;
  for (const form of forms) {
    const so1 = signed(form.stage);
    if (form.after && !so1 && !signed(form.after)) continue;
    if (forms.length > 1) kit.section(form.title === 'Scaffold up' ? 'Putting it up' : form.title === 'Scaffold down' ? 'Taking it down' : form.title, { intro: so1 ? `Signed off ${stampWords(so1.signed_at)}` : 'Not signed off yet' });
    answerSections(kit, form, c, forms.length > 1);
  }
  flagSection(kit, flags);

  // Photos: by slot; for the scaffold, each side's photos up and down side by side.
  const bySlot = new Map<string, Photo[]>();
  for (const x of photos) if (x.slot) bySlot.set(x.slot, [...(bySlot.get(x.slot) ?? []), x]);
  if (photos.length) {
    kit.section('Photos', { intro: `${photos.length} photo${photos.length === 1 ? '' : 's'}, each with the question it answers.`, keep: kit.photoKeep(Math.min(photos.length, 2)) });
    const paired = new Set<string>();
    if (!roofer) {
      const sides = [...new Set([...bySlot.keys()].filter((s) => /^(SCX1|SS2):/.test(s)).map((s) => s.split(':')[1]))];
      for (const side of sides) {
        const pair = [...(bySlot.get(`SCX1:${side}`) ?? []).slice(0, 1), ...(bySlot.get(`SS2:${side}`) ?? []).slice(0, 1)];
        pair.forEach((x) => paired.add(x.id));
        await kit.photos(await photoItems(db, pair, (x) => `${SIDE[side] ?? side}: ${x.slot?.startsWith('SS2') ? 'down' : 'up'}`), { perRow: 2 });
      }
    }
    await kit.photos(await photoItems(db, photos.filter((x) => !paired.has(x.id)), (x) => labelOf(forms, x.slot ?? '')));
  }

  // The declarations and signatures, as signed, and where the office's review is up to.
  const sigs: SignatureItem[] = [];
  const returns = returnRows.map(returnView);
  for (const form of forms) {
    const s = signed(form.stage);
    if (!s) continue;
    kit.section(`${form.title}: declaration`);
    kit.paragraph(s.declaration);
    const state = reviewState(s.review_status ?? 'waiting', liveReturnFor(returns, form.stage));
    kit.rows([{ label: 'Heliaxis review', value: `${REVIEW_STATE_LABEL[state]}${state === 'green' && s.reviewed_at ? `, ${stampWords(s.reviewed_at)}${s.reviewed_by ? ` (${s.reviewed_by})` : ''}` : ''}` }]);
    sigs.push({ title: form.sig.label, png: await download(db, DOCS_BUCKET, s.signature_path), name: s.signed_name, at: s.signed_at });
  }
  if (sigs.length) await kit.signatures(sigs);

  // Each return to site: the notice, the put right and how it was reviewed.
  for (const [i, r] of returns.entries()) {
    const row = returnRows[i];
    kit.section(`Return to site ${r.n}`, { intro: `Asked ${stampWords(r.created_at)}${r.created_by_name ? ` by ${r.created_by_name}` : ''}` });
    kit.rows([
      { label: 'What needs putting right', value: r.what },
      { label: 'Put right by', value: `${dayWords(r.fix_by)}${r.safety ? ' (affects safety or the home)' : ''}` },
      { label: 'Notice reached them', value: r.notice_sent_at ? stampWords(r.notice_sent_at) : 'Not recorded' },
      { label: 'Put right', value: r.fixed_at ? `${r.fixed_name ?? ''}, ${stampWords(r.fixed_at)}` : 'Not yet' },
      ...(r.fixed_note ? [{ label: 'What they did', value: r.fixed_note }] : []),
      { label: 'Review', value: r.status === 'green' ? `Green light${r.reviewed_at ? `, ${stampWords(r.reviewed_at)}` : ''}${r.reviewed_by ? ` (${r.reviewed_by})` : ''}` : r.status === 'again' ? 'Returned to site again' : r.status === 'fixed' ? 'Waiting for review' : 'With them' },
    ]);
    if (typeof row.fixed_declaration === 'string' && row.fixed_declaration) {
      kit.paragraph(row.fixed_declaration);
      await kit.signatures([{ title: `Put right ${r.n}`, png: row.fixed_signature_path ? await download(db, DOCS_BUCKET, String(row.fixed_signature_path)) : null, name: r.fixed_name ?? '', at: r.fixed_at }]);
    }
  }

  const bytes = await kit.save();
  const inputs: ReportInputs = {
    a: a.id,
    answers: a.answers,
    flags,
    photos: photos.map((x) => x.id),
    signoffs: signoffs.map((x) => x.id),
    review: { signoffs: signoffs.map((x) => [x.id, x.review_status ?? 'waiting', x.reviewed_at ?? null]), returns: returns.map((r) => [r.id, r.status, r.fixed_at, r.reviewed_at, r.notice_sent_at]) },
  };
  return { bytes, projectId: a.project_id, key: roofer ? 'RF_REPORT' : 'SC_REPORT', name: docFileName(jobRef, '', title), inputs };
}
