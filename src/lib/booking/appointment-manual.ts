import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { ensureBookingToken } from '@/lib/crm/booking-link';
import { listJobPeople } from '@/lib/crm/job-people';
import { greetingName } from '@/lib/greeting-name';
import { sendSystem } from '@/lib/whatsapp/inbox';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { msConfigured } from '@/lib/ms365';
import { getBookingSettings } from './settings-server';
import { parseRange } from './diary';
import { liveBookingFor } from './book';
import { sendAppointmentEmail, surveyTitle } from './appointment-email';
import { dateWords, smsText, whatsappText } from './appointment-text';
import { locationUrl } from './location-server';

/**
 * Sending an appointment by hand, from the job: choose who (the customer and anyone else on the job) and how (email, WhatsApp,
 * text). WhatsApp only goes to the customer: their chat is the one the app keeps. Nothing here is automatic.
 */
export type Recipient = { key: string; name: string; role: string | null; email: string | null; mobile: string | null; kind: 'customer' | 'contact' };
export type Channels = { email: boolean; whatsapp: boolean; sms: boolean };
export type Appointment = { startMs: number; endMs: number; surveyType: string; who: string | null; whenText: string };

export async function appointmentOf(projectId: string): Promise<Appointment | null> {
  const b = await liveBookingFor(projectId);
  const r = b ? parseRange(b.onsite) : null;
  if (!b || !r) return null;
  const sv = (await getBookingSettings()).surveyors.find((v) => v.key === b.surveyor_key);
  const { date, time } = dateWords(r.start);
  return { startMs: r.start, endMs: r.end, surveyType: b.survey_type, who: sv?.name ?? null, whenText: `${date} at ${time}` };
}

export async function recipientsOf(projectId: string): Promise<Recipient[]> {
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('enquiry_id, contact_id').eq('id', projectId).maybeSingle();
  if (!p) return [];
  const { data: e } = await db.from('enquiries').select('name, email, phone').eq('id', p.enquiry_id as string).maybeSingle();
  const out: Recipient[] = [{ key: 'customer', name: String(e?.name ?? 'Customer'), role: 'Customer', email: (e?.email as string | null) || null, mobile: (e?.phone as string | null) || null, kind: 'customer' }];
  const seen = new Set<string>();
  const add = (r: Recipient) => {
    if (!seen.has(r.key)) {
      seen.add(r.key);
      out.push(r);
    }
  };
  // The contact the job is dealt with through, then everyone else linked to it.
  if (p.contact_id) {
    const { data: c } = await db.from('crm_contacts').select('id, name, role, mobile, email').eq('id', p.contact_id as string).maybeSingle();
    if (c) add({ key: `contact:${c.id}`, name: c.name as string, role: (c.role as string | null) || 'Main contact', email: (c.email as string | null) || null, mobile: (c.mobile as string | null) || null, kind: 'contact' });
  }
  for (const x of (await listJobPeople(projectId)) ?? []) add({ key: `contact:${x.contact_id}`, name: x.name, role: x.role, email: x.email, mobile: x.mobile, kind: 'contact' });
  return out;
}

export const channelsAvailable = () => ({ email: msConfigured(), whatsapp: whatsappConfigured(), sms: smsConfigured() });

export async function sendAppointmentByHand(x: { projectId: string; enquiryId: string; keys: string[]; channels: Channels; by: { id: string; name: string } }): Promise<string[]> {
  const appt = await appointmentOf(x.projectId);
  if (!appt) return ['There’s no appointment on this job to send.'];
  const all = await recipientsOf(x.projectId);
  const chosen = all.filter((r) => x.keys.includes(r.key));
  if (!chosen.length) return ['Pick who to send it to.'];
  const token = await ensureBookingToken(x.projectId);
  const link = token ? locationUrl(token) : null;
  const { date, time } = dateWords(appt.startMs);
  const me = appt.who ? appt.who.split(/\s+/)[0] : x.by.name;
  const lines: string[] = [];
  for (const r of chosen) {
    const first = greetingName(r.name) || 'there';
    const words = { first, date, time, link: link ?? '', me };
    const done: string[] = [];
    if (x.channels.email) {
      if (!r.email) done.push('no email address');
      else {
        const s = await sendAppointmentEmail({ enquiryId: x.enquiryId, projectId: x.projectId, appointment: { title: surveyTitle(appt.surveyType), startMs: appt.startMs, endMs: appt.endMs, who: appt.who, uid: `${x.projectId}-${appt.startMs}`, locationUrl: link }, byId: x.by.id, to: { name: r.name, email: r.email } });
        done.push(s.sent ? 'email sent' : `email NOT sent: ${s.why}`);
      }
    }
    if (x.channels.whatsapp) {
      if (r.kind !== 'customer') done.push('WhatsApp only goes to the customer');
      else if (!link) done.push('WhatsApp NOT sent: no location link');
      else {
        const w = await sendSystem(x.enquiryId, { text: whatsappText(words), template: 'survey_location', params: [first, date, time, link, me] }, 'appointment-manual');
        done.push(w.ok ? 'WhatsApp sent' : `WhatsApp NOT sent: ${w.error}`);
      }
    }
    if (x.channels.sms) {
      if (!toMsisdn(r.mobile)) done.push('text NOT sent: no UK mobile number');
      else if (!smsConfigured()) done.push('text NOT sent: texts aren’t set up');
      else if (!link) done.push('text NOT sent: no location link');
      else {
        const t = await sendSms(r.mobile as string, smsText(words));
        done.push(t.ok ? 'text sent' : `text NOT sent: ${t.error}`);
      }
    }
    lines.push(`${r.name}: ${done.join(', ') || 'no way chosen'}`);
  }
  await logActivity({ enquiryId: x.enquiryId, projectId: x.projectId, kind: 'system', body: `📲 Appointment ${date} ${time} sent by ${x.by.name}. ${lines.join('. ')}`, byId: x.by.id }).catch(() => null);
  return lines;
}
