import 'server-only';
import { CRM_BUCKET, DOCS_BUCKET, thumbPath } from '@/lib/crm/server';
import { serverCtx } from './form-ctx';
import { schemaFor } from './forms';
import type { LabelReadResult } from './forms/types';
import { ELECTRICIAN_DOC_KEYS } from './electrician-docs';
import { livePo } from './labour-po';
import type { LabourSnapshot } from './po-shared';
import { answerWords, labelOf } from './reports';
import { fixByDefault, reviewOf as submissionsOf, type Submission } from './returns';
import type { ReturnView } from './review-shared';
import { openForms, slotsOf, stepShown, valueOf, visibleFields } from './rules';
import { logJob, logSiteEvent, readAssignment, type AssignmentRow, type Db } from './server';
import { SOURCE_LABEL, TRADE_LABEL, type Answer, type Flag, type Stage } from './types';

/**
 * The office's review of one trade (the Site tab's review drawer, screen D4): the answers by step with
 * where each came from and the flags beside them, the photos by slot, Claude's label reads to
 * confirm, the sign-off evidence, each submission's review (Green light or Return to site, and every
 * return with its notice and put right: returns.ts), the PO and documents, and the history. Plus what
 * the office does there: resolve a flag and confirm a read.
 */

export type ReviewRow = { key: string; label: string; value: string | null; src: string | null; at: string | null; flags: Flag[] };
export type ReviewStep = { form: string; stage: Stage; signed: boolean; step: string; rows: ReviewRow[] };
export type ReviewPhoto = { id: string; slot: string; label: string; taken_at: string | null; thumb: string | null; url: string | null; download: string | null };
export type ReviewRead = {
  id: string;
  photo_id: string;
  key: string;
  label: string;
  status: string;
  result: LabelReadResult | null;
  read_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  thumb: string | null;
};
export type ReviewSignoff = {
  id: string;
  stage: Stage;
  signed_name: string;
  signed_at: string;
  received_at: string;
  device_id: string | null;
  ip: string | null;
  user_agent: string | null;
  declaration: string;
  answers_hash: string;
  signature: string | null;
  steps_done: { po: boolean; docs: boolean; notified: boolean };
};
export type ReviewDoc = { id: string; name: string; key: string | null; version: number | null; url: string | null };
/** A return to site with its written notice as it went, the messages that carried it, and the put right's signature. */
export type ReviewReturn = ReturnView & {
  notice: { subject: string; paragraphs: string[] } | null;
  messages: { id: string; channel: string; kind: string; status: string; sent_at: string | null; error: string | null }[];
  fixed_declaration: string | null;
  fixed_signature: string | null;
};
export type ReviewEvent = { at: string; actor: string; type: string; detail: Record<string, unknown> | null };
export type SiteReview = {
  id: string;
  title: string;
  steps: ReviewStep[];
  flags: Flag[];
  photos: ReviewPhoto[];
  reads: ReviewRead[];
  signoffs: ReviewSignoff[];
  po: { id: string; po_number: string; status: string; sent_at: string | null; changed_since_sent: boolean; labour: LabourSnapshot | null } | null;
  /** Each signed submission's review, and every return to site (oldest first). */
  review: { submissions: Submission[]; returns: ReviewReturn[]; fix_by_default: string };
  documents: ReviewDoc[];
  events: ReviewEvent[];
};

const LINK_SECONDS = 3600;

async function signedMany(db: Db, bucket: string, paths: string[], download?: (p: string) => string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...new Set(paths)].map(async (p) => {
      const { data } = await db.storage.from(bucket).createSignedUrl(p, LINK_SECONDS, download ? { download: download(p) } : undefined);
      if (data?.signedUrl) out.set(p, data.signedUrl);
    })
  );
  return out;
}

export async function siteReview(db: Db, a: AssignmentRow): Promise<SiteReview> {
  const forms = schemaFor(a);
  const [ctx, { data: ph }, { data: rd }, { data: so }, { data: ev }, po, rv, { data: rt }, { data: msgs }, fixBy] = await Promise.all([
    serverCtx(db, a),
    db.from('crm_photos').select('id, slot, storage_path, taken_at, created_at').eq('assignment_id', a.id).order('created_at'),
    db.from('site_reads').select('*').eq('assignment_id', a.id),
    db.from('site_signoffs').select('*').eq('assignment_id', a.id).order('signed_at'),
    db.from('site_events').select('at, actor, type, detail').eq('assignment_id', a.id).order('at', { ascending: false }).limit(200),
    livePo(db, a.id),
    submissionsOf(db, a.id),
    db.from('site_returns').select('id, notice, fixed_declaration, fixed_signature_path').eq('assignment_id', a.id),
    db.from('site_messages').select('id, channel, kind, status, sent_at, error, dedupe_key').eq('assignment_id', a.id).in('kind', ['return_to_site']),
    fixByDefault(),
  ]);
  const signed = ((so ?? []) as { stage: Stage }[]).map((s) => s.stage);

  // Answers by step, as the trade saw them (only questions asked), with the source and the flags.
  const steps: ReviewStep[] = [];
  for (const form of openForms(forms, signed)) {
    for (const step of form.steps.filter((s) => stepShown(s, ctx))) {
      const rows: ReviewRow[] = [];
      for (const f of visibleFields(step, ctx)) {
        if (f.type === 'SIG') continue;
        const ans = a.answers[f.key] as Answer | undefined;
        const value =
          f.type === 'PHOTOS'
            ? (() => {
                const n = slotsOf(f, ctx).reduce((t, s) => t + (ctx.photos[s] ?? 0), 0);
                return n ? `${n} photo${n === 1 ? '' : 's'}` : null;
              })()
            : answerWords(f, valueOf(f, ctx), ctx);
        rows.push({ key: f.key, label: f.label, value, src: ans?.src ? (SOURCE_LABEL[ans.src] ?? ans.src) : null, at: ans?.at ?? null, flags: a.flags.filter((x) => x.key === f.key) });
      }
      if (rows.length) steps.push({ form: form.title, stage: form.stage, signed: signed.includes(form.stage), step: step.title, rows });
    }
  }

  // Photos, with short links (thumbnail, full size, and a download named after the slot).
  const photos = (ph ?? []) as { id: string; slot: string | null; storage_path: string; taken_at: string | null }[];
  const full = await signedMany(db, CRM_BUCKET, photos.map((p) => p.storage_path));
  const thumbs = await signedMany(db, CRM_BUCKET, photos.map((p) => thumbPath(p.storage_path)));
  const downloads = await signedMany(db, CRM_BUCKET, photos.map((p) => p.storage_path), (p) => p.split('/').pop() ?? 'photo.jpg');
  const reviewPhotos: ReviewPhoto[] = photos.map((p) => ({
    id: p.id,
    slot: p.slot ?? '',
    label: labelOf(forms, p.slot ?? ''),
    taken_at: p.taken_at,
    thumb: thumbs.get(thumbPath(p.storage_path)) ?? full.get(p.storage_path) ?? null,
    url: full.get(p.storage_path) ?? null,
    download: downloads.get(p.storage_path) ?? null,
  }));
  const photoById = new Map(reviewPhotos.map((p) => [p.id, p]));

  const reads: ReviewRead[] = ((rd ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    photo_id: String(r.photo_id),
    key: String(r.key),
    label: labelOf(forms, String(r.key)),
    status: String(r.status),
    result: (r.result as LabelReadResult | null) ?? null,
    read_at: (r.read_at as string | null) ?? null,
    confirmed_at: (r.confirmed_at as string | null) ?? null,
    confirmed_by: (r.confirmed_by as string | null) ?? null,
    thumb: photoById.get(String(r.photo_id))?.thumb ?? null,
  }));

  const signoffRows = (so ?? []) as Record<string, unknown>[];
  const sigs = await signedMany(db, DOCS_BUCKET, signoffRows.map((s) => String(s.signature_path)));
  const signoffs: ReviewSignoff[] = signoffRows.map((s) => ({
    id: String(s.id),
    stage: s.stage as Stage,
    signed_name: String(s.signed_name),
    signed_at: String(s.signed_at),
    received_at: String(s.received_at),
    device_id: (s.device_id as string | null) ?? null,
    ip: (s.ip as string | null) ?? null,
    user_agent: (s.user_agent as string | null) ?? null,
    declaration: String(s.declaration),
    answers_hash: String(s.answers_hash),
    signature: sigs.get(String(s.signature_path)) ?? null,
    steps_done: { po: !!s.po_done_at, docs: !!s.docs_done_at, notified: !!s.notified_at },
  }));

  // Each return to site: its notice as it went, the messages that carried it, the put right's signature.
  const extra = new Map(((rt ?? []) as { id: string; notice: ReviewReturn['notice']; fixed_declaration: string | null; fixed_signature_path: string | null }[]).map((r) => [r.id, r]));
  const putRightSigs = await signedMany(db, DOCS_BUCKET, [...extra.values()].map((r) => r.fixed_signature_path).filter((p): p is string => !!p));
  const returns: ReviewReturn[] = rv.returns.map((r) => {
    const x = extra.get(r.id);
    return {
      ...r,
      notice: x?.notice ?? null,
      messages: ((msgs ?? []) as { id: string; channel: string; kind: string; status: string; sent_at: string | null; error: string | null; dedupe_key: string }[])
        .filter((m) => m.dedupe_key.startsWith(`return:${r.id}:`))
        .map(({ id, channel, kind, status, sent_at, error }) => ({ id, channel, kind, status, sent_at, error })),
      fixed_declaration: x?.fixed_declaration ?? null,
      fixed_signature: x?.fixed_signature_path ? (putRightSigs.get(x.fixed_signature_path) ?? null) : null,
    };
  });

  // The trade's documents: their report (the electrician's paperwork), and the PO that went.
  const keys = [
    ...(a.trade === 'roofer' ? ['RF_REPORT'] : a.trade === 'scaffolder' ? ['SC_REPORT'] : a.trade === 'electrician' ? ELECTRICIAN_DOC_KEYS : []),
    po?.po_number ?? null,
  ].filter((k): k is string => !!k);
  const { data: dd } = keys.length
    ? await db.from('crm_documents').select('id, name, storage_path, generated_key, version').eq('project_id', a.project_id).in('generated_key', keys).is('archived_at', null)
    : { data: [] };
  const docRows = (dd ?? []) as { id: string; name: string; storage_path: string; generated_key: string | null; version: number | null }[];
  const docLinks = await signedMany(db, DOCS_BUCKET, docRows.map((d) => d.storage_path));
  const documents: ReviewDoc[] = docRows.map((d) => ({ id: d.id, name: d.name, key: d.generated_key, version: d.version, url: docLinks.get(d.storage_path) ?? null }));

  return {
    id: a.id,
    title: a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade],
    steps,
    flags: a.flags,
    photos: reviewPhotos,
    reads,
    signoffs,
    po: po ? { id: po.id, po_number: po.po_number, status: po.status, sent_at: po.sent_at, changed_since_sent: po.changed_since_sent, labour: po.labour } : null,
    review: { submissions: rv.submissions, returns, fix_by_default: fixBy },
    documents,
    events: ((ev ?? []) as ReviewEvent[]).map((e) => ({ at: e.at, actor: e.actor, type: e.type, detail: e.detail ?? null })),
  };
}

/**
 * Resolve a flag with a note. A flag that comes back (the answer changes again) is raised again by the
 * rules. (Review flags are listed in the review task, which closes with Green light or Return to site.)
 */
export async function resolveFlag(db: Db, a: AssignmentRow, code: string, note: string, by: { id: string; name: string }): Promise<{ ok: true; flags: Flag[] } | { ok: false; error: string }> {
  const i = a.flags.findIndex((f) => f.code === code && !f.resolved_at);
  if (i < 0) return { ok: false, error: 'That flag is resolved already, or it isn’t there any more.' };
  const now = new Date().toISOString();
  const flags = a.flags.map((f, j) => (j === i ? { ...f, resolved_at: now, resolved_by: by.name, note: note || null } : f));
  const { error } = await db.from('site_assignments').update({ flags, updated_at: now }).eq('id', a.id);
  if (error) return { ok: false, error: error.message };
  const f = flags[i];
  await logSiteEvent(db, a.id, by.name, 'flag_resolved', { code, note: note || null });
  await logJob(db, a.project_id, `${TRADE_LABEL[a.trade]}’s flag resolved: ${f.text}${note ? ` (${note})` : ''}`, { assignment: a.id, flag: code }, by.id);
  return { ok: true, flags };
}

/** A person has checked a label read against the photo (the reads stay suggestions until then). */
export async function confirmRead(db: Db, a: AssignmentRow, readId: string, by: { id: string; name: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await db.from('site_reads').select('id, key, status').eq('id', readId).eq('assignment_id', a.id).maybeSingle();
  if (!data) return { ok: false, error: 'That read isn’t there any more.' };
  if (data.status !== 'read') return { ok: false, error: 'Only a read that worked can be confirmed.' };
  const { error } = await db.from('site_reads').update({ confirmed_at: new Date().toISOString(), confirmed_by: by.id }).eq('id', readId);
  if (error) return { ok: false, error: /confirmed_/.test(error.message) ? 'Run the latest site-commissioning.sql first (it adds confirmed_at to site_reads).' : error.message };
  await logSiteEvent(db, a.id, by.name, 'read_confirmed', { read: readId, key: data.key });
  return { ok: true };
}

export const reviewOf = async (db: Db, id: string) => {
  const a = await readAssignment(db, id);
  return a ? siteReview(db, a) : null;
};
