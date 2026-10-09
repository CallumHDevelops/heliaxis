'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  clientIp,
  DOCS_BUCKET,
  emailShell,
  esc,
  freshLinkEmail,
  inviteEmail,
  logEvent,
  newToken,
  nextRef,
  portalBaseUrl,
  portalLink,
  sendEmail,
  validSignature,
} from '@/lib/subcontractors/server';
import { revokeAllSessions } from '@/lib/subcontractors/session';
import { createNtpAgreement, isEmail, issueNtpSigningLink, parseNtpRequest } from '@/lib/subcontractors/ntp';
import { agreementIntact, ntpIntact } from '@/lib/subcontractors/hashing';
import { sendReminderNow } from '@/lib/subcontractors/reminders';
import {
  cancelDocRequest,
  cancelReplacementRequests,
  createDocRequest,
  fulfilReplacementsWith,
  alreadyAsked,
  newerReplacement,
  reopenRequestsForDocument,
  resendDocRequest,
} from '@/lib/subcontractors/requests';
import { NTP_TECHNOLOGIES, NTP_TERM_MONTHS } from '@/lib/subcontractors/ntp-agreement';
import { CIS_RATE_LABEL, SUB_COLUMNS, type AgreementRow, type BespokeRate, type CisRate, type DocRequestRow, type DocumentRow, type SubcontractorRow, type SubStatus, type NtpRow } from '@/lib/subcontractors/types';
import { CATEGORY_BY_KEY, londonToday } from '@/lib/subcontractors/documents';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Subcontractor records hold ID, bank and tax details — only users given this portal. */
async function requireAdmin() {
  const { user, profile } = await getSessionProfile();
  if (!user || !canAccess(profile, 'subcontractors')) throw new Error('Not authorised');
  return { email: user.email || profile?.email || 'admin' };
}

async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}` : null;
}

async function loadSub(id: string) {
  const { data } = await createAdminClient().from('subcontractors').select(SUB_COLUMNS).eq('id', id).single();
  return data as SubcontractorRow | null;
}

function cleanRates(rates: BespokeRate[]) {
  return (rates || [])
    .map((r) => ({
      trade: String(r.trade || '').trim().slice(0, 80),
      rate: String(r.rate || '').trim().slice(0, 40),
      basis: String(r.basis || '').trim().slice(0, 80),
    }))
    .filter((r) => r.trade && r.rate);
}

/** Rotate the magic link (old one stops working) and optionally email it. */
async function issueLink(
  sub: SubcontractorRow,
  actor: string,
  send: boolean,
  reminder = false,
  compose: (sub: SubcontractorRow, link: string) => { to: string; subject: string; html: string } = (s, l) => inviteEmail(s, l, reminder),
  event = reminder ? 'reminder_sent' : 'invite_sent'
): Promise<Result<{ link: string }>> {
  const { token, hash } = newToken();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin
    .from('subcontractors')
    .update({ token_hash: hash, token_created_at: now, ...(send ? { invited_at: now } : {}) })
    .eq('id', sub.id);
  const link = portalLink(token, await origin());
  if (send) {
    const res = await sendEmail(compose(sub, link));
    await logEvent(sub.id, actor, event, { to: sub.email, delivered: res.ok });
    if (!res.ok) return { ok: false, error: `Link created but the email failed: ${res.error}` };
  } else {
    await logEvent(sub.id, actor, 'link_created');
  }
  return { ok: true, link };
}

export async function createSubcontractor(input: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  trade: string;
  rateOption: 'default' | 'bespoke';
  bespokeRates: BespokeRate[];
  sendInvite: boolean;
}): Promise<Result<{ id: string; link: string }>> {
  const { email: actor } = await requireAdmin();
  const companyName = input.companyName?.trim();
  const contactName = input.contactName?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!companyName || !contactName) return { ok: false, error: 'Company and contact name are required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return { ok: false, error: 'Enter a valid email address.' };
  const rates = cleanRates(input.bespokeRates);
  if (input.rateOption === 'bespoke' && !rates.length) return { ok: false, error: 'Add at least one bespoke rate.' };

  const admin = createAdminClient();
  let created: SubcontractorRow | null = null;
  // Retry on the (rare) ref collision when two people add at once.
  for (let i = 0; i < 3 && !created; i++) {
    const { data, error } = await admin
      .from('subcontractors')
      .insert({
        ref: await nextRef(),
        company_name: companyName.slice(0, 160),
        contact_name: contactName.slice(0, 120),
        email,
        phone: input.phone?.trim().slice(0, 40) || null,
        trade: input.trade?.trim().slice(0, 80) || null,
        rate_option: input.rateOption === 'bespoke' ? 'bespoke' : 'default',
        bespoke_rates: input.rateOption === 'bespoke' ? rates : [],
        created_by: actor,
      })
      .select(SUB_COLUMNS)
      .single();
    if (data) created = data as SubcontractorRow;
    else if (error && error.code !== '23505') return { ok: false, error: error.message };
  }
  if (!created) return { ok: false, error: 'Could not allocate a reference — try again.' };

  await logEvent(created.id, actor, 'created', { rateOption: created.rate_option });
  const link = await issueLink(created, actor, input.sendInvite);
  revalidatePath('/admin/subcontractors');
  if (!link.ok) return { ok: false, error: link.error };
  return { ok: true, id: created.id, link: link.link };
}

export async function updateTerms(id: string, input: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  trade: string;
  rateOption: 'default' | 'bespoke';
  bespokeRates: BespokeRate[];
}): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const admin = createAdminClient();
  const { count } = await admin
    .from('subcontractor_agreements')
    .select('id', { count: 'exact', head: true })
    .eq('subcontractor_id', id);
  if (count) return { ok: false, error: 'The agreement is signed — these terms are locked.' };
  const rates = cleanRates(input.bespokeRates);
  if (input.rateOption === 'bespoke' && !rates.length) return { ok: false, error: 'Add at least one bespoke rate.' };
  const email = input.email?.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return { ok: false, error: 'Enter a valid email address.' };

  await admin
    .from('subcontractors')
    .update({
      company_name: input.companyName.trim().slice(0, 160),
      contact_name: input.contactName.trim().slice(0, 120),
      email,
      phone: input.phone?.trim() || null,
      trade: input.trade?.trim() || null,
      rate_option: input.rateOption,
      bespoke_rates: input.rateOption === 'bespoke' ? rates : [],
    })
    .eq('id', id);
  await logEvent(id, actor, 'terms_updated', { rateOption: input.rateOption });
  revalidatePath(`/admin/subcontractors/${id}`);
  return { ok: true };
}

export async function sendLink(id: string, mode: 'email' | 'reminder' | 'copy'): Promise<Result<{ link: string }>> {
  const { email: actor } = await requireAdmin();
  const sub = await loadSub(id);
  if (!sub) return { ok: false, error: 'Not found' };
  const r = await issueLink(sub, actor, mode !== 'copy', mode === 'reminder');
  revalidatePath(`/admin/subcontractors/${id}`);
  return r;
}

export async function countersign(id: string, input: { name: string; title: string; signature: string }): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const name = input.name?.trim();
  if (!name || name.length < 2) return { ok: false, error: 'Type your full name.' };
  if (!validSignature(input.signature)) return { ok: false, error: 'Draw your signature.' };

  const sub = await loadSub(id);
  if (!sub) return { ok: false, error: 'Not found' };
  const admin = createAdminClient();
  const { data } = await admin
    .from('subcontractor_agreements')
    .select('*')
    .eq('subcontractor_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const agr = data as AgreementRow | null;
  if (!agr) return { ok: false, error: 'The subcontractor has not signed yet.' };
  if (agr.hlx_signed_at) return { ok: false, error: 'Already countersigned.' };
  if (!agreementIntact(agr.snapshot, agr.content_hash)) {
    return { ok: false, error: 'Integrity check failed — the signed record has been altered since signing. Do not countersign; ask the subcontractor to re-sign.' };
  }

  const now = new Date().toISOString();
  const ip = clientIp(await headers());
  await admin
    .from('subcontractor_agreements')
    .update({
      hlx_name: name.slice(0, 120),
      hlx_title: input.title?.trim().slice(0, 120) || null,
      hlx_signature: input.signature,
      hlx_signed_at: now,
      hlx_signed_by: actor,
      hlx_ip: ip,
    })
    .eq('id', agr.id);
  await admin.from('subcontractors').update({ status: 'active' }).eq('id', id);
  await logEvent(id, actor, 'agreement_countersigned', { name }, ip);

  // Send them a fresh link so they can download the executed copy and keep docs current.
  const link = await issueLink(sub, actor, false);
  if (link.ok) {
    await sendEmail({
      to: sub.email,
      subject: `Your Heliaxis subcontractor agreement is live (${sub.ref})`,
      html: emailShell(
        "You're all set",
        `<p>Hi ${esc(sub.contact_name.split(' ')[0])},</p>
         <p>Heliaxis has countersigned the Subcontractor Framework Agreement <strong>${esc(sub.ref)}</strong> for ${esc(sub.company_name)}. It took effect on ${new Date(now).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
         <p>Use the link below to download your signed copy and to upload renewed insurance, cards and qualifications — please send renewals at least 30 days before anything expires.</p>`,
        { href: link.link, label: 'View your agreement' }
      ),
    });
  }
  revalidatePath(`/admin/subcontractors/${id}`);
  revalidatePath('/admin/subcontractors');
  return { ok: true };
}

type ReviewResult = Result<{
  reviewedAt: string | null;
  reviewNote: string | null;
  /** Replacement request made while rejecting. */
  request?: DocRequestRow;
  /** Open requests closed by this decision (the document isn't rejected any more, or answers them). */
  closedRequests?: string[];
  warning?: string;
}>;

/**
 * Approve / reject / reset a document. Rejecting can also ask the firm for a replacement:
 * that emails them now (with the reason) and opens a request that's chased until they
 * upload one. Un-rejecting withdraws any replacement request still open.
 */
export async function reviewDocument(
  docId: string,
  status: 'approved' | 'rejected' | 'pending',
  note: string,
  opts: { requestReplacement?: boolean } = {}
): Promise<ReviewResult> {
  const { email: actor } = await requireAdmin();
  if (!['approved', 'rejected', 'pending'].includes(status)) return { ok: false, error: 'Bad status' };
  const reviewNote = status === 'rejected' ? note?.trim().slice(0, 300) || null : null;
  const reviewedAt = status === 'pending' ? null : new Date().toISOString();
  // One round trip: update and read back what we need for the log.
  const { data: doc, error } = await createAdminClient()
    .from('subcontractor_documents')
    .update({ status, review_note: reviewNote, reviewed_by: status === 'pending' ? null : actor, reviewed_at: reviewedAt })
    .eq('id', docId)
    .select('*')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!doc) return { ok: false, error: 'Not found' };
  await logEvent(doc.subcontractor_id, actor, `document_${status}`, { file: doc.file_name, note: note || undefined });
  // No revalidatePath: the page updates this row itself (and refreshes quietly afterwards),
  // instead of making the click wait for the whole page to be rebuilt.
  if (status !== 'rejected') {
    const closedRequests = [
      ...(await cancelReplacementRequests(docId, doc.subcontractor_id, actor)),
      ...(status === 'approved' ? await fulfilReplacementsWith(doc as DocumentRow, actor) : []),
    ];
    return { ok: true, reviewedAt, reviewNote, ...(closedRequests.length ? { closedRequests } : {}) };
  }
  if (!opts.requestReplacement) return { ok: true, reviewedAt, reviewNote };
  // They may already have sent the fix (uploaded after this one) — don't ask for it again.
  const newer = await newerReplacement(doc as DocumentRow);
  if (newer) {
    return {
      ok: true,
      reviewedAt,
      reviewNote,
      warning: `Rejected. They've already uploaded a newer one (${newer.label || newer.file_name}), so no replacement was requested — review that instead.`,
    };
  }
  if (await alreadyAsked(doc as DocumentRow)) {
    return { ok: true, reviewedAt, reviewNote, warning: "Rejected. They've already been asked for this (there's an open request), so no new request was made." };
  }
  const sub = await loadSub(doc.subcontractor_id);
  if (!sub) return { ok: true, reviewedAt, reviewNote, warning: 'Rejected, but the subcontractor record could not be loaded to ask for a replacement.' };
  const req = await createDocRequest(
    sub,
    { category: doc.category, operativeId: doc.operative_id, label: doc.label, note: reviewNote, replacesDocumentId: docId },
    actor,
    true
  );
  if (!req.ok) return { ok: true, reviewedAt, reviewNote, warning: `Rejected, but asking for a replacement failed: ${req.error}` };
  return { ok: true, reviewedAt, reviewNote, request: req.request, ...(req.warning ? { warning: req.warning } : {}) };
}

// ---------------------------------------------------------------- document requests

/** Ask the firm for a document (any category, optionally for one person, with a note and a date). */
export async function requestDocument(
  subId: string,
  input: {
    category: string;
    operativeId: string | null;
    label: string;
    note: string;
    dueOn: string | null;
    email: boolean;
    replacesDocumentId?: string | null;
  }
): Promise<Result<{ request: DocRequestRow; warning?: string }>> {
  const { email: actor } = await requireAdmin();
  const sub = await loadSub(subId);
  if (!sub) return { ok: false, error: 'Not found' };
  let replaced: DocumentRow | null = null;
  if (input.replacesDocumentId) {
    const { data: doc } = await createAdminClient()
      .from('subcontractor_documents')
      .select('*')
      .eq('id', input.replacesDocumentId)
      .eq('subcontractor_id', subId)
      .maybeSingle();
    replaced = doc as DocumentRow | null;
    if (!replaced) return { ok: false, error: 'That document is no longer on file.' };
    if (replaced.status !== 'rejected') return { ok: false, error: 'That document is no longer rejected.' };
    if (await alreadyAsked(replaced)) return { ok: false, error: "They've already been asked for this — see the open request." };
    const newer = await newerReplacement(replaced);
    if (newer) return { ok: false, error: `They've already uploaded a newer one (${newer.label || newer.file_name}) — review that instead.` };
  }
  const r = await createDocRequest(sub, input, actor, !!input.email);
  if (!r.ok) return r;
  return { ok: true, request: r.request, ...(r.warning ? { warning: r.warning } : {}) };
}

export async function resendDocumentRequest(id: string): Promise<Result<{ request: DocRequestRow }>> {
  const { email: actor } = await requireAdmin();
  return resendDocRequest(id, actor);
}

export async function cancelDocumentRequest(id: string): Promise<Result<{ request: DocRequestRow }>> {
  const { email: actor } = await requireAdmin();
  return cancelDocRequest(id, actor);
}

export async function deleteDocument(docId: string): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('subcontractor_documents')
    .select('*')
    .eq('id', docId)
    .single();
  if (!doc) return { ok: false, error: 'Not found' };
  // If it was the (unreviewed) answer to a request, the request is open again — before the delete clears the link.
  await reopenRequestsForDocument(doc.subcontractor_id, doc, actor);
  await admin.storage.from(DOCS_BUCKET).remove([doc.storage_path]);
  await admin.from('subcontractor_documents').delete().eq('id', docId);
  await logEvent(doc.subcontractor_id, actor, 'document_deleted', { file: doc.file_name });
  revalidatePath(`/admin/subcontractors/${doc.subcontractor_id}`);
  return { ok: true };
}

export async function setStatus(id: string, status: SubStatus): Promise<Result> {
  const { email: actor } = await requireAdmin();
  if (!['active', 'suspended', 'terminated', 'in_progress', 'awaiting_countersign', 'invited'].includes(status)) {
    return { ok: false, error: 'Bad status' };
  }
  const admin = createAdminClient();
  const update: Record<string, unknown> = { status };
  if (status === 'terminated') update.token_hash = null; // kill the invite link
  await admin.from('subcontractors').update(update).eq('id', id);
  await logEvent(id, actor, 'status_changed', { status });
  if (status === 'terminated') await revokeAllSessions(id); // and sign them out everywhere
  revalidatePath(`/admin/subcontractors/${id}`);
  revalidatePath('/admin/subcontractors');
  return { ok: true };
}

export async function saveNotes(id: string, notes: string): Promise<Result> {
  await requireAdmin();
  await createAdminClient().from('subcontractors').update({ notes: notes.slice(0, 5000) }).eq('id', id);
  revalidatePath(`/admin/subcontractors/${id}`);
  return { ok: true };
}

/** Sign a subcontractor out of every device (e.g. a lost phone). */
export async function signOutEverywhere(id: string): Promise<Result> {
  const { email: actor } = await requireAdmin();
  await revokeAllSessions(id);
  await logEvent(id, actor, 'sessions_revoked');
  revalidatePath(`/admin/subcontractors/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- NTP agreements

/** Issue an NTP agreement for signature. The Framework Agreement must already be countersigned. */
export async function sendNtp(subId: string, input: Record<string, unknown>): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const sub = await loadSub(subId);
  if (!sub) return { ok: false, error: 'Not found' };
  const admin = createAdminClient();
  const { data: fw } = await admin
    .from('subcontractor_agreements')
    .select('hlx_signed_at')
    .eq('subcontractor_id', subId)
    .not('hlx_signed_at', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!fw) return { ok: false, error: 'Countersign their Subcontractor Framework Agreement first — the NTP agreement sits on top of it.' };
  const req = parseNtpRequest(input);
  if (req.ntpEmailInvalid) {
    return { ok: false, error: "That isn't a valid email address for the NTP — please correct it." };
  }
  if (req.operativeId) {
    const { data: op } = await admin
      .from('subcontractor_operatives')
      .select('full_name, email')
      .eq('id', req.operativeId)
      .eq('subcontractor_id', subId)
      .maybeSingle();
    if (!op) return { ok: false, error: 'That person is not on their team.' };
    req.ntpName = op.full_name;
    // They sign from a personal link: use their email on file, or remember the one given here.
    if (!req.ntpEmail && isEmail(op.email)) req.ntpEmail = String(op.email).trim().toLowerCase();
    if (req.ntpEmail && !isEmail(op.email)) {
      await admin.from('subcontractor_operatives').update({ email: req.ntpEmail }).eq('id', req.operativeId);
    }
  }
  const r = await createNtpAgreement(sub, req, actor);
  revalidatePath(`/admin/subcontractors/${subId}`);
  if (!r.ok) return r;
  return r.warning ? { ok: false, error: r.warning } : { ok: true };
}

export async function countersignNtp(ntpId: string, input: { name: string; title: string; signature: string }): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const name = input.name?.trim();
  if (!name || name.length < 2) return { ok: false, error: 'Type your full name.' };
  if (!validSignature(input.signature)) return { ok: false, error: 'Draw your signature.' };
  const admin = createAdminClient();
  const { data } = await admin.from('subcontractor_ntp_agreements').select('*').eq('id', ntpId).maybeSingle();
  const ntp = data as NtpRow | null;
  if (!ntp) return { ok: false, error: 'Not found' };
  if (ntp.status !== 'awaiting_countersign') return { ok: false, error: 'Not awaiting countersignature.' };
  if (!ntpIntact(ntp.snapshot, ntp.content_hash)) return { ok: false, error: 'Integrity check failed — do not countersign; reissue it.' };

  // A renewal starts the day after the agreement it renews ends, so there's no gap or overlap.
  let from = new Date();
  if (ntp.renewal_of) {
    const { data: prev } = await admin.from('subcontractor_ntp_agreements').select('status, expires_on').eq('id', ntp.renewal_of).maybeSingle();
    if (prev?.status === 'active' && prev.expires_on) {
      const next = new Date(`${prev.expires_on}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      if (next > from) from = next;
    }
  }
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + NTP_TERM_MONTHS);
  to.setUTCDate(to.getUTCDate() - 1);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  await admin
    .from('subcontractor_ntp_agreements')
    .update({
      status: 'active',
      hlx_name: name.slice(0, 120),
      hlx_title: input.title?.trim().slice(0, 120) || null,
      hlx_signature: input.signature,
      hlx_signed_at: new Date().toISOString(),
      hlx_signed_by: actor,
      hlx_ip: clientIp(await headers()),
      valid_from: ymd(from),
      expires_on: ymd(to),
    })
    .eq('id', ntpId);
  await logEvent(ntp.subcontractor_id, actor, 'ntp_countersigned', { ref: ntp.ref, from: ymd(from), to: ymd(to) });

  const sub = await loadSub(ntp.subcontractor_id);
  if (sub) {
    await sendEmail({
      to: sub.email,
      subject: `NTP agreement ${ntp.ref} is in force`,
      html: emailShell(
        'NTP agreement countersigned',
        `<p>Heliaxis has countersigned NTP agreement <strong>${esc(ntp.ref)}</strong> appointing ${esc(ntp.ntp_name)}. It runs from ${esc(ymd(from))} to ${esc(ymd(to))}. We'll send the renewal before it ends.</p>`,
        { href: `${portalBaseUrl()}/portal`, label: 'View in the portal' }
      ),
    });
    // The NTP is the person appointed — tell them too (they have no portal login).
    if (ntp.ntp_email && ntp.ntp_email.toLowerCase() !== sub.email.toLowerCase()) {
      await sendEmail({
        to: ntp.ntp_email,
        replyTo: sub.email,
        subject: `Your Heliaxis NTP appointment is in force (${ntp.ref})`,
        html: emailShell(
          "You're appointed",
          `<p>Hi ${esc(ntp.ntp_name.split(' ')[0])},</p>
           <p>Heliaxis has countersigned NTP agreement <strong>${esc(ntp.ref)}</strong>. You are Heliaxis's Nominated Technical Person for <strong>${esc(ntp.technologies.map((k) => NTP_TECHNOLOGIES[k]?.label ?? k).join(', '))}</strong> from ${esc(ymd(from))} to ${esc(ymd(to))}.</p>
           <p>${esc(sub.company_name)} can download the signed copy from the Heliaxis portal.</p>`,
          undefined,
          'NTP agreement'
        ),
      });
    }
  }
  revalidatePath(`/admin/subcontractors/${ntp.subcontractor_id}`);
  return { ok: true };
}

export async function cancelNtp(ntpId: string): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const admin = createAdminClient();
  const { data: ntp } = await admin.from('subcontractor_ntp_agreements').select('id, subcontractor_id, ref, status').eq('id', ntpId).maybeSingle();
  if (!ntp) return { ok: false, error: 'Not found' };
  if (['cancelled', 'superseded'].includes(ntp.status)) return { ok: true };
  await admin.from('subcontractor_ntp_agreements').update({ status: 'cancelled' }).eq('id', ntpId);
  await logEvent(ntp.subcontractor_id, actor, 'ntp_cancelled', { ref: ntp.ref, was: ntp.status });
  revalidatePath(`/admin/subcontractors/${ntp.subcontractor_id}`);
  return { ok: true };
}

/** Email the NTP a fresh personal signing link (the previous one stops working). */
export async function resendNtpLink(ntpId: string): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from('subcontractor_ntp_agreements').select('*').eq('id', ntpId).maybeSingle();
  const ntp = data as NtpRow | null;
  if (!ntp) return { ok: false, error: 'Not found' };
  if (ntp.status !== 'awaiting_signature') return { ok: false, error: 'It is not waiting for a signature.' };
  if (!ntp.ntp_email) return { ok: false, error: 'No email address for the NTP — cancel and resend with one.' };
  const sub = await loadSub(ntp.subcontractor_id);
  if (!sub) return { ok: false, error: 'Not found' };
  const r = await issueNtpSigningLink(ntp, sub, true);
  if (!r.ok) return { ok: false, error: r.error || 'Email failed' };
  await logEvent(ntp.subcontractor_id, actor, 'ntp_link_sent', { ref: ntp.ref, to: ntp.ntp_email });
  revalidatePath(`/admin/subcontractors/${ntp.subcontractor_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------- reminders

/** Email the firm everything that's outstanding right now, outside the daily schedule. */
export async function remindNow(subId: string): Promise<Result<{ items: number }>> {
  const { email: actor } = await requireAdmin();
  const r = await sendReminderNow(subId, actor);
  revalidatePath(`/admin/subcontractors/${subId}`);
  return r.ok ? { ok: true, items: r.items } : { ok: false, error: r.error };
}

export async function setRemindersPaused(subId: string, paused: boolean): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const { error } = await createAdminClient().from('subcontractors').update({ reminders_paused: paused }).eq('id', subId);
  if (error) return { ok: false, error: /reminders_paused/.test(error.message) ? 'Run supabase/reminders.sql first.' : error.message };
  await logEvent(subId, actor, paused ? 'reminders_paused' : 'reminders_resumed');
  revalidatePath(`/admin/subcontractors/${subId}`);
  return { ok: true };
}

/**
 * Email every (non-terminated) subcontractor an apology and a fresh personal link.
 * Runs in batches under the function time limit. The first call (no `since`)
 * stamps the run with the SERVER's clock; later calls pass it back. A firm counts
 * as done only once its email was actually delivered in this run, so retries reach
 * just the failed / unsent firms and nobody gets it twice.
 */
export async function sendFreshLinksToAll(
  since?: string
): Promise<Result<{ since: string; sent: number; failed: string[]; remaining: number }>> {
  const { email: actor } = await requireAdmin();
  const runSince = since && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(since) ? since : new Date().toISOString();
  const started = Date.now();
  const db = createAdminClient();
  const [{ data, error }, { data: doneRows, error: doneErr }] = await Promise.all([
    db.from('subcontractors').select(SUB_COLUMNS).neq('status', 'terminated').order('created_at'),
    db
      .from('subcontractor_events')
      .select('subcontractor_id')
      .eq('type', 'fresh_link_sent')
      .eq('detail->>delivered', 'true')
      .gte('created_at', runSince),
  ]);
  if (error || doneErr) return { ok: false, error: (error || doneErr)!.message };
  const done = new Set((doneRows ?? []).map((r) => r.subcontractor_id as string));
  const todo = ((data ?? []) as SubcontractorRow[]).filter((s) => s.email && !done.has(s.id));

  let sent = 0;
  const failed: string[] = [];
  for (const sub of todo) {
    if (Date.now() - started > 45_000) break;
    const r = await issueLink(sub, actor, true, false, freshLinkEmail, 'fresh_link_sent');
    if (r.ok) sent++;
    else failed.push(`${sub.company_name}: ${r.error}`);
    // Resend allows ~2 requests a second.
    await new Promise((res) => setTimeout(res, 550));
  }
  revalidatePath('/admin/subcontractors');
  return { ok: true, since: runSince, sent, failed, remaining: todo.length - sent };
}

/**
 * Admin correction of a document's details: rename it, move it to another category,
 * set which team member it belongs to, or fix its expiry date. The file itself is
 * untouched (its storage key doesn't need to match the category).
 */
export async function updateDocumentDetails(
  docId: string,
  input: { label: string; category: string; operativeId: string | null; expiresOn: string | null; coverAmount: string | null }
): Promise<Result<{ doc: DocumentRow }>> {
  const { email: actor } = await requireAdmin();
  const cat = CATEGORY_BY_KEY[input.category];
  if (!cat) return { ok: false, error: 'Choose a category.' };
  const db = createAdminClient();
  const { data: current } = await db.from('subcontractor_documents').select('*').eq('id', docId).maybeSingle();
  if (!current) return { ok: false, error: 'Not found' };

  let operative: { id: string; full_name: string } | null = null;
  if (cat.operative) {
    if (!input.operativeId) return { ok: false, error: `${cat.label} belong to a person — choose who.` };
    const { data: op } = await db
      .from('subcontractor_operatives')
      .select('id, full_name')
      .eq('id', input.operativeId)
      .eq('subcontractor_id', current.subcontractor_id)
      .maybeSingle();
    if (!op) return { ok: false, error: "That person isn't on this subcontractor's team." };
    operative = op;
  }
  const expiresOn = input.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) ? input.expiresOn : null;
  if (cat.expiry === 'required' && !expiresOn) return { ok: false, error: `${cat.label} need an expiry date.` };

  const { data, error } = await db
    .from('subcontractor_documents')
    .update({
      label: input.label.trim().slice(0, 120) || null,
      category: cat.key,
      operative_id: operative?.id ?? null,
      operative_name: operative?.full_name ?? null,
      expires_on: cat.expiry === 'none' ? null : expiresOn,
      cover_amount: cat.cover ? input.coverAmount?.trim().slice(0, 40) || null : null,
    })
    .eq('id', docId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  // Record exactly what changed (before → after) — expiry, person and cover on an approved
  // certificate change what RAMS pulls and whether the firm is compliant.
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of ['label', 'category', 'operative_name', 'expires_on', 'cover_amount'] as const) {
    const was = (current as Record<string, unknown>)[k] ?? null;
    const now = (data as Record<string, unknown>)[k] ?? null;
    if (was !== now) changes[k] = [was, now];
  }
  if (Object.keys(changes).length) {
    await logEvent(current.subcontractor_id, actor, 'document_updated', { file: current.file_name, status: current.status, changes });
  }
  return { ok: true, doc: data as DocumentRow };
}

// ---------------------------------------------------------------- CIS verification

/**
 * Record that our accountants have verified this firm with HMRC under CIS (or undo it):
 * the deduction rate HMRC gave, its verification number and the date it was done.
 */
export async function setCisVerification(
  subId: string,
  input: { verified: true; rate: CisRate; ref: string; verifiedOn: string } | { verified: false }
): Promise<Result<{ cis: CisRecord }>> {
  const { email: actor } = await requireAdmin();
  let update: CisRecord;
  if (input.verified) {
    if (!Object.hasOwn(CIS_RATE_LABEL, input.rate)) return { ok: false, error: 'Choose the rate HMRC gave.' };
    // HMRC verification numbers: V + 10 digits, plus 1–2 letters when the higher rate applies.
    const ref = String(input.ref || '').toUpperCase().replace(/\s+/g, '');
    if (ref && !/^V\d{10}(\/?[A-Z]{1,2})?$/.test(ref)) {
      return { ok: false, error: 'Verification numbers look like V1234567890 (with letters on the end for the higher rate).' };
    }
    const today = londonToday();
    const on = /^\d{4}-\d{2}-\d{2}$/.test(input.verifiedOn || '') ? input.verifiedOn : today;
    if (on > today) return { ok: false, error: "The verification date can't be in the future." };
    update = { cis_verified_on: on, cis_rate: input.rate, cis_verification_ref: ref || null, cis_verified_by: actor, cis_verified_at: new Date().toISOString() };
  } else {
    update = { cis_verified_on: null, cis_rate: null, cis_verification_ref: null, cis_verified_by: null, cis_verified_at: null };
  }
  const { error } = await createAdminClient().from('subcontractors').update(update).eq('id', subId);
  if (error) return { ok: false, error: /cis_/.test(error.message) ? 'Run supabase/portal-v3.sql in Supabase first.' : error.message };
  await logEvent(
    subId,
    actor,
    input.verified ? 'cis_verified' : 'cis_verification_removed',
    input.verified ? { rate: update.cis_rate, ref: update.cis_verification_ref || undefined, on: update.cis_verified_on } : null
  );
  revalidatePath(`/admin/subcontractors/${subId}`);
  revalidatePath('/admin/subcontractors');
  return { ok: true, cis: update };
}

type CisRecord = {
  cis_verified_on: string | null;
  cis_rate: CisRate | null;
  cis_verification_ref: string | null;
  cis_verified_by: string | null;
  cis_verified_at: string | null;
};
