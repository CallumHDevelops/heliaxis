import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { addWorkingDays, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { DOCS_BUCKET, ensureDocsBucket } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { canonicalJson } from '@/lib/subcontractors/hashing';
import { validSignature } from '@/lib/subcontractors/server';
import { addSourceTask, closeSourceTask } from '@/lib/surveys/server';
import { getSettings as getWaSettings } from '@/lib/whatsapp/settings';
import { putRightDeclaration } from './declaration';
import { siteAddress } from './form-ctx';
import { livePo } from './labour-po';
import { saveTradeReport } from './reports';
import { dayWords, greenEmail, greenParams, KIND_TEMPLATE, returnEmail, returnParams, sendAfterFor, siteShort, type EmailText } from './messages';
import {
  FIX_WORKING_DAYS,
  isLiveReturn,
  liveReturnFor,
  PO_REVIEW_LABEL,
  poReviewOf,
  putRightSlot,
  putRightTaskTitle,
  returnView,
  reviewState,
  reviewTaskTitle,
  type PoReview,
  type ReturnView,
  type ReviewState,
  type ReviewStatus,
} from './review-shared';
import { aboutOf, emailHtml, ensureLink, jobOf, queueMessage, whatsappProblem, type MessageRow } from './send';
import { logJob, logSiteEvent, type AssignmentRow, type ContactRow, type Db } from './server';
import type { SignoffRow } from './signoff-plugins';
import { siteLink } from './tokens';
import { TRADE_LABEL, type Flag, type Stage } from './types';

/**
 * The office's review after the PO (review-shared.ts has the states and the words): the review task
 * at sign-off, Green light, Return to site required (the written notice by email and WhatsApp, sent
 * at once), the trade's Put right from their phone, and the PO's review kept on the PO for its lists.
 * Every step goes on the assignment's history (site_events) and the job's activity.
 */

type Who = { id: string | null; name: string };
export type ReviewSignoff = { id: string; stage: Stage; signed_name: string; signed_at: string; review_status: ReviewStatus; reviewed_at: string | null; reviewed_by: string | null };
export type Submission = ReviewSignoff & { state: ReviewState; live: ReturnView | null };

const who = (a: AssignmentRow) => (a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade]);
const asStatus = (v: unknown): ReviewStatus => (v === 'green' || v === 'return' ? v : 'waiting');

/** The trade's signed submissions with where each is up to, and every return to site (newest last). */
export async function reviewOf(db: Db, assignmentId: string): Promise<{ submissions: Submission[]; returns: ReturnView[] }> {
  const [{ data: so }, { data: rt, error }] = await Promise.all([
    db.from('site_signoffs').select('*').eq('assignment_id', assignmentId).order('signed_at'),
    db.from('site_returns').select('*').eq('assignment_id', assignmentId).order('n'),
  ]);
  const returns = error ? [] : ((rt ?? []) as Record<string, unknown>[]).map(returnView);
  const submissions = ((so ?? []) as Record<string, unknown>[]).map((s): Submission => {
    const stage = s.stage as Stage;
    const live = liveReturnFor(returns, stage);
    const status = asStatus(s.review_status);
    return {
      id: String(s.id),
      stage,
      signed_name: String(s.signed_name),
      signed_at: String(s.signed_at),
      review_status: status,
      reviewed_at: (s.reviewed_at as string | null) ?? null,
      reviewed_by: (s.reviewed_by as string | null) ?? null,
      state: reviewState(status, live),
      live,
    };
  });
  return { submissions, returns };
}

/** The PO's review from the trade's submissions, kept on the PO (Orders tab, Finance → Purchase orders). */
export async function syncPoReview(db: Db, a: AssignmentRow): Promise<PoReview | null> {
  const po = await livePo(db, a.id);
  if (!po) return null;
  const { submissions } = await reviewOf(db, a.id);
  const review = poReviewOf(submissions.map((s) => s.state));
  await db.from('purchase_orders').update({ review_status: review }).eq('id', po.id);
  return review;
}

const nextWorkingDay = async () => addWorkingDays(ukDay(new Date()), 1, await ukBankHolidays());
/** The fix-by date the office starts from: 7 working days from today (clause 12.3). */
export const fixByDefault = async () => addWorkingDays(ukDay(new Date()), FIX_WORKING_DAYS, await ukBankHolidays());

const taskKey = (id: string) => `site-check:${id}`;

/**
 * The review task, made once at sign-off for the job owner and due the next working day, so the
 * review happens well inside the 7 working days the agreement gives to dispute an invoice (cl. 4.7).
 * Open Review flags are listed in it.
 */
export async function addReviewTask(db: Db, a: AssignmentRow, s: Pick<SignoffRow, 'id' | 'stage' | 'signed_name'>, job: { ref: string | null; owner_id: string | null }, flags: Flag[]) {
  const review = flags.filter((f) => f.severity === 'review' && !f.resolved_at);
  await addSourceTask(db, {
    projectId: a.project_id,
    key: taskKey(s.id),
    title: reviewTaskTitle(s.signed_name, a.trade, s.stage, job.ref),
    notes: [
      'Check their photos and answers on the job’s Site tab (Review), then tap Green light or Return to site required.',
      ...(review.length ? ['', `${review.length === 1 ? '1 flag' : `${review.length} flags`} for you to check:`, ...review.map((f) => `• ${f.text}`)] : []),
    ].join('\n'),
    assigneeId: job.owner_id,
    dueDate: await nextWorkingDay(),
  });
}

/** The trade and the words every review message needs. */
async function messageCtx(db: Db, a: AssignmentRow, origin?: string | null) {
  const [{ data: c }, job] = await Promise.all([db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle(), jobOf(db, a.project_id)]);
  const contact = c as ContactRow | null;
  const { token } = await ensureLink(db, a);
  return { contact, job, about: contact ? aboutOf(a, contact, job, siteLink(token, origin)) : null };
}

/** An email and a WhatsApp for one review step, each once (its dedupe key). Notes say why one couldn't go. */
async function sendBoth(
  db: Db,
  a: AssignmentRow,
  contact: ContactRow | null,
  m: { kind: 'return_to_site' | 'green_light'; key: string; email: EmailText; params: string[] },
  actor: string
): Promise<{ messages: MessageRow[]; notes: string[] }> {
  const out: { messages: MessageRow[]; notes: string[] } = { messages: [], notes: [] };
  if (!contact) return { messages: [], notes: ['They’re not on the job any more, so nothing was sent.'] };
  const after = sendAfterFor(m.kind, new Date(), await getWaSettings());
  if (contact.email) {
    const r = await queueMessage(db, { assignmentId: a.id, channel: 'email', kind: m.kind, dedupeKey: `${m.key}:email`, to: contact.email, params: { subject: m.email.subject, html: emailHtml(m.email) }, sendAfter: after }, actor);
    if (r) out.messages.push(r);
  } else out.notes.push('No email address, so no email went.');
  const problem = await whatsappProblem(contact, m.kind);
  if (problem) out.notes.push(contact.email ? problem : problem.replace(', so it went by email.', '.'));
  else {
    const r = await queueMessage(db, { assignmentId: a.id, channel: 'whatsapp', kind: m.kind, dedupeKey: `${m.key}:whatsapp`, to: contact.wa_id!, template: KIND_TEMPLATE[m.kind], params: m.params, sendAfter: after }, actor);
    if (r) out.messages.push(r);
  }
  return out;
}

/** The trade's report again (it carries the review's history); never stops the step that asked. */
const refreshReport = (db: Db, a: AssignmentRow) => (a.trade === 'roofer' || a.trade === 'scaffolder' ? saveTradeReport(db, a.id).catch((e) => console.error('[site/returns] report', e)) : Promise.resolve(null));

export type ReviewResult = { ok: true; messages: MessageRow[]; notes: string[] } | { ok: false; status: number; error: string };

async function submissionOf(db: Db, a: AssignmentRow, signoffId: string): Promise<Submission | null> {
  const { submissions } = await reviewOf(db, a.id);
  return submissions.find((s) => s.id === signoffId) ?? null;
}

/**
 * Green light: nothing needs putting right. The submission (and its put right, if one's waiting) is
 * reviewed, the review tasks close, the PO's hold lifts once nothing else holds it, and the trade is
 * told, short, by email and WhatsApp (through the evening rule: it isn't urgent).
 */
export async function greenLight(db: Db, a: AssignmentRow, signoffId: string, by: Who, origin?: string | null): Promise<ReviewResult> {
  const sub = await submissionOf(db, a, signoffId);
  if (!sub) return { ok: false, status: 404, error: 'That sign-off isn’t there any more (it may have been reopened).' };
  if (sub.state === 'green') return { ok: true, messages: [], notes: ['It has the green light already.'] };
  const now = new Date().toISOString();
  const { error } = await db.from('site_signoffs').update({ review_status: 'green', reviewed_at: now, reviewed_by: by.name }).eq('id', sub.id);
  if (error) return { ok: false, status: 500, error: error.message };
  if (sub.live) await db.from('site_returns').update({ status: 'green', reviewed_at: now, reviewed_by: by.name }).eq('id', sub.live.id).in('status', ['open', 'fixed']);
  await closeSourceTask(db, a.project_id, taskKey(sub.id));
  if (sub.live) await closeSourceTask(db, a.project_id, taskKey(sub.live.id));
  const review = await syncPoReview(db, a);
  const po = await livePo(db, a.id);
  await logSiteEvent(db, a.id, by.name, 'review_green', { signoff: sub.id, stage: sub.stage, return: sub.live?.n ?? null, po: po?.po_number ?? null });
  await logJob(
    db,
    a.project_id,
    `Green light for ${sub.signed_name}’s ${sub.stage === 'strike' ? 'scaffold-down' : who(a).toLowerCase()} ${sub.live ? 'put right' : 'work'}${po && review ? ` · ${po.po_number}: ${PO_REVIEW_LABEL[review]}` : ''}`,
    { assignment: a.id, signoff: sub.id, review: 'green' },
    by.id
  );
  const { contact, about } = await messageCtx(db, a, origin);
  const sent = about
    ? await sendBoth(db, a, contact, { kind: 'green_light', key: `green:${sub.id}:${sub.live?.n ?? 0}`, email: greenEmail({ ...about, putRight: !!sub.live }), params: greenParams(about) }, by.name)
    : { messages: [], notes: [] };
  await refreshReport(db, a);
  return { ok: true, ...sent };
}

export type ReturnInput = { what?: unknown; photo_ids?: unknown; fix_by?: unknown; safety?: unknown };

/**
 * Return to site required: what needs putting right, the photos of theirs it's about, the fix-by
 * date and whether it affects safety or the home. Sent at once as the written notice (clause 12.3):
 * by email (kept with the return as it went) and WhatsApp. The PO goes on hold; a put right that was
 * waiting for review is closed as "returned again".
 */
export async function returnToSite(db: Db, a: AssignmentRow, signoffId: string, b: ReturnInput, by: Who, origin?: string | null): Promise<ReviewResult & { ret?: ReturnView }> {
  const sub = await submissionOf(db, a, signoffId);
  if (!sub) return { ok: false, status: 404, error: 'That sign-off isn’t there any more (it may have been reopened).' };
  if (sub.state === 'open') return { ok: false, status: 409, error: 'A return to site is open already: wait for their put right, or give it the green light.' };
  const what = String(b.what ?? '').trim().slice(0, 2000);
  if (!what) return { ok: false, status: 400, error: 'Say what needs putting right.' };
  const fixBy = String(b.fix_by ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fixBy) || Number.isNaN(Date.parse(`${fixBy}T12:00:00Z`))) return { ok: false, status: 400, error: 'Choose the date to put it right by.' };
  if (fixBy < ukDay(new Date())) return { ok: false, status: 400, error: 'The fix-by date has passed. Choose today or later.' };
  // Only their own photos can be pointed to.
  const asked = Array.isArray(b.photo_ids) ? [...new Set((b.photo_ids as unknown[]).map(String))].slice(0, 30) : [];
  const { data: ph } = asked.length ? await db.from('crm_photos').select('id').eq('assignment_id', a.id).in('id', asked) : { data: [] };
  const photoIds = ((ph ?? []) as { id: string }[]).map((p) => p.id);
  const safety = b.safety === true;

  const { returns } = await reviewOf(db, a.id);
  const n = Math.max(0, ...returns.map((r) => r.n)) + 1;
  const now = new Date().toISOString();
  if (sub.live?.status === 'fixed') await db.from('site_returns').update({ status: 'again', reviewed_at: now, reviewed_by: by.name }).eq('id', sub.live.id).eq('status', 'fixed');
  const { contact, about } = await messageCtx(db, a, origin);
  const po = await livePo(db, a.id);
  const email = about ? returnEmail({ ...about, what, fixBy, safety, poNumber: po?.po_number ?? null }) : null;
  const id = randomUUID();
  const { data: ins, error } = await db
    .from('site_returns')
    .insert({
      id,
      assignment_id: a.id,
      signoff_id: sub.id,
      stage: sub.stage,
      n,
      what,
      photo_ids: photoIds,
      fix_by: fixBy,
      safety,
      status: 'open',
      notice: email ? { subject: email.subject, paragraphs: email.paragraphs, to_email: contact?.email ?? null, to_whatsapp: contact?.wa_id ?? null } : null,
      created_by: by.id,
      created_by_name: by.name,
    })
    .select('*')
    .single();
  if (error || !ins) return { ok: false, status: error?.code === '23505' ? 409 : 500, error: error?.code === '23505' ? 'Someone else sent a return to site a moment ago. Look again.' : (error?.message ?? 'Not saved. Try again.') };
  await db.from('site_signoffs').update({ review_status: 'return', reviewed_at: now, reviewed_by: by.name }).eq('id', sub.id);
  await closeSourceTask(db, a.project_id, taskKey(sub.id));
  if (sub.live) await closeSourceTask(db, a.project_id, taskKey(sub.live.id));
  const review = await syncPoReview(db, a);
  await logSiteEvent(db, a.id, by.name, 'review_return', { signoff: sub.id, stage: sub.stage, return: n, what, fix_by: fixBy, safety, photos: photoIds.length, po: po?.po_number ?? null });
  await logJob(
    db,
    a.project_id,
    `Return to site required: ${sub.signed_name} (${who(a).toLowerCase()}): ${what.replace(/\s+/g, ' ').slice(0, 200)}. Put right by ${dayWords(fixBy)}${safety ? ' (affects safety or the home)' : ''}${po && review === 'hold' ? ` · ${po.po_number} on hold` : ''}`,
    { assignment: a.id, signoff: sub.id, return: id, review: 'return' },
    by.id
  );
  const sent = about && email ? await sendBoth(db, a, contact, { kind: 'return_to_site', key: `return:${id}`, email, params: returnParams({ ...about, what, fixBy, safety, poNumber: po?.po_number ?? null }) }, by.name) : { messages: [], notes: [] };
  // Nothing went (none queued, or every one failed): they're to be told another way, and Send again is on the review.
  if (!sent.messages.some((m) => m.status !== 'failed')) sent.notes.push('Nothing could be sent, so call them and tell them: the agreement wants it in writing too. You can send it again from the review.');
  await refreshReport(db, a);
  return { ok: true, ...sent, ret: returnView(ins as Record<string, unknown>) };
}

/** Photo slots open for a put right (PR:<n> of each return still with the trade). */
export async function openPutRightSlots(db: Db, assignmentId: string): Promise<Set<string>> {
  const { data, error } = await db.from('site_returns').select('n').eq('assignment_id', assignmentId).eq('status', 'open');
  return new Set(error ? [] : ((data ?? []) as { n: number }[]).map((r) => putRightSlot(Number(r.n))));
}

export type PutRightInput = { op_id?: unknown; n?: unknown; note?: unknown; name?: unknown; signature?: unknown; declaration?: unknown; signed_at?: unknown };
export type PutRightOutcome = { ok: true; ret: ReturnView; fresh: boolean } | { ok: false; status: number; body: Record<string, unknown> };
const CLOCK_SLACK_MS = 72 * 3_600_000;

/**
 * The trade's Put right from their phone: photos of the fix (slot PR:<n>, already up: the phone sends
 * this last), what they did, the declaration and their signature. It goes back to the office for
 * review: a task for the job owner, due the next working day, and a push. A retry gets the same reply.
 */
export async function putRight(db: Db, a: AssignmentRow, b: PutRightInput, meta: { deviceId: string | null; ip: string | null; userAgent: string | null }): Promise<PutRightOutcome> {
  const n = Number(b.n);
  if (!Number.isInteger(n) || n < 1) return { ok: false, status: 400, body: { error: 'bad', message: 'That put right didn’t make sense. Call the office.' } };
  const { data: row, error: rowErr } = await db.from('site_returns').select('*').eq('assignment_id', a.id).eq('n', n).maybeSingle();
  if (rowErr || !row) return { ok: false, status: 409, body: { error: 'withdrawn', message: 'That return to site isn’t there any more. Call the office.' } };
  const ret = returnView(row as Record<string, unknown>);
  // Sent already (a retry, or a second phone), or the office has moved on: the reply as it stands.
  if (ret.status !== 'open') return { ok: true, ret, fresh: false };
  const note = String(b.note ?? '').trim().slice(0, 2000);
  if (!note) return { ok: false, status: 400, body: { error: 'bad', message: 'Say what you did to put it right.' } };
  const name = typeof b.name === 'string' ? b.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!name) return { ok: false, status: 400, body: { error: 'bad', message: 'Put your name to sign.' } };
  if (!validSignature(b.signature)) return { ok: false, status: 400, body: { error: 'bad', message: 'Draw your signature to sign.' } };
  const slot = putRightSlot(n);
  const { data: ph } = await db.from('crm_photos').select('id').eq('assignment_id', a.id).eq('slot', slot);
  const photos = ((ph ?? []) as { id: string }[]).map((p) => p.id).sort();
  if (!photos.length) return { ok: false, status: 422, body: { error: 'gate', message: 'Heliaxis hasn’t got a photo of the fix yet.', missing: [{ key: slot, label: 'A photo of the fix', step: '' }] } };

  const { data: p } = await db.from('crm_projects').select('address, postcode, enquiry_id').eq('id', a.project_id).maybeSingle();
  // The address as the phone's pack gives it (the customer's postcode when the job has none), so an honest phone's words match.
  const address = await siteAddress(db, p);
  // What was signed is the declaration worded here, never the phone's text (that's kept on the history if it differs).
  const declaration = putRightDeclaration(ret.what, address);
  const phoneText = typeof b.declaration === 'string' ? b.declaration.trim().slice(0, 3000) : '';
  const changed = !!phoneText && phoneText.replace(/\s+/g, ' ') !== declaration.replace(/\s+/g, ' ');
  const phoneAt = typeof b.signed_at === 'string' ? Date.parse(b.signed_at) : NaN;
  const signedAt = Number.isFinite(phoneAt) && Math.abs(phoneAt - Date.now()) <= CLOCK_SLACK_MS ? new Date(phoneAt).toISOString() : new Date().toISOString();

  await ensureDocsBucket();
  // Its own file per attempt (never overwritten): two sends of the same put right at once can't leave
  // one's signature on the other's record. The one that loses removes its file.
  const path = `signatures/${a.project_id}/site-putright-${ret.id}-${randomUUID()}.png`;
  const png = Buffer.from(String(b.signature).split(',')[1] ?? '', 'base64');
  const up = await db.storage.from(DOCS_BUCKET).upload(path, png, { contentType: 'image/png', upsert: false });
  if (up.error) return { ok: false, status: 503, body: { error: 'busy', message: 'The signature didn’t save. It will try again.' } };
  const now = new Date().toISOString();
  const { data: done } = await db
    .from('site_returns')
    .update({
      status: 'fixed',
      fixed_note: note,
      fixed_name: name,
      fixed_signature_path: path,
      fixed_declaration: declaration,
      fixed_at: signedAt,
      fixed_received_at: now,
      fixed_device_id: meta.deviceId,
      fixed_ip: meta.ip,
      fixed_user_agent: meta.userAgent?.slice(0, 400) ?? null,
      fixed_hash: createHash('sha256').update(canonicalJson({ note, photos })).digest('hex'),
    })
    .eq('id', ret.id)
    .eq('status', 'open')
    .select('*');
  const fresh = ((done ?? []) as Record<string, unknown>[])[0];
  if (!fresh) {
    await db.storage.from(DOCS_BUCKET).remove([path]).catch(() => null);
    // Another request sent it a moment ago: that's the one.
    const { data: again } = await db.from('site_returns').select('*').eq('id', ret.id).maybeSingle();
    return again ? { ok: true, ret: returnView(again as Record<string, unknown>), fresh: false } : { ok: false, status: 503, body: { error: 'busy', message: 'That didn’t save. It will try again.' } };
  }
  if (b.op_id && typeof b.op_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.op_id)) await db.from('site_ops').insert({ assignment_id: a.id, op_id: b.op_id, kind: 'put-right' }).then(() => null, () => null);
  await logSiteEvent(db, a.id, 'trade', 'put_right_signed', { return: n, name, photos: photos.length, device: meta.deviceId, ...(changed ? { declaration_phone: phoneText } : {}) }, meta.ip);
  const job = await jobOf(db, a.project_id);
  const where = siteShort(job.address, job.postcode) || job.ref || 'the job';
  const title = `${name} sent the put right at ${where}`;
  await logJob(db, a.project_id, `${title}: ${note.replace(/\s+/g, ' ').slice(0, 200)}`, { assignment: a.id, return: ret.id }, null);
  await addSourceTask(db, {
    projectId: a.project_id,
    key: taskKey(ret.id),
    title: putRightTaskTitle(name, a.trade, job.ref),
    notes: `What was asked: ${ret.what}\nWhat they did: ${note}\n\nCheck the photos of the fix on the job’s Site tab (Review), then tap Green light or Return to site required.`,
    assigneeId: job.owner_id,
    dueDate: await nextWorkingDay(),
  });
  if (job.owner_id) await notify({ userId: job.owner_id, kind: 'site_signoff', title, body: 'Check the photos of the fix, then give it the green light.', href: `/admin/projects/${a.project_id}?tab=site`, tag: `site-putright-${ret.id}` }).catch(() => {});
  await syncPoReview(db, a);
  return { ok: true, ret: returnView(fresh), fresh: true };
}

/** After the reply to a put right: the trade's report again, with the put right in it. */
export const afterPutRight = (db: Db, a: AssignmentRow) => refreshReport(db, a);

/**
 * The office reopened a sign-off: its returns to site still live are withdrawn (they sign again
 * instead), its review tasks close, and the PO's review is worked out again.
 */
export async function withdrawReturns(db: Db, a: AssignmentRow, signoffId: string, stage: Stage, byName: string | null) {
  const { data } = await db.from('site_returns').select('*').eq('assignment_id', a.id).eq('stage', stage).in('status', ['open', 'fixed']);
  const live = ((data ?? []) as Record<string, unknown>[]).map(returnView).filter(isLiveReturn);
  if (live.length) await db.from('site_returns').update({ status: 'withdrawn', reviewed_at: new Date().toISOString(), reviewed_by: byName }).in('id', live.map((r) => r.id));
  await closeSourceTask(db, a.project_id, taskKey(signoffId));
  for (const r of live) await closeSourceTask(db, a.project_id, taskKey(r.id));
  await syncPoReview(db, a);
}
