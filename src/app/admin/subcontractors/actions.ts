'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  agreementHash,
  clientIp,
  DOCS_BUCKET,
  emailShell,
  esc,
  inviteEmail,
  logEvent,
  newToken,
  nextRef,
  portalLink,
  sendEmail,
  validSignature,
} from '@/lib/subcontractors/server';
import { SUB_COLUMNS, type AgreementRow, type BespokeRate, type SubcontractorRow, type SubStatus } from '@/lib/subcontractors/types';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Subcontractor records hold ID, bank and tax details — admins only. */
async function requireAdmin() {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved' || profile.role !== 'admin') throw new Error('Not authorised');
  return { email: user.email || profile.email || 'admin' };
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
async function issueLink(sub: SubcontractorRow, actor: string, send: boolean, reminder = false): Promise<Result<{ link: string }>> {
  const { token, hash } = newToken();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin
    .from('subcontractors')
    .update({ token_hash: hash, token_created_at: now, ...(send ? { invited_at: now } : {}) })
    .eq('id', sub.id);
  const link = portalLink(token, await origin());
  if (send) {
    const res = await sendEmail(inviteEmail(sub, link, reminder));
    await logEvent(sub.id, actor, reminder ? 'reminder_sent' : 'invite_sent', { to: sub.email, delivered: res.ok });
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
  if (agreementHash(agr.snapshot) !== agr.content_hash) {
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

export async function reviewDocument(docId: string, status: 'approved' | 'rejected' | 'pending', note: string): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('subcontractor_documents')
    .select('id, subcontractor_id, file_name, category')
    .eq('id', docId)
    .single();
  if (!doc) return { ok: false, error: 'Not found' };
  await admin
    .from('subcontractor_documents')
    .update({
      status,
      review_note: status === 'rejected' ? note?.trim().slice(0, 300) || null : null,
      reviewed_by: status === 'pending' ? null : actor,
      reviewed_at: status === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', docId);
  await logEvent(doc.subcontractor_id, actor, `document_${status}`, { file: doc.file_name, note: note || undefined });
  revalidatePath(`/admin/subcontractors/${doc.subcontractor_id}`);
  return { ok: true };
}

export async function deleteDocument(docId: string): Promise<Result> {
  const { email: actor } = await requireAdmin();
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('subcontractor_documents')
    .select('id, subcontractor_id, storage_path, file_name')
    .eq('id', docId)
    .single();
  if (!doc) return { ok: false, error: 'Not found' };
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
  if (status === 'terminated') update.token_hash = null; // kill the portal link
  await admin.from('subcontractors').update(update).eq('id', id);
  await logEvent(id, actor, 'status_changed', { status });
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
