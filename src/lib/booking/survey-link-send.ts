import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { ensureBookingToken, bookingUrl, BOOKABLE_STAGES } from '@/lib/crm/booking-link';
import { noSurveyNeeded } from '@/lib/crm/stages';
import { emailShell, esc } from '@/lib/email-brand';
import { greetingName } from '@/lib/greeting-name';
import { msConfigured, sendMail } from '@/lib/ms365';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { sendSystem } from '@/lib/whatsapp/inbox';
import { waPermission } from '@/lib/whatsapp/permission';
import { toWaId } from '@/lib/whatsapp/shared';
import { londonIso } from '@/app/admin/crm/crm-shared';
import { emailParagraphs, emailSubject, smsWords, whatsappWords } from './survey-link-text';

/**
 * Send a customer their survey booking link on the channels staff tick: WhatsApp (free text inside their 24-hour window, the approved
 * "survey_booking_link" template outside it), a text, and an email. Each says what it did, and the whole thing is logged on the job.
 */
export type Channels = { whatsapp?: boolean; sms?: boolean; email?: boolean };
type Can = { ok: boolean; why: string };
export type LinkInfo =
  | { error: string }
  | { customer: string; first: string; url: string; email: string | null; phone: string | null; can: { whatsapp: Can; sms: Can; email: Can } };

const NO_SURVEY = 'This job has no solar, battery or heat pump on it, so it doesn’t need a survey.';

export async function surveyLinkInfo(projectId: string): Promise<LinkInfo> {
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, stage, products, survey_type').eq('id', projectId).maybeSingle();
  if (!p) return { error: 'Job not found.' };
  if (!(BOOKABLE_STAGES as readonly string[]).includes(String(p.stage))) return { error: 'Booking links are for jobs at Lead, Contacted or Survey booked.' };
  if (noSurveyNeeded({ products: (p.products as string[] | null) ?? [], survey_type: p.survey_type as string | null })) return { error: NO_SURVEY };
  const token = await ensureBookingToken(projectId);
  if (!token) return { error: 'Couldn’t make a booking link for this job.' };
  const { data: e } = await db.from('enquiries').select('id, name, email, phone, wa_id').eq('id', p.enquiry_id as string).maybeSingle();
  if (!e) return { error: 'Customer not found.' };
  const email = String(e.email ?? '').trim();
  const phone = (e.phone as string | null) || (e.wa_id as string | null) || null;
  const mobile = toMsisdn(phone);
  const perm = whatsappConfigured() && (e.wa_id || toWaId(phone)) ? await waPermission(e.id as string) : null;
  return {
    customer: String(e.name ?? ''),
    first: greetingName(e.name as string | null) || 'there',
    url: bookingUrl(token),
    email: email || null,
    phone,
    can: {
      whatsapp: !whatsappConfigured() ? { ok: false, why: 'WhatsApp isn’t connected.' } : !(e.wa_id || toWaId(phone)) ? { ok: false, why: 'No mobile number.' } : perm && !perm.allowed ? { ok: false, why: perm.reason || 'No WhatsApp permission.' } : { ok: true, why: '' },
      sms: !smsConfigured() ? { ok: false, why: 'Text messages aren’t set up yet.' } : !mobile ? { ok: false, why: 'Needs a UK mobile number.' } : { ok: true, why: '' },
      email: !msConfigured() ? { ok: false, why: 'Email isn’t set up.' } : !/^\S+@\S+\.\S+$/.test(email) ? { ok: false, why: 'No email address on file.' } : { ok: true, why: '' },
    },
  };
}

/** 9am London, `days` from today. */
export const chaseAt = (days: number, now = new Date()) => {
  const d = new Date(now.getTime() + days * 86_400_000);
  return londonIso(d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), '09:00');
};

export async function sendSurveyLink(x: { projectId: string; channels: Channels; by: { id: string; name: string }; chaseDays?: number }): Promise<{ ok: boolean; lines: string[]; error?: string }> {
  const info = await surveyLinkInfo(x.projectId);
  if ('error' in info) return { ok: false, lines: [], error: info.error };
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', x.projectId).maybeSingle();
  const enquiryId = p!.enquiry_id as string;
  const me = x.by.name.trim().split(/\s+/)[0] || 'Heliaxis';
  const w = { first: info.first, url: info.url, me };
  const lines: string[] = [];
  let sent = 0;

  if (x.channels.whatsapp) {
    if (!info.can.whatsapp.ok) lines.push(`WhatsApp NOT sent: ${info.can.whatsapp.why}`);
    else {
      const r = await sendSystem(enquiryId, { text: whatsappWords(w), template: 'survey_booking_link', params: [info.first, info.url, me] }, 'survey-link');
      lines.push(r.ok ? 'WhatsApp sent' : `WhatsApp NOT sent: ${r.error}`);
      if (r.ok) sent++;
    }
  }
  if (x.channels.sms) {
    if (!info.can.sms.ok) lines.push(`Text NOT sent: ${info.can.sms.why}`);
    else {
      const text = smsWords(w);
      const r = await sendSms(info.phone as string, text, 'survey-link');
      lines.push(r.ok ? `Text sent to ${info.phone}` : `Text NOT sent: ${r.error}`);
      if (r.ok) {
        sent++;
        // In their chat as "Text message", like any other text.
        await db.from('whatsapp_messages').insert({ enquiry_id: enquiryId, wa_message_id: `sms:${randomUUID()}`, direction: 'out', kind: 'text', body: `Text message: ${text}`, status: 'sent', sent_by: x.by.id, via: 'sms', created_at: new Date().toISOString() }).then(() => null, () => null);
      }
    }
  }
  if (x.channels.email) {
    if (!info.can.email.ok) lines.push(`Email NOT sent: ${info.can.email.why}`);
    else {
      try {
        const paras = emailParagraphs(w);
        const html = emailShell(emailSubject, paras.map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join(''), { href: info.url, label: 'Book your survey' }, 'Your survey', 'You are receiving this because you asked Heliaxis about solar, battery or heating. Reply to this email if you would like to talk to us.');
        await sendMail({ to: info.email as string, subject: emailSubject, text: `${paras.join('\n\n')}\n\n${info.url}`, html });
        lines.push(`Email sent to ${info.email}`);
        sent++;
      } catch (err) {
        lines.push(`Email NOT sent: ${err instanceof Error ? err.message : 'it didn’t go'}`);
      }
    }
  }
  if (!lines.length) return { ok: false, lines, error: 'Pick at least one way to send it.' };

  await logActivity({ enquiryId, projectId: x.projectId, kind: 'system', body: `Survey booking link: ${lines.join('. ')}`, byId: x.by.id }).catch(() => null);
  // "Remind me to check they've booked": the job's next step, if there isn't a sooner one already.
  if (sent && x.chaseDays && x.chaseDays > 0) {
    const at = chaseAt(x.chaseDays);
    const { data: cur } = await db.from('crm_projects').select('next_step_at').eq('id', x.projectId).maybeSingle();
    const curAt = cur?.next_step_at ? new Date(String(cur.next_step_at)).getTime() : null;
    if (!curAt || curAt > new Date(at).getTime()) await db.from('crm_projects').update({ next_step: 'Check they’ve booked their survey', next_step_at: at, next_step_notified_at: null }).eq('id', x.projectId).then(() => null, () => null);
  }
  return { ok: sent > 0, lines, ...(sent ? {} : { error: 'Nothing went. See below.' }) };
}
