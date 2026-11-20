import 'server-only';
import type { Db } from '@/lib/site/server';
import { emailShell, esc } from '@/lib/email-brand';
import { msConfigured, sendMail } from '@/lib/ms365';
import { sendSms, smsConfigured } from '@/lib/sms';
import { logSiteEvent } from '@/lib/site/server';
import { contactFor } from './portal-codes';
import { ensurePortalToken, portalUrl } from './server';
import { portalMode } from './stages';

/**
 * Telling the customer something new is waiting in their portal, by email (when we have their address)
 * and text through The SMS Works (when we have a UK mobile), each with their private link.
 * - Our reply to their portal message: straight away. Several replies in a row send one text (at most one
 *   reply text per job every 30 minutes); each reply is emailed.
 * - Documents: never one at a time. Any document that becomes visible in their portal, by any route, is
 *   queued by a database trigger (supabase/portal-doc-notices.sql). Once 30 minutes pass with nothing new
 *   queued for the job, flushDocumentNotices (every minute, /api/cron/whatsapp-outbox) sends ONE message
 *   listing them. Documents told another way (the handover "tell them" tick, the pack's Send) are left out.
 * Never throws: it says what it sent.
 */

type What = { kind: 'reply' } | { kind: 'documents'; names: string[] };

const REPLY_SMS_GAP_MIN = 30;
/** Quiet time after the last document before the summary goes. */
export const DOC_QUIET_MIN = 30;

async function sentLately(db: Db, projectId: string, channel: 'sms' | 'email', kind: string, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await db
    .from('site_events')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'portal_notify')
    .contains('detail', { project_id: projectId, channel, kind })
    .gte('at', since)
    .then((r) => r, () => ({ count: 0 }));
  return (count ?? 0) > 0;
}

/** "Covering letter, Workmanship warranty and MCS certificate", or "…, A, B and 3 more" past `max`. */
function listOf(names: string[], max: number) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return shown.length < 2 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

export async function notifyCustomer(db: Db, projectId: string, what: What): Promise<{ emailed: string | null; texted: boolean }> {
  const out = { emailed: null as string | null, texted: false };
  try {
    const { data: p } = await db.from('crm_projects').select('id, enquiry_id, contact_id, stage').eq('id', projectId).maybeSingle();
    const mode = portalMode(p?.stage as string | undefined);
    // Documents show only in the full portal (Won onwards); a reply shows in either.
    if (!p || !mode || (what.kind === 'documents' && (mode !== 'full' || !what.names.length))) return out;
    const token = await ensurePortalToken(projectId);
    if (!token) return out;
    const contact = await contactFor(db, p);
    const first = contact.name.split(/\s+/)[0] || 'there';
    const link = `${portalUrl(token)}${what.kind === 'documents' ? '#docs' : '#help'}`;
    const docs = what.kind === 'documents' ? what.names : [];
    const one = docs.length === 1;
    const subject = what.kind === 'reply' ? 'You have a new message from Heliaxis' : one ? 'We’ve added a document to your project' : `We’ve added ${docs.length} documents to your project`;
    const line = (max: number) =>
      what.kind === 'reply' ? 'We have replied to your message.' : one ? `We’ve added “${docs[0]}” to your project.` : `We’ve added ${docs.length} documents to your project: ${listOf(docs, max)}.`;

    if (contact.email && msConfigured()) {
      try {
        const body =
          what.kind === 'documents' && !one
            ? `<p>Hi ${esc(first)},</p><p>We’ve added ${docs.length} documents to your project:</p><ul>${docs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul><p>Open your project to view or download them.</p>`
            : `<p>Hi ${esc(first)},</p><p>${esc(line(99))} Open your project to ${what.kind === 'reply' ? 'read it and reply' : 'view or download it'}.</p>`;
        const html = emailShell(subject, body, { href: link, label: what.kind === 'reply' ? 'Read our reply' : 'See your documents' }, 'Your project');
        await sendMail({ to: contact.email, subject, text: `Hi ${first},\n\n${line(99)}\n\nOpen your project here:\n${link}\n\nThanks,\nHeliaxis`, html });
        out.emailed = contact.email;
        await logSiteEvent(db, null, 'system', 'portal_notify', { project_id: projectId, channel: 'email', kind: what.kind }, null);
      } catch {
        // Their portal has it either way.
      }
    }
    if (contact.mobile && smsConfigured() && !(what.kind === 'reply' && (await sentLately(db, projectId, 'sms', 'reply', REPLY_SMS_GAP_MIN)))) {
      const r = await sendSms(contact.mobile, `Heliaxis: ${line(3)} ${what.kind === 'reply' ? 'Read it' : one ? 'See it' : 'See them'} here: ${link}`, `portal-${what.kind}`);
      if (r.ok) {
        out.texted = true;
        await logSiteEvent(db, null, 'system', 'portal_notify', { project_id: projectId, channel: 'sms', kind: what.kind }, null);
      }
    }
  } catch (e) {
    console.error('[portal-notify]', e);
  }
  return out;
}

/** Leave documents out of the summary: they were told about another way (or the office said not to). */
export async function coverDocumentNotices(db: Db, documentIds: string[]) {
  if (!documentIds.length) return;
  await db.from('portal_doc_notices').update({ covered: true, sent_at: new Date().toISOString() }).in('document_id', documentIds).is('sent_at', null).then(() => null, () => null);
}

/**
 * The queued documents whose job has been quiet for 30 minutes: one message per job. A document since
 * hidden or archived is dropped; if the handover pack was sent after they were queued, its own message
 * already told them. Every row it looks at is marked done, whatever happens, so nothing repeats.
 */
export async function flushDocumentNotices(db: Db): Promise<{ jobs: number; told: number } | string> {
  const { data: rows, error } = await db.from('portal_doc_notices').select('id, project_id, document_id, name, created_at').is('sent_at', null).order('created_at').limit(500);
  if (error) return 'portal-doc-notices.sql not run';
  const byJob = new Map<string, { id: string; document_id: string; name: string; created_at: string }[]>();
  for (const r of (rows ?? []) as { id: string; project_id: string; document_id: string; name: string; created_at: string }[]) {
    const list = byJob.get(r.project_id) ?? [];
    list.push(r);
    byJob.set(r.project_id, list);
  }
  const quietSince = Date.now() - DOC_QUIET_MIN * 60_000;
  let jobs = 0;
  let told = 0;
  for (const [projectId, list] of byJob) {
    if (Date.parse(list.at(-1)!.created_at) > quietSince) continue;
    jobs++;
    const ids = list.map((r) => r.id);
    const firstQueued = list[0].created_at;
    const [{ data: docs }, { data: pack }] = await Promise.all([
      db.from('crm_documents').select('id, name, visible, archived_at').in('id', list.map((r) => r.document_id)),
      db.from('handover_packs').select('sent_at').eq('project_id', projectId).not('sent_at', 'is', null).gte('sent_at', firstQueued).limit(1).then((r) => r, () => ({ data: null })),
    ]);
    const live = new Set(((docs ?? []) as { id: string; visible: boolean; archived_at: string | null }[]).filter((d) => d.visible && !d.archived_at).map((d) => d.id));
    const names = [...new Set(list.filter((r) => live.has(r.document_id)).map((r) => r.name))];
    const coveredByPack = !!(pack as unknown[] | null)?.length;
    // Marked first, so a slow send can never make the next minute's run send it again.
    await db.from('portal_doc_notices').update({ sent_at: new Date().toISOString(), covered: coveredByPack }).in('id', ids);
    if (coveredByPack || !names.length) continue;
    const r = await notifyCustomer(db, projectId, { kind: 'documents', names });
    if (r.emailed || r.texted) told++;
  }
  return { jobs, told };
}
