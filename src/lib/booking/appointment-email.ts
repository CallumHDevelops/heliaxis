import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { msConfigured, sendMail } from '@/lib/ms365';
import { greetingName } from '@/lib/greeting-name';
import { buttonsHtml, emailShell, esc } from '@/lib/email-brand';
import { logActivity } from '@/lib/crm/server';
import { minutesWords, surveyTypeLabel } from '@/lib/crm/stages';
import { ukDate, ukTime } from './engine';

/**
 * The "your appointment" email to the customer, from the Heliaxis mailbox, with a calendar file (.ics) that adds it to their
 * diary. Sent when staff book a time (including one already agreed by phone or WhatsApp), logged on the customer's record.
 */
export type AppointmentInput = {
  name: string;
  /** What it is: "Solar panels and battery survey". */
  title: string;
  startMs: number;
  endMs: number;
  address?: string | null;
  postcode?: string | null;
  who?: string | null;
  notes?: string | null;
  uid: string;
  /** The "check the pin" page for this booking. */
  locationUrl?: string | null;
};

const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Tuesday 3 November" from a UK date (yyyy-mm-dd). */
const longDayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MON_LONG[d.getUTCMonth()]}`;
};
const firstName = (n: string) => greetingName(n) || 'there';
const row = (label: string, value: string) => `<tr><td style="padding:6px 16px 6px 0;color:#6E6A5E;font-size:13px;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0;font-size:15px;font-weight:600">${esc(value)}</td></tr>`;

/** UTC "20261103T104500Z". */
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Lines over 75 characters are folded, as the format asks. */
const fold = (line: string) => (line.length <= 74 ? line : line.match(/.{1,73}/g)!.join('\r\n '));

export function appointmentIcs(i: AppointmentInput, organiser?: string): string {
  const where = [i.address, i.postcode].filter(Boolean).join(', ');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Heliaxis//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${i.uid}@heliaxis.co.uk`,
    `DTSTAMP:${icsTime(Date.now())}`,
    `DTSTART:${icsTime(i.startMs)}`,
    `DTEND:${icsTime(i.endMs)}`,
    `SUMMARY:${icsText(`Heliaxis: ${i.title}`)}`,
    where ? `LOCATION:${icsText(where)}` : '',
    `DESCRIPTION:${icsText(`${i.title} with Heliaxis.${i.who ? ` ${i.who} will be with you.` : ''} To change it, reply to our email or call 01633 965205.`)}`,
    organiser ? `ORGANIZER;CN=Heliaxis:mailto:${organiser}` : '',
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Heliaxis appointment in one hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .map(fold)
    .join('\r\n') + '\r\n'
}

export function appointmentEmail(i: AppointmentInput): { subject: string; html: string; text: string } {
  const day = ukDate(i.startMs);
  const when = `${longDayLabel(day)}, ${ukTime(i.startMs)} to ${ukTime(i.endMs)}`;
  const where = [i.address, i.postcode].filter(Boolean).join(', ');
  const subject = `Your Heliaxis ${i.title.toLowerCase().includes('survey') ? 'survey' : 'appointment'}: ${longDayLabel(day)}, ${ukTime(i.startMs)}`;
  const rows = [row('When', when), where ? row('Where', where) : '', i.who ? row('Who', `${i.who} from Heliaxis`) : '', row('What', i.title)].join('');
  const survey = /survey/i.test(i.title);
  const body = `<p style="margin:0 0 12px">Hi ${esc(firstName(i.name))},</p>
    <p style="margin:0 0 16px">${survey ? 'Your free survey is booked.' : 'Your appointment is booked.'} Here are the details.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F7F2E7;padding:12px 16px;margin:0 0 18px;border-left:4px solid #F8BC1E"><tr><td><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>
    ${i.notes ? `<p style="margin:0 0 16px">${esc(i.notes).replace(/\n/g, '<br>')}</p>` : ''}
    ${survey ? `<p style="margin:0 0 6px;font-weight:700">What to expect</p><p style="margin:0 0 16px;color:#4d493d">We look at your roof, shading, electrics and meter, and talk through what suits you. You get a fixed price in writing afterwards. No obligation and no pushy sales.</p>` : ''}
    ${i.locationUrl ? `<p style="margin:0 0 6px">Could you check the pin location, and confirm it, so we can find you first time around?</p>${buttonsHtml([{ href: i.locationUrl, label: 'Check the pin on the map', kind: 'primary' }])}` : ''}
    <p style="margin:0 0 16px">The attached calendar file adds it to your diary.</p>
    <p style="margin:0 0 12px">Need to change the time? Just reply to this email, or ring us on <a href="tel:01633965205" style="color:#211F18;font-weight:700">01633 965205</a> and we’ll sort it.</p>
    <p style="margin:0 0 4px">Kind regards,<br>The Heliaxis team</p>`;
  const html = emailShell(survey ? 'Your survey is booked' : 'Your appointment is booked', body, undefined, 'South Wales solar, batteries, heat pumps and EV chargers', 'heliaxis.co.uk · You are receiving this because we have booked an appointment with you.');
  const text = [
    `Hi ${firstName(i.name)},`,
    '',
    survey ? 'Your free survey is booked.' : 'Your appointment is booked.',
    '',
    `When: ${when}`,
    where ? `Where: ${where}` : '',
    i.who ? `Who: ${i.who} from Heliaxis` : '',
    `What: ${i.title}`,
    i.notes ? `\n${i.notes}` : '',
    '',
    i.locationUrl ? `Please check the pin location and confirm it, so we can find you first time: ${i.locationUrl}` : '',
    'The attached calendar file adds it to your diary.',
    'Need to change the time? Reply to this email or ring 01633 965205.',
    '',
    'Kind regards,',
    'The Heliaxis team',
  ]
    .filter((l, n, a) => l !== '' || a[n - 1] !== '')
    .join('\n');
  return { subject, html, text };
}

/** Title for a survey booking: "Solar panels and battery survey". */
export const surveyTitle = (type: string) => `${surveyTypeLabel(type)} survey (${minutesWords(type === 'solar_ashp' ? 90 : 60)})`;

export type SendResult = { sent: boolean; to?: string; why?: string };

/** Emails the customer their appointment (with the .ics) and logs it. Never throws. */
export async function sendAppointmentEmail(x: { enquiryId: string; projectId: string | null; appointment: Omit<AppointmentInput, 'name' | 'address' | 'postcode'>; byId?: string | null }): Promise<SendResult> {
  try {
    if (!msConfigured()) return { sent: false, why: 'Microsoft 365 isn’t connected, so email can’t be sent.' };
    const db = createAdminClient();
    const { data: e } = await db.from('enquiries').select('name, email').eq('id', x.enquiryId).maybeSingle();
    const to = String(e?.email ?? '').trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) return { sent: false, why: 'No email address on the customer’s record.' };
    let address: string | null = null;
    let postcode: string | null = null;
    if (x.projectId) {
      const { data: p } = await db.from('crm_projects').select('address, postcode').eq('id', x.projectId).maybeSingle();
      address = (p?.address as string | null) ?? null;
      postcode = (p?.postcode as string | null) ?? null;
    }
    const i: AppointmentInput = { ...x.appointment, name: String(e?.name ?? ''), address, postcode };
    const mail = appointmentEmail(i);
    const ics = appointmentIcs(i, process.env.MS_MAILBOX);
    const graphId = await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html, attachments: [{ name: 'heliaxis-appointment.ics', contentType: 'text/calendar', bytes: new TextEncoder().encode(ics) }] });
    await db.from('crm_emails').insert({ enquiry_id: x.enquiryId, project_id: x.projectId, graph_id: graphId, direction: 'out', subject: mail.subject, body: mail.text.slice(0, 4000), from_address: process.env.MS_MAILBOX, to_address: to, sent_by: x.byId ?? null, attachments: [], at: new Date().toISOString() });
    await logActivity({ enquiryId: x.enquiryId, projectId: x.projectId, kind: 'system', body: `✉️ Appointment email sent to ${to}: ${longDayLabel(ukDate(i.startMs))}, ${ukTime(i.startMs)}`, byId: x.byId ?? null }).catch(() => null);
    return { sent: true, to };
  } catch (err) {
    return { sent: false, why: err instanceof Error ? err.message : 'Email not sent' };
  }
}
