import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { msConfigured, sendMail } from '@/lib/ms365';
import { emailShell, esc } from '@/lib/subcontractors/server';

/**
 * The "we have your request" email to whoever filled in a form on the site. It goes from the Heliaxis mailbox (so it is in
 * Sent Items, and their reply lands where the team already works) and is logged against the enquiry in the CRM.
 */
export type ReceiptInput = {
  name: string;
  email: string;
  postcode?: string;
  interest?: string;
  source?: string;
  /** The solar estimator's own summary line, when they came from it. */
  message?: string;
};

const firstName = (n: string) => n.trim().split(/\s+/)[0] || 'there';

/** "4.50 kWp (10 panels), about 3,993 kWh a year, saving about £950 a year, indicative cost £12,500, payback about 12 years" from the estimator's message. */
export function estimateLine(message?: string): string | null {
  const m = (message ?? '').match(/^Solar estimator: ([\s\S]+?)\. Uses /);
  return m ? m[1].replace(/\.\s+About /, ', about ') : null;
}

const row = (label: string, value: string) => `<tr><td style="padding:6px 14px 6px 0;color:#6E6A5E;font-size:13px;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0;font-size:14px">${esc(value)}</td></tr>`;

export function enquiryReceiptEmail(i: ReceiptInput): { subject: string; html: string; text: string } {
  const survey = i.source === 'solar-estimator';
  const what = survey ? 'survey request' : 'enquiry';
  const subject = `We’ve received your ${what} | Heliaxis`;
  const est = estimateLine(i.message);
  const rows = [i.postcode ? row('Where', i.postcode) : '', i.interest ? row('Interested in', i.interest) : '', est ? row('Your estimate', est) : ''].join('');
  const steps = [
    ['We call you', 'A member of the team will ring within one working day to talk it through and find a time that suits you.'],
    ['A free survey', 'We look at your roof, shading and electrics, so the price is based on your home, not a guess.'],
    ['A fixed price', 'You get a clear quote in writing. No obligation and no pushy sales.'],
  ]
    .map(([t, d], n) => `<tr><td style="padding:0 14px 12px 0;vertical-align:top"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;background:#F8BC1E;color:#211F18;font-weight:800;font-size:13px">${n + 1}</span></td><td style="padding:0 0 12px;font-size:14px;line-height:1.5"><b>${esc(t)}</b><br><span style="color:#4d493d">${esc(d)}</span></td></tr>`)
    .join('');
  const body = `<p style="margin:0 0 12px">Hi ${esc(firstName(i.name))},</p>
    <p style="margin:0 0 16px">Thanks for getting in touch. We have your ${what} and a real person is on it.</p>
    ${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F7F2E7;padding:10px 16px;margin:0 0 20px"><tr><td><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>` : ''}
    <p style="margin:0 0 10px;font-weight:700">What happens next</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px">${steps}</table>
    <p style="margin:16px 0 12px">Anything to add, or a better time to call? Just reply to this email, or ring us on <a href="tel:01633965205" style="color:#211F18;font-weight:700">01633 965205</a> (Mon–Fri 8am–6pm, weekends 10am–3pm).</p>
    <p style="margin:0 0 4px">Kind regards,<br>The Heliaxis team</p>`;
  const html = emailShell(`We’ve received your ${what}`, body, undefined, 'South Wales solar, batteries, heat pumps and EV chargers', 'MCS-certified installer · heliaxis.co.uk · You are receiving this because you sent us a request on our website.');
  const text = [
    `Hi ${firstName(i.name)},`,
    '',
    `Thanks for getting in touch. We have your ${what} and a real person is on it.`,
    i.postcode ? `Where: ${i.postcode}` : '',
    i.interest ? `Interested in: ${i.interest}` : '',
    est ? `Your estimate: ${est}` : '',
    '',
    'What happens next:',
    '1. We call you within one working day.',
    '2. A free survey of your roof, shading and electrics.',
    '3. A fixed price in writing. No obligation, no pushy sales.',
    '',
    'Anything to add? Reply to this email or ring 01633 965205 (Mon-Fri 8am-6pm, weekends 10am-3pm).',
    '',
    'Kind regards,',
    'The Heliaxis team',
  ]
    .filter((l, n, a) => l !== '' || a[n - 1] !== '')
    .join('\n');
  return { subject, html, text };
}

/**
 * Sends it, once per address per hour (a form sent twice, or someone typing another person's address again and again, does not
 * mean more mail). Never throws: a failed receipt must never fail the enquiry. Returns why it did not send, if it did not.
 */
export async function sendEnquiryReceipt(enquiryId: string | null, i: ReceiptInput): Promise<{ sent: boolean; why?: string }> {
  try {
    const to = i.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) return { sent: false, why: 'no valid email' };
    if (!msConfigured()) return { sent: false, why: 'Microsoft 365 is not connected' };
    const db = createAdminClient();
    const mail = enquiryReceiptEmail(i);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await db.from('crm_emails').select('id').ilike('to_address', to).eq('direction', 'out').like('subject', 'We’ve received your%').gte('at', since).limit(1);
    if (recent?.length) return { sent: false, why: 'already sent in the last hour' };
    const graphId = await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html });
    if (enquiryId) await db.from('crm_emails').insert({ enquiry_id: enquiryId, graph_id: graphId, direction: 'out', subject: mail.subject, body: mail.text.slice(0, 4000), from_address: process.env.MS_MAILBOX, to_address: to, attachments: [], at: new Date().toISOString() });
    return { sent: true };
  } catch (e) {
    return { sent: false, why: e instanceof Error ? e.message : 'failed' };
  }
}
