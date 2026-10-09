import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY, londonToday, requestCovers, requestTitle, sameDocKind } from './documents';
import { ADMIN_EMAIL, emailShell, esc, logEvent, portalBaseUrl, sendEmail, siteBaseUrl } from './server';
import { SUB_COLUMNS, type DocRequestRow, type DocumentRow, type PortalRequest, type SubcontractorRow } from './types';

/**
 * Document requests: Heliaxis asks a firm for a specific document — anything, any time,
 * or a replacement when rejecting one. The firm is emailed straight away, sees the
 * request at the top of the portal's Documents step with its own Upload button, and is
 * chased in the daily digest (see reminders.ts) until it uploads against the request.
 */

const TABLE = 'subcontractor_doc_requests';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REQUESTS_SETUP = 'Run supabase/portal-v3.sql in Supabase first.';

/** The table doesn't exist yet (supabase/portal-v3.sql not run). */
export function requestsTableMissing(err: { code?: string; message?: string } | null | undefined) {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /subcontractor_doc_requests/.test(err.message || ''));
}

const fmtDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

export type RequestInput = {
  category: string;
  operativeId?: string | null;
  label?: string | null;
  note?: string | null;
  dueOn?: string | null;
};

export function toPortalRequest(r: DocRequestRow): PortalRequest {
  return {
    id: r.id,
    category: r.category,
    operativeId: r.operative_id,
    operativeName: r.operative_name,
    label: r.label,
    note: r.note,
    dueOn: r.due_on,
    createdAt: r.created_at,
    replacement: !!r.replaces_document_id,
  };
}

/** Open requests for one firm (empty if the table hasn't been created yet). */
export async function openRequestsFor(subId: string) {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select('*')
    .eq('subcontractor_id', subId)
    .eq('status', 'open')
    .order('created_at');
  if (error && !requestsTableMissing(error)) console.error('[doc-requests] load failed', error.message);
  return (data ?? []) as DocRequestRow[];
}

async function parseRequest(sub: SubcontractorRow, input: RequestInput) {
  const cat = CATEGORY_BY_KEY[input.category];
  if (!cat) return { ok: false as const, error: 'Choose what kind of document you need.' };
  let operative: { id: string; full_name: string } | null = null;
  if (cat.operative && input.operativeId) {
    const { data } = await createAdminClient()
      .from('subcontractor_operatives')
      .select('id, full_name')
      .eq('id', input.operativeId)
      .eq('subcontractor_id', sub.id)
      .is('archived_at', null)
      .maybeSingle();
    if (!data) return { ok: false as const, error: "That person isn't on their team any more." };
    operative = data;
  }
  const dueOn = input.dueOn ? (/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn) ? input.dueOn : 'bad') : null;
  if (dueOn === 'bad') return { ok: false as const, error: 'Check the "needed by" date.' };
  if (dueOn && dueOn < londonToday()) return { ok: false as const, error: 'The "needed by" date is in the past.' };
  return {
    ok: true as const,
    row: {
      category: cat.key,
      operative_id: operative?.id ?? null,
      operative_name: operative?.full_name ?? null,
      label: clean(input.label, 120),
      note: clean(input.note, 500),
      due_on: dueOn,
    },
  };
}

/** The email the firm gets when asked (or re-asked) for a document. */
export function requestEmail(sub: SubcontractorRow, r: DocRequestRow, again = false) {
  const what = requestTitle(r);
  const first = (sub.contact_name || '').split(' ')[0] || 'there';
  const due = r.due_on ? `We need it by ${fmtDate(r.due_on)}.` : '';
  const paras = r.replaces_document_id
    ? [
        `We couldn't accept a document you uploaded to the Heliaxis portal: ${what}.`,
        r.note ? `Reason: “${r.note}”` : '',
        `Please upload a replacement. ${due}`,
      ]
    : [`Heliaxis needs the following from ${sub.company_name}: ${what}.`, r.note ? `Note from Heliaxis: “${r.note}”` : '', due];
  const how = `Sign in with this email address (${sub.email}) and we'll email you a one-time code. The request is at the top of the Documents tab, with its own Upload button.`;
  const subject = r.replaces_document_id
    ? `${again ? 'Reminder: ' : 'Action needed: '}please re-upload ${what}`
    : `${again ? 'Reminder: ' : ''}Heliaxis has asked for ${what}`;
  return {
    to: sub.email,
    subject,
    html: emailShell(
      r.replaces_document_id ? 'Please upload a replacement' : 'A document has been requested',
      `<p>Hi ${esc(first)},</p>${paras.filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')}<p>${esc(how)}</p>`,
      { href: `${portalBaseUrl()}/portal`, label: 'Upload it now' }
    ),
    text: [`Hi ${first},`, ...paras.filter(Boolean), how, `${portalBaseUrl()}/portal`].join('\n\n'),
  };
}

async function emailRequest(sub: SubcontractorRow, r: DocRequestRow, again: boolean) {
  let res: { ok: boolean; error?: string };
  try {
    res = await sendEmail(requestEmail(sub, r, again));
  } catch (e) {
    res = { ok: false, error: (e as Error).message };
  }
  if (!res.ok) return { ok: false as const, error: res.error || 'Email failed' };
  const emailedAt = new Date().toISOString();
  await createAdminClient().from(TABLE).update({ emailed_at: emailedAt }).eq('id', r.id);
  return { ok: true as const, request: { ...r, emailed_at: emailedAt } };
}

/** Make a request and (optionally) email it now. */
export async function createDocRequest(
  sub: SubcontractorRow,
  input: RequestInput & { replacesDocumentId?: string | null },
  actor: string,
  email: boolean
): Promise<{ ok: true; request: DocRequestRow; warning?: string } | { ok: false; error: string }> {
  if (sub.status === 'terminated') return { ok: false, error: 'This subcontractor has been terminated.' };
  const parsed = await parseRequest(sub, input);
  if (!parsed.ok) return parsed;
  // One open request per document — a second would be chased in parallel and never both answered.
  const { data: open, error: openErr } = await createAdminClient().from(TABLE).select('*').eq('subcontractor_id', sub.id).eq('status', 'open');
  if (openErr) return { ok: false, error: requestsTableMissing(openErr) ? REQUESTS_SETUP : openErr.message };
  const dup = ((open ?? []) as DocRequestRow[]).find(
    (q) =>
      q.category === parsed.row.category &&
      (q.operative_id || null) === parsed.row.operative_id &&
      (q.label || '').toLowerCase().trim() === (parsed.row.label || '').toLowerCase().trim()
  );
  if (dup) return { ok: false, error: `There's already an open request for ${requestTitle(dup)} — use "Resend email" on it instead.` };
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .insert({ subcontractor_id: sub.id, ...parsed.row, replaces_document_id: input.replacesDocumentId || null, requested_by: actor })
    .select('*')
    .single();
  if (error) return { ok: false, error: requestsTableMissing(error) ? REQUESTS_SETUP : error.message };
  const request = data as DocRequestRow;
  await logEvent(sub.id, actor, 'document_requested', {
    request: requestTitle(request),
    note: request.note || undefined,
    due: request.due_on || undefined,
    replacement: request.replaces_document_id ? true : undefined,
  });
  if (!email) return { ok: true, request };
  const sent = await emailRequest(sub, request, false);
  if (!sent.ok) return { ok: true, request, warning: `Request saved, but the email didn't send (${sent.error}). Use "Resend email" on the request.` };
  return { ok: true, request: sent.request };
}

/** Email an open request again (admin). */
export async function resendDocRequest(id: string, actor: string) {
  const db = createAdminClient();
  const { data: r, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false as const, error: requestsTableMissing(error) ? REQUESTS_SETUP : error.message };
  const req = r as DocRequestRow | null;
  if (!req) return { ok: false as const, error: 'Not found' };
  if (req.status !== 'open') return { ok: false as const, error: 'That request is no longer open.' };
  const { data: sub } = await db.from('subcontractors').select(SUB_COLUMNS).eq('id', req.subcontractor_id).maybeSingle();
  if (!sub || (sub as SubcontractorRow).status === 'terminated') return { ok: false as const, error: 'Subcontractor not found or terminated.' };
  const sent = await emailRequest(sub as SubcontractorRow, req, true);
  if (!sent.ok) return { ok: false as const, error: `Email failed: ${sent.error}` };
  await logEvent(req.subcontractor_id, actor, 'document_request_resent', { request: requestTitle(req) });
  return { ok: true as const, request: sent.request };
}

/** Withdraw an open request (admin). */
export async function cancelDocRequest(id: string, actor: string) {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: actor })
    .eq('id', id)
    .eq('status', 'open')
    .select('*')
    .maybeSingle();
  if (error) return { ok: false as const, error: requestsTableMissing(error) ? REQUESTS_SETUP : error.message };
  const req = data as DocRequestRow | null;
  if (!req) return { ok: false as const, error: 'That request is no longer open.' };
  await logEvent(req.subcontractor_id, actor, 'document_request_cancelled', { request: requestTitle(req) });
  return { ok: true as const, request: req };
}

/** A rejected document has been approved / reset after all: its replacement request isn't needed. */
export async function cancelReplacementRequests(docId: string, subId: string, actor: string) {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: actor })
    .eq('subcontractor_id', subId)
    .eq('replaces_document_id', docId)
    .eq('status', 'open')
    .select('*');
  if (error || !data?.length) return [] as string[];
  for (const r of data as DocRequestRow[]) {
    await logEvent(subId, actor, 'document_request_cancelled', { request: requestTitle(r), reason: 'document accepted' });
  }
  return (data as DocRequestRow[]).map((r) => r.id);
}

/**
 * A new upload from the portal. It fulfils the request it was uploaded against, or — when
 * the portal didn't say (`requestId` absent) — the oldest open request it obviously
 * answers: same category, same person if one was named, and no specific description
 * (a request for "IPAF card" isn't answered by any old card). `'none'` = not for a request.
 * Returns the ids fulfilled.
 */
export async function fulfilRequestsForUpload(sub: SubcontractorRow, doc: DocumentRow, requestId: unknown): Promise<string[]> {
  if (requestId === 'none') return [];
  const db = createAdminClient();
  const { data, error } = await db.from(TABLE).select('*').eq('subcontractor_id', sub.id).eq('status', 'open').order('created_at');
  if (error || !data?.length) return [];
  const open = data as DocRequestRow[];
  const fits = (r: DocRequestRow) => r.category === doc.category && (!r.operative_id || r.operative_id === doc.operative_id);
  const target =
    typeof requestId === 'string' && UUID.test(requestId)
      ? open.find((r) => r.id === requestId && fits(r))
      : open.find((r) => fits(r) && !r.label);
  if (!target) return [];
  const { data: done } = await db
    .from(TABLE)
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_document_id: doc.id })
    .eq('id', target.id)
    .eq('status', 'open')
    .select('id');
  if (!done?.length) return [];
  const what = requestTitle(target);
  await logEvent(sub.id, 'subcontractor', 'document_request_fulfilled', { request: what, file: doc.file_name });
  // Heliaxis asked for it, so say it's arrived (best effort — the upload has already succeeded).
  try {
    await sendEmail({
      to: ADMIN_EMAIL(),
      subject: `${sub.company_name} uploaded the ${what} you asked for`,
      html: emailShell(
        'Requested document uploaded',
        `<p>${esc(sub.company_name)} (${esc(sub.ref)}) has uploaded <strong>${esc(what)}</strong> (${esc(doc.file_name)}). It's waiting for your review.</p>`,
        { href: `${siteBaseUrl()}/admin/subcontractors/${sub.id}`, label: 'Review it' },
        'Document request'
      ),
    });
  } catch {
    /* ignore */
  }
  return [target.id];
}

/**
 * A document that answered a request has been withdrawn (by the firm) or deleted (by us).
 * Only an answer still waiting for review leaves its request unanswered: a rejected answer
 * was dealt with when it was rejected (a replacement asked for, or deliberately not), and an
 * approved one was accepted. A replacement request whose rejected document has since been
 * accepted isn't reopened either. Call BEFORE deleting — the delete clears the link.
 */
export async function reopenRequestsForDocument(subId: string, doc: { id: string; status: string }, actor = 'subcontractor') {
  if (doc.status !== 'pending') return [] as DocRequestRow[];
  const db = createAdminClient();
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('subcontractor_id', subId)
    .eq('fulfilled_document_id', doc.id)
    .eq('status', 'fulfilled');
  if (error || !data?.length) return [] as DocRequestRow[];
  let candidates = data as DocRequestRow[];
  const replaced = candidates.map((r) => r.replaces_document_id).filter((x): x is string => !!x);
  const { data: wasRows } = replaced.length
    ? await db.from('subcontractor_documents').select('*').in('id', replaced)
    : { data: [] as DocumentRow[] };
  const was = (wasRows ?? []) as DocumentRow[];
  candidates = candidates.filter((r) => !r.replaces_document_id || was.some((d) => d.id === r.replaces_document_id && d.status === 'rejected'));
  if (!candidates.length) return [] as DocRequestRow[];

  // Another acceptable document already answers it (e.g. a better copy uploaded later): point
  // the request at that one instead of asking again.
  const { data: others } = await db
    .from('subcontractor_documents')
    .select('*')
    .eq('subcontractor_id', subId)
    .neq('status', 'rejected')
    .neq('id', doc.id)
    .order('uploaded_at', { ascending: false });
  const reopen: DocRequestRow[] = [];
  for (const r of candidates) {
    // Only a replacement request can be re-pointed: "a newer copy of the rejected document"
    // is unambiguous. A plain request reopens (the firm said which upload answered it).
    const old = was.find((d) => d.id === r.replaces_document_id);
    const alt = old ? ((others ?? []) as DocumentRow[]).find((x) => x.uploaded_at > old.uploaded_at && sameDocKind(old, x)) : undefined;
    if (alt) await db.from(TABLE).update({ fulfilled_document_id: alt.id }).eq('id', r.id).eq('status', 'fulfilled');
    else reopen.push(r);
  }
  if (!reopen.length) return [] as DocRequestRow[];
  candidates = reopen;
  const { data: back } = await db
    .from(TABLE)
    .update({ status: 'open', fulfilled_at: null, fulfilled_document_id: null })
    .in('id', candidates.map((r) => r.id))
    .eq('status', 'fulfilled')
    .select('*');
  for (const r of (back ?? []) as DocRequestRow[]) {
    await logEvent(subId, actor, 'document_request_reopened', { request: requestTitle(r) });
  }
  return (back ?? []) as DocRequestRow[];
}

/**
 * Has the firm already uploaded something newer that replaces this (rejected) document —
 * i.e. is a replacement request pointless? Returns that document, if any.
 */
export async function newerReplacement(doc: DocumentRow) {
  const { data } = await createAdminClient()
    .from('subcontractor_documents')
    .select('*')
    .eq('subcontractor_id', doc.subcontractor_id)
    .eq('category', doc.category)
    .neq('status', 'rejected')
    .gt('uploaded_at', doc.uploaded_at)
    .order('uploaded_at', { ascending: false });
  return ((data ?? []) as DocumentRow[]).find((x) => sameDocKind(doc, x)) ?? null;
}


/**
 * A document has just been approved: any open replacement request for an older, rejected
 * document of the same kind has been answered by it (the firm uploaded the fix without
 * going through the request). Marks them fulfilled; returns their ids.
 */
export async function fulfilReplacementsWith(doc: DocumentRow, actor: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('subcontractor_id', doc.subcontractor_id)
    .eq('status', 'open')
    .not('replaces_document_id', 'is', null);
  if (error || !data?.length) return [] as string[];
  const open = data as DocRequestRow[];
  const { data: rejected } = await db
    .from('subcontractor_documents')
    .select('*')
    .in('id', open.map((r) => r.replaces_document_id as string));
  const answered = open.filter((r) => {
    const old = ((rejected ?? []) as DocumentRow[]).find((x) => x.id === r.replaces_document_id);
    return !!old && old.id !== doc.id && old.uploaded_at < doc.uploaded_at && sameDocKind(old, doc);
  });
  if (!answered.length) return [] as string[];
  const { data: done } = await db
    .from(TABLE)
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_document_id: doc.id })
    .in('id', answered.map((r) => r.id))
    .eq('status', 'open')
    .select('*');
  for (const r of (done ?? []) as DocRequestRow[]) {
    await logEvent(doc.subcontractor_id, actor, 'document_request_fulfilled', { request: requestTitle(r), file: doc.file_name });
  }
  return ((done ?? []) as DocRequestRow[]).map((r) => r.id);
}

/**
 * Has the firm already been asked for this (rejected) document — an open request for the
 * same document, or a replacement request already answered by a copy that's still in play?
 */
export async function alreadyAsked(doc: DocumentRow) {
  const db = createAdminClient();
  const { data } = await db
    .from(TABLE)
    .select('*')
    .eq('subcontractor_id', doc.subcontractor_id)
    .or(`status.eq.open,and(status.eq.fulfilled,replaces_document_id.eq.${doc.id})`);
  const rows = (data ?? []) as DocRequestRow[];
  if (rows.some((q) => requestCovers(q, doc))) return true;
  const answers = rows.filter((q) => q.status === 'fulfilled' && q.fulfilled_document_id).map((q) => q.fulfilled_document_id as string);
  if (!answers.length) return false;
  const { data: live } = await db.from('subcontractor_documents').select('id').in('id', answers).neq('status', 'rejected');
  return !!live?.length;
}
