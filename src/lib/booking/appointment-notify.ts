import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { ensureBookingToken } from '@/lib/crm/booking-link';
import { sendSystem } from '@/lib/whatsapp/inbox';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { getCrmSettings } from '@/lib/crm/crm-settings';
import { sendAppointmentEmail, surveyTitle } from './appointment-email';
import { parseRange, type BookingRow } from './diary';
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


/* ── Automatic delivery ──────────────────────────────────────────────────────── */

/** After WhatsApp has been tried: is a text needed now, later (once WhatsApp reports), or not at all? Pure, so it can be tested. */
export function afterWhatsapp(w: { enabled: boolean; sentOk: boolean }, smsEnabled: boolean): 'sms-now' | 'wait' | 'none' {
  if (!smsEnabled) return 'none';
  if (!w.enabled) return 'none';
  return w.sentOk ? 'wait' : 'sms-now';
}

export type AutoInput = { bookingId: string; enquiryId: string; projectId: string; surveyType: string; startMs: number; endMs: number; who: string | null; me: string };
export type AutoResult = { skipped?: string; reached: boolean; lines: string[] };

/**
 * An appointment has just been booked (by the customer, or by staff): tell them. Email and WhatsApp go together; if WhatsApp
 * cannot be sent now a text goes instead, and if it is accepted but later comes back undelivered (the webhook), the text goes then
 * (see textInsteadOfWhatsapp). Once per booking. Never throws. `reached` is false when nothing could be sent to them.
 */
export async function autoNotifyAppointment(x: AutoInput): Promise<AutoResult> {
  const lines: string[] = [];
  try {
    const s = await getCrmSettings();
    if (!s.apptNotices) return { skipped: 'automatic appointment messages are off', reached: true, lines };
    const db = createAdminClient();
    // Once per booking: whoever sets notified_at first sends. (Before location-confirm.sql has run there is no column: send anyway.)
    const claim = await db.from('survey_bookings').update({ notified_at: new Date().toISOString() }).eq('id', x.bookingId).is('notified_at', null).select('id');
    if (!claim.error && !(claim.data ?? []).length) return { skipped: 'already sent', reached: true, lines };

    const { data: e } = await db.from('enquiries').select('name, email, phone').eq('id', x.enquiryId).maybeSingle();
    const first = String(e?.name ?? '').trim().split(/\s+/)[0] || 'there';
    const token = await ensureBookingToken(x.projectId);
    const link = token ? locationUrl(token) : null;
    const { date, time } = dateWords(x.startMs);
    const words = { first, date, time, link: link ?? '', me: x.me };
    const phone = (e?.phone as string | null) ?? null;
    let reached = false;

    if (s.apptEmail && /^\S+@\S+\.\S+$/.test(String(e?.email ?? '').trim())) {
      const r = await sendAppointmentEmail({ enquiryId: x.enquiryId, projectId: x.projectId, appointment: { title: surveyTitle(x.surveyType), startMs: x.startMs, endMs: x.endMs, who: x.who, uid: `${x.projectId}-${x.startMs}`, locationUrl: link } });
      lines.push(r.sent ? `Email sent to ${r.to}` : `Email NOT sent: ${r.why}`);
      reached ||= r.sent;
    }

    let whatsappOk = false;
    const wantsWhatsapp = s.apptWhatsapp && whatsappConfigured() && !!toMsisdn(phone);
    if (wantsWhatsapp && link) {
      const r = await sendSystem(x.enquiryId, { text: whatsappText(words), template: 'survey_location', params: [first, date, time, link, x.me] }, `appointment:${x.bookingId}`);
      whatsappOk = r.ok;
      lines.push(r.ok ? 'WhatsApp sent' : `WhatsApp NOT sent: ${r.error}`);
      reached ||= r.ok;
    }

    const next = afterWhatsapp({ enabled: wantsWhatsapp && !!link, sentOk: whatsappOk }, s.apptSms);
    // No WhatsApp route at all (no WhatsApp setting or no mobile) and no email either: a text is still better than nothing.
    const nothingElse = !reached && !wantsWhatsapp;
    if (next === 'sms-now' || (nothingElse && s.apptSms)) {
      if (!smsConfigured()) lines.push('Text NOT sent: text messages aren’t set up yet.');
      else if (!toMsisdn(phone)) lines.push('Text NOT sent: no UK mobile number.');
      else if (!link) lines.push('Text NOT sent: no location link could be made.');
      else {
        const r = await sendSms(phone as string, smsText(words));
        lines.push(r.ok ? `Text sent to ${phone}${next === 'sms-now' ? ' (WhatsApp could not be sent)' : ''}` : `Text NOT sent: ${r.error}`);
        reached ||= r.ok;
        if (r.ok) await db.from('survey_bookings').update({ sms_fallback_at: new Date().toISOString() }).eq('id', x.bookingId).then(() => null, () => null);
      }
    } else if (next === 'wait') lines.push('A text will follow if WhatsApp isn’t delivered');

    await logActivity({ enquiryId: x.enquiryId, projectId: x.projectId, kind: 'system', body: `📲 Appointment ${date} ${time}, sent automatically: ${lines.join('. ')}` }).catch(() => null);
    return { reached, lines };
  } catch (err) {
    return { reached: true, lines: [`Not sent: ${err instanceof Error ? err.message : 'something went wrong'}`] };
  }
}

/**
 * WhatsApp took the appointment message but could not deliver it (the number is not on WhatsApp, or Meta refused later): send
 * the text instead, once. Called from the WhatsApp status webhook for messages sent with via "appointment:<booking id>".
 */
export async function textInsteadOfWhatsapp(bookingId: string): Promise<void> {
  try {
    const s = await getCrmSettings();
    if (!s.apptSms) return;
    const db = createAdminClient();
    const { data: b } = await db.from('survey_bookings').select('*').eq('id', bookingId).maybeSingle();
    const row = b as (BookingRow & { sms_fallback_at?: string | null; project_id: string | null; enquiry_id: string | null }) | null;
    if (!row || !row.project_id || !row.enquiry_id || row.status !== 'confirmed' || row.sms_fallback_at) return;
    const claim = await db.from('survey_bookings').update({ sms_fallback_at: new Date().toISOString() }).eq('id', bookingId).is('sms_fallback_at', null).select('id');
    if (!claim.error && !(claim.data ?? []).length) return;
    const range = parseRange(row.onsite);
    if (!range) return;
    const { data: e } = await db.from('enquiries').select('name, phone').eq('id', row.enquiry_id).maybeSingle();
    const first = String(e?.name ?? '').trim().split(/\s+/)[0] || 'there';
    const phone = (e?.phone as string | null) ?? null;
    const token = await ensureBookingToken(row.project_id);
    const { date, time } = dateWords(range.start);
    const sv = (await (await import('./settings-server')).getBookingSettings()).surveyors.find((v) => v.key === row.surveyor_key);
    let result = '';
    if (!smsConfigured()) result = 'Text NOT sent: text messages aren’t set up yet.';
    else if (!toMsisdn(phone)) result = 'Text NOT sent: no UK mobile number.';
    else if (!token) result = 'Text NOT sent: no location link could be made.';
    else {
      const r = await sendSms(phone as string, smsText({ first, date, time, link: locationUrl(token), me: sv?.name.split(/\s+/)[0] || 'Heliaxis' }));
      result = r.ok ? `Text sent to ${phone}` : `Text NOT sent: ${r.error}`;
    }
    await logActivity({ enquiryId: row.enquiry_id, projectId: row.project_id, kind: 'system', body: `📲 WhatsApp wasn’t delivered for the ${date} ${time} appointment. ${result}` }).catch(() => null);
    if (/NOT sent/.test(result)) {
      const { setNextStep, pushStaff } = await import('./book');
      await setNextStep(row.project_id, `Tell ${first} about their appointment on ${date} (WhatsApp wasn’t delivered and no text could go)`).catch(() => null);
      await pushStaff({ projectId: row.project_id, title: `Couldn’t reach ${first} about their appointment`, body: 'WhatsApp wasn’t delivered. Give them a ring.', href: `/admin/crm/${row.project_id}` }).catch(() => null);
    }
  } catch {
    // The WhatsApp status is already recorded; a failed text must not break the webhook.
  }
}
