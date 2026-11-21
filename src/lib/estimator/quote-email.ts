import { buttonsHtml, emailShell, esc } from '@/lib/email-brand';
import { greetingName } from '@/lib/greeting-name';
import { surveyUrl } from './copy';
import type { QuoteFacts } from './quote-facts';
import { whatsappLink } from './whatsapp-link';

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
const yrs = (n: number) => (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');

const tile = (k: string, v: string) =>
  `<td style="width:50%;padding:0 6px 8px 0;vertical-align:top"><div style="background:#FFFDF8;border:1px solid #e4ddcc;padding:10px 12px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6E6A5E;font-family:'Courier New',Courier,monospace">${esc(k)}</div><div style="font-size:17px;font-weight:700;line-height:1.3;margin-top:3px">${esc(v)}</div></div></td>`;

/** The customer's email: the headline figures, the PDF attached, the survey button. Their quote, so it needs no tick box. */
export function quoteEmail(f: QuoteFacts, o: { unsubscribeUrl: string; name: string }): { subject: string; html: string; text: string } {
  const first = greetingName(o.name) || 'there';
  const subject = `Your Heliaxis solar estimate — ${f.reference}`;
  const system = `${f.panels} panels · ${f.kwp.toFixed(2)} kWp${f.inverter ? ` · ${f.inverter}` : ''}${f.batteryName ? ` · ${f.batteryName}` : ''}`;
  const price = `${gbp(f.priceLow)} – ${gbp(f.priceHigh)} ${f.vatLabel}`;
  const save = `about ${gbp(f.saving[0])} – ${gbp(f.saving[1])} a year`;
  const buttons = buttonsHtml([
    { href: surveyUrl(f.reference, f.postcode), label: 'Book my free survey', kind: 'primary' },
    { href: whatsappLink(`Hi Heliaxis, about my estimate ${f.reference}`), label: 'Message us on WhatsApp', kind: 'whatsapp' },
  ]);
  const body = `<p style="margin:0 0 12px">Hi ${esc(first)},</p>
    <p style="margin:0 0 16px">Thanks for using our solar estimator. Your estimate is attached as a PDF, with what is included and what happens next. The headlines:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px"><tr>${tile('Your estimate', price)}${tile('Saving', save)}</tr><tr>${tile('Your system', system)}${tile('Pays for itself in', `${yrs(f.payback[0])} – ${yrs(f.payback[1])} years`)}</tr></table>
    <p style="margin:12px 0 6px;font-weight:700">The next step is a free survey</p>
    <p style="margin:0 0 8px">We look at your roof, shading and electrics, and give you a fixed price in writing. No obligation. We handle the grid application, the design and the paperwork for you.</p>
    ${buttons}
    <p style="margin:8px 0 12px">Questions? Reply to this email, or ring us on <a href="tel:01633965205" style="color:#211F18;font-weight:700">01633 965205</a>. Your reference is <b>${esc(f.reference)}</b>.</p>
    <p style="margin:0 0 12px;font-size:12px;color:#6E6A5E">This is an estimate based on the answers you gave and satellite data. A free survey confirms the final design and price.</p>
    <p style="margin:0 0 14px">Kind regards,<br>The Heliaxis team</p>
    <p style="margin:0;font-size:12px;color:#6E6A5E">You are getting this because you asked for your estimate. We may also send the odd follow-up about your quote and similar products. <a href="${esc(o.unsubscribeUrl)}" style="color:#6E6A5E">Unsubscribe</a>.</p>`;
  const html = emailShell('Your solar estimate', body, undefined, 'South Wales solar, batteries, heat pumps and EV chargers', `heliaxis.co.uk · Your estimate ${f.reference}`);
  const text = [
    `Hi ${first},`,
    '',
    'Thanks for using our solar estimator. Your estimate is attached as a PDF.',
    `Your estimate: ${price}`,
    `Saving: ${save}`,
    `Your system: ${system}`,
    '',
    `Book your free survey: ${surveyUrl(f.reference, f.postcode)}`,
    `Message us on WhatsApp: ${whatsappLink(`Hi Heliaxis, about my estimate ${f.reference}`)}`,
    'Or ring 01633 965205.',
    '',
    `Reference: ${f.reference}`,
    'This is an estimate based on the answers you gave and satellite data. A free survey confirms the final design and price.',
    '',
    'Kind regards,',
    'The Heliaxis team',
    '',
    `Unsubscribe from follow-ups: ${o.unsubscribeUrl}`,
  ].join('\n');
  return { subject, html, text };
}
