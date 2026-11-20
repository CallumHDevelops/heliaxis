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
 * Telling the customer something new is waiting in their portal: our reply to their message, or a
 * document we've added. An email (when we have their address) and a text through The SMS Works (when
 * we have a UK mobile), each with their private link. A burst (three replies, five uploads) sends one
 * text, not five: a text goes at most once every 30 minutes per job, a document email once every 10.
 * Never throws: it says what it sent.
 */

type What = { kind: 'reply' } | { kind: 'document'; name: string };

const SMS_GAP_MIN = 30;
const DOC_EMAIL_GAP_MIN = 10;

async function sentLately(db: Db, projectId: string, channel: 'sms' | 'email', kind: string | null, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const q = db.from('site_events').select('id', { count: 'exact', head: true }).eq('type', 'portal_notify').contains('detail', kind ? { project_id: projectId, channel, kind } : { project_id: projectId, channel }).gte('at', since);
  const { count } = await q.then((r) => r, () => ({ count: 0 }));
  return (count ?? 0) > 0;
}

export async function notifyCustomer(db: Db, projectId: string, what: What): Promise<{ emailed: string | null; texted: boolean }> {
  const out = { emailed: null as string | null, texted: false };
  try {
    const { data: p } = await db.from('crm_projects').select('id, enquiry_id, contact_id, stage').eq('id', projectId).maybeSingle();
    const mode = portalMode(p?.stage as string | undefined);
    // Documents show only in the full portal (Won onwards); a reply shows in either.
    if (!p || !mode || (what.kind === 'document' && mode !== 'full')) return out;
    const token = await ensurePortalToken(projectId);
    if (!token) return out;
    const contact = await contactFor(db, p);
    const first = contact.name.split(/\s+/)[0] || 'there';
    const link = `${portalUrl(token)}${what.kind === 'document' ? '#docs' : '#help'}`;
    const subject = what.kind === 'reply' ? 'You have a new message from Heliaxis' : 'We’ve added a document to your project';
    const line = what.kind === 'reply' ? 'We have replied to your message.' : `We’ve added “${what.name}” to your project.`;

    if (contact.email && msConfigured() && !(what.kind === 'document' && (await sentLately(db, projectId, 'email', 'document', DOC_EMAIL_GAP_MIN)))) {
      try {
        const html = emailShell(
          subject,
          `<p>Hi ${esc(first)},</p><p>${esc(line)} Open your project to ${what.kind === 'reply' ? 'read it and reply' : 'view or download it'}.</p>`,
          { href: link, label: what.kind === 'reply' ? 'Read our reply' : 'See your documents' },
          'Your project'
        );
        await sendMail({ to: contact.email, subject, text: `Hi ${first},\n\n${line} Open your project here:\n${link}\n\nThanks,\nHeliaxis`, html });
        out.emailed = contact.email;
        await logSiteEvent(db, null, 'system', 'portal_notify', { project_id: projectId, channel: 'email', kind: what.kind }, null);
      } catch {
        // Their portal has it either way.
      }
    }
    if (contact.mobile && smsConfigured() && !(await sentLately(db, projectId, 'sms', null, SMS_GAP_MIN))) {
      const r = await sendSms(contact.mobile, `Heliaxis: ${line} ${what.kind === 'reply' ? 'Read it' : 'See it'} here: ${link}`, `portal-${what.kind}`);
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
