import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { ensureBookingToken } from '@/lib/crm/booking-link';
import { sendSystem } from '@/lib/whatsapp/inbox';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { sendAppointmentEmail, surveyTitle } from './appointment-email';
import { dateWords, smsText, whatsappText } from './appointment-text';
import { locationUrl } from './location-server';

/**
 * Tells the customer about an appointment on the channels staff ticked: email (with a calendar file), WhatsApp (the ready-made
 * "check the pin" template, or free text inside their 24-hour window) and SMS. Every message carries the link to a map with a pin
 * they can move. Returns one line per channel, for the booking screen, and logs each on the job. Never throws.
 */
export type Notify = { email?: boolean; whatsapp?: boolean; sms?: boolean };

export async function sendAppointmentNotices(x: { enquiryId: string; projectId: string; surveyType: string; startMs: number; endMs: number; who: string | null; notify: Notify; by: { id: string; name: string } }): Promise<string[]> {
  const out: string[] = [];
  if (!x.notify.email && !x.notify.whatsapp && !x.notify.sms) return out;
  try {
    const db = createAdminClient();
    const { data: e } = await db.from('enquiries').select('name, phone, wa_id').eq('id', x.enquiryId).maybeSingle();
    const first = String(e?.name ?? '').trim().split(/\s+/)[0] || 'there';
    const token = await ensureBookingToken(x.projectId);
    const link = token ? locationUrl(token) : null;
    const { date, time } = dateWords(x.startMs);
    const words = { first, date, time, link: link ?? '', me: x.by.name };
    const phone = (e?.phone as string | null) ?? null;

    if (x.notify.email) {
      const r = await sendAppointmentEmail({ enquiryId: x.enquiryId, projectId: x.projectId, appointment: { title: surveyTitle(x.surveyType), startMs: x.startMs, endMs: x.endMs, who: x.who, uid: `${x.projectId}-${x.startMs}`, locationUrl: link }, byId: x.by.id });
      out.push(r.sent ? `Email sent to ${r.to}` : `Email NOT sent: ${r.why}`);
    }
    if (x.notify.whatsapp) {
      if (!whatsappConfigured()) out.push('WhatsApp NOT sent: it isn’t connected.');
      else if (!link) out.push('WhatsApp NOT sent: no location link could be made.');
      else {
        const r = await sendSystem(x.enquiryId, { text: whatsappText(words), template: 'survey_location', params: [first, date, time, link, x.by.name] }, 'appointment');
        out.push(r.ok ? 'WhatsApp sent' : `WhatsApp NOT sent: ${r.error}`);
      }
    }
    if (x.notify.sms) {
      if (!smsConfigured()) out.push('Text NOT sent: text messages aren’t set up yet.');
      else if (!toMsisdn(phone)) out.push('Text NOT sent: no UK mobile number.');
      else if (!link) out.push('Text NOT sent: no location link could be made.');
      else {
        const r = await sendSms(phone as string, smsText(words));
        out.push(r.ok ? `Text sent to ${phone}` : `Text NOT sent: ${r.error}`);
      }
    }
    if (out.length) await logActivity({ enquiryId: x.enquiryId, projectId: x.projectId, kind: 'system', body: `📲 Appointment ${date} ${time}: ${out.join('. ')}`, byId: x.by.id }).catch(() => null);
  } catch (err) {
    out.push(`Not sent: ${err instanceof Error ? err.message : 'something went wrong'}`);
  }
  return out;
}
