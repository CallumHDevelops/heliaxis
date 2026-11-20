import 'server-only';
import { randomBytes } from 'node:crypto';
import { siteUrl } from '@/lib/crm/server';
import { saveGenerated } from '@/lib/documents/store';
import { mergeValues } from '@/lib/documents/templates/render';
import { patchSlotData, refreshHandover } from '@/lib/handover/server';
import { emailShell } from '@/lib/email-brand';
import type { Db } from '@/lib/site/server';
import { clickToChat } from '@/lib/site/messages';
import { sendEmail, sha256 } from '@/lib/subcontractors/server';
import { formView, saveAnswers, signLine, type Who } from '@/lib/templates/forms';
import { formPdf } from '@/lib/templates/pdf';
import { jobHeadFor, supabaseStore } from '@/lib/templates/store';
import type { Answers } from '@/lib/templates/types';
import { targetOf, valueKeyOf, valueLabelOf, type Target } from './targets';

/**
 * Requests for installer information, and filling a pack item's questions one at a time (the office
 * or the installer, by their private link). Answers to a form template are kept on its form record
 * (templates/forms.ts) and signed there; a handover item's details on its handover slot. Either way
 * the item's document is made from them straight away.
 */

export type FillView = {
  code: string;
  kind: Target['kind'];
  title: string;
  template: Target['template'];
  answers: Answers;
  merge: Record<string, string>;
  /** 'done' once signed (a form) or submitted (details). */
  status: 'open' | 'done';
  job: { ref: string | null; address: string; customer: string };
  /** A form's first signature line: the person who did the work signs it to finish. */
  signLine: { key: string; label: string } | null;
};

const productsOf = async (db: Db, projectId: string) => {
  const { data } = await db.from('crm_projects').select('products').eq('id', projectId).maybeSingle();
  return ((data?.products as string[] | null) ?? []).map(String);
};

export async function fillView(db: Db, projectId: string, code: string): Promise<FillView | null> {
  const t = targetOf(code, await productsOf(db, projectId));
  const job = await jobHeadFor(db, projectId);
  if (!t || !job) return null;
  const head = { ref: job.ref, address: job.address.join(', '), customer: job.customer };
  if (t.kind === 'form') {
    const row = await supabaseStore(db).live(projectId, t.code);
    const v = formView(t.template, row);
    const first = t.template.sections.flatMap((s) => (s.type === 'sign' ? s.signers : []))[0] ?? null;
    return { code, kind: 'form', title: t.title, template: t.template, answers: v.answers, merge: mergeValues(job), status: v.status === 'signed' ? 'done' : 'open', job: head, signLine: first };
  }
  const { data } = await db.from('handover_slots').select('data').eq('project_id', projectId).eq('slot', code).maybeSingle();
  const values = ((data?.data as { values?: Record<string, string> } | null)?.values ?? {}) as Record<string, string>;
  const answers: Answers = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, valueLabelOf(code, k, v)]));
  return { code, kind: 'values', title: t.title, template: t.template, answers, merge: mergeValues(job), status: 'open', job: head, signLine: null };
}

/** Save some answers. */
export async function fillSave(db: Db, projectId: string, code: string, patch: Record<string, unknown>, who: Who): Promise<{ ok: true } | { ok: false; why: string }> {
  const t = targetOf(code, await productsOf(db, projectId));
  if (!t) return { ok: false, why: 'Not found' };
  if (t.kind === 'form') {
    const r = await saveAnswers(supabaseStore(db), t.template, projectId, patch, who, 'hap', new Date().toISOString());
    return r.ok ? { ok: true } : { ok: false, why: r.why };
  }
  const keys = new Set(t.template.sections.flatMap((s) => (s.type === 'fields' ? s.fields.map((f) => f.key) : [])));
  const values = Object.fromEntries(Object.entries(patch).filter(([k]) => keys.has(k)).map(([k, v]) => [k, valueKeyOf(code, k, String(v ?? '').slice(0, 500))]));
  await patchSlotData(db, projectId, code, { values }, who.id);
  return { ok: true };
}

/** Finish: a form is signed by the person who did the work and printed into its pack item; details make their item's page. */
export async function fillFinish(db: Db, projectId: string, code: string, sign: { name: string; image?: string } | null, who: Who, source: 'remote' | 'hap'): Promise<{ ok: true } | { ok: false; why: string }> {
  const t = targetOf(code, await productsOf(db, projectId));
  if (!t) return { ok: false, why: 'Not found' };
  if (t.kind === 'form') {
    const line = t.template.sections.flatMap((s) => (s.type === 'sign' ? s.signers : []))[0];
    if (line) {
      if (!sign?.name.trim()) return { ok: false, why: 'Type your name to sign.' };
      const r = await signLine(supabaseStore(db), t.template, projectId, line.key, sign, who, source, new Date().toISOString());
      if (!r.ok) return { ok: false, why: r.why };
    }
    if (t.slot) await fileForm(db, projectId, t, who.id);
  } else {
    await refreshHandover(db, projectId, { by: who.id, force: [code] }).catch((e) => console.error('[requests] refresh', e));
  }
  return { ok: true };
}

/** A signed form, printed and filed in its handover pack item (held to go with the pack, like the pack's own documents). */
async function fileForm(db: Db, projectId: string, t: Target, by: string | null) {
  const pdf = await formPdf(db, projectId, t.code);
  if (!pdf.ok) return;
  const r = await saveGenerated(db, projectId, {
    key: `FORM-${t.code}`,
    name: pdf.fileName,
    bytes: pdf.bytes,
    inputs: { form: t.code, at: new Date().toISOString() },
    category: 'commissioning',
    slot: t.slot,
    release: 'with_pack',
    visible: false,
    force: true,
    by,
  });
  if (r.status === 'saved') await refreshHandover(db, projectId, { by }).catch(() => null);
}

/* ── Requests to an installer ─────────────────────────────────────────────── */

export type RequestRow = {
  id: string;
  target: string;
  contact_name: string;
  sent_via: string[];
  created_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  cancelled_at: string | null;
};
export const requestUrl = (token: string) => `${siteUrl()}/f/${token}`;

export async function listRequests(db: Db, projectId: string): Promise<RequestRow[]> {
  const { data } = await db.from('form_requests').select('id, target, contact_name, sent_via, created_at, opened_at, submitted_at, cancelled_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100);
  return (data ?? []) as RequestRow[];
}

/** The installers the office can ask: site contacts (not archived), electricians first. */
export async function installers(db: Db) {
  const { data } = await db.from('site_contacts').select('id, name, company, email, mobile, wa_id, trades').is('archived_at', null).order('name').limit(500);
  return ((data ?? []) as { id: string; name: string; company: string | null; email: string | null; mobile: string | null; wa_id: string | null; trades: string[] | null }[]).sort(
    (a, b) => Number((b.trades ?? []).includes('electrician')) - Number((a.trades ?? []).includes('electrician'))
  );
}

/**
 * Ask an installer: a private link to the item's questions, emailed to them and/or as a WhatsApp
 * message the office sends from their own phone (`whatsapp`: the click-to-chat link). An earlier open
 * request for the same item is cancelled, so only the newest link works.
 */
export async function createRequest(
  db: Db,
  projectId: string,
  o: { code: string; contactId: string; via: ('email' | 'whatsapp')[]; note: string; by: { id: string; name: string } }
): Promise<{ ok: true; url: string; whatsapp: string | null; notes: string[] } | { ok: false; why: string }> {
  const products = await productsOf(db, projectId);
  const t = targetOf(o.code, products);
  if (!t) return { ok: false, why: 'That can’t be requested on this job.' };
  const { data: c } = await db.from('site_contacts').select('id, name, email, wa_id, mobile').eq('id', o.contactId).is('archived_at', null).maybeSingle();
  if (!c) return { ok: false, why: 'Choose who to ask.' };
  const job = await jobHeadFor(db, projectId);
  const token = randomBytes(24).toString('base64url');
  await db.from('form_requests').update({ cancelled_at: new Date().toISOString() }).eq('project_id', projectId).eq('target', o.code).is('submitted_at', null).is('cancelled_at', null);
  const { error } = await db.from('form_requests').insert({
    project_id: projectId,
    target: o.code,
    contact_id: c.id,
    contact_name: String(c.name),
    link_hash: sha256(token),
    note: o.note.trim().slice(0, 1000) || null,
    sent_via: o.via,
    requested_by: o.by.id,
  });
  if (error) return { ok: false, why: error.message };
  const url = requestUrl(token);
  const first = String(c.name).split(/\s+/)[0] || 'there';
  const where = job ? `${job.address[0] ?? ''}${job.postcode ? `, ${job.postcode}` : ''}` : 'the job';
  const text = `Hi ${first}, could you fill in the ${t.title.toLowerCase()} for ${where}${job?.ref ? ` (${job.ref})` : ''}? It takes a couple of minutes on your phone: ${url}${o.note.trim() ? `\n\n${o.note.trim()}` : ''}\n\nThanks, ${o.by.name.split(/\s+/)[0]} at Heliaxis`;
  const notes: string[] = [];
  if (o.via.includes('email')) {
    if (!c.email) notes.push(`${first} has no email address: send the link another way.`);
    else {
      const subject = `${t.title}: ${where}`;
      const paras = text.split('\n\n');
      const r = await sendEmail({
        to: String(c.email),
        subject,
        text,
        from: 'Heliaxis <noreply@heliaxis.co.uk>',
        replyTo: 'hello@heliaxis.co.uk',
        html: emailShell(subject, paras.map((p) => `<p>${p.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!)}</p>`).join(''), { href: url, label: `Fill in the ${t.title.toLowerCase()}` }, 'Installer'),
      });
      notes.push(r.ok ? `Emailed to ${c.email}.` : `Email didn’t go: ${r.error}`);
    }
  }
  const wa = (c.wa_id as string | null) || String(c.mobile ?? '').replace(/\D/g, '').replace(/^0/, '44') || null;
  return { ok: true, url, whatsapp: o.via.includes('whatsapp') && wa ? clickToChat(wa, text) : null, notes };
}

export async function cancelRequest(db: Db, projectId: string, id: string) {
  await db.from('form_requests').update({ cancelled_at: new Date().toISOString() }).eq('id', id).eq('project_id', projectId).is('submitted_at', null);
}

/** The request a link opens: live (not cancelled, not past its date). Marks it opened. */
export async function requestByToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null;
  const { data } = await db.from('form_requests').select('*').eq('link_hash', sha256(token)).maybeSingle();
  if (!data || data.cancelled_at || Date.parse(String(data.expires_at)) < Date.now()) return null;
  if (!data.opened_at) await db.from('form_requests').update({ opened_at: new Date().toISOString() }).eq('id', data.id);
  return data as { id: string; project_id: string; target: string; contact_name: string; note: string | null; submitted_at: string | null };
}

export async function markSubmitted(db: Db, id: string) {
  await db.from('form_requests').update({ submitted_at: new Date().toISOString() }).eq('id', id);
}

