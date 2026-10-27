import { HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';

/**
 * The one Heliaxis email template: logo header with the gold bar, the message, an optional button, the accreditations strip
 * and the company details. Every email the system sends comes out in it: the senders (Resend and Microsoft 365) pass anything
 * that is not already in it through brandEmail(). Pure (no server-only import) so tests can use it.
 */
export function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const EMAIL_SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');

/** Brand-styled transactional email shell (inline styles only — email clients). */
export function emailShell(
  title: string,
  bodyHtml: string,
  cta?: { href: string; label: string },
  tag = 'Subcontractor portal',
  /** The note under the company details. Without one: a "personal link" warning when there is a button, nothing special otherwise. */
  footerNote?: string
) {
  const note = footerNote ?? (cta ? "This link is personal to you — please don't forward it." : 'heliaxis.co.uk · You are receiving this email from Heliaxis.');
  return `<!--hx-branded--><!doctype html><html><body style="margin:0;background:#F7F2E7;font-family:Arial,Helvetica,sans-serif;color:#211F18">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2E7;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFDF8;border:1px solid #e4ddcc">
      <tr><td style="background:#F8BC1E;height:5px;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="background:#211F18;padding:24px 26px 20px">
        <img src="${EMAIL_SITE}/assets/heliaxis-logo-light.png" width="176" alt="HELIAXIS" style="display:block;border:0;width:176px;max-width:100%;height:auto;color:#F8BC1E;font-weight:800;font-size:20px;letter-spacing:.08em">
        <div style="color:#bdb6a4;font-size:11px;margin-top:12px;font-family:'Courier New',Courier,monospace;letter-spacing:.12em;text-transform:uppercase">${esc(tag)}</div>
      </td></tr>
      <tr><td style="padding:28px 26px 8px">
        <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3">${esc(title)}</h1>
        <div style="font-size:15px;line-height:1.6">${bodyHtml}</div>
        ${
          cta
            ? `<p style="margin:26px 0 8px"><a href="${esc(cta.href)}" style="display:inline-block;background:#F8BC1E;color:#211F18;font-weight:700;text-decoration:none;padding:13px 22px">${esc(cta.label)}</a></p>
               <p style="font-size:12px;color:#6E6A5E;word-break:break-all">Or paste this link into your browser:<br>${esc(cta.href)}</p>`
            : ''
        }
      </td></tr>
      <tr><td style="background:#211F18;padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:.1em;color:#F8BC1E;text-transform:uppercase">MCS · RECC · NICEIC · TrustMark certified installer</td></tr>
      <tr><td style="padding:18px 26px 24px;font-size:12px;color:#6E6A5E;border-top:1px solid #eee6d4">
        Heliaxis Limited · Company No. ${HELIAXIS_PARTY.companyNumber} · Registered in England &amp; Wales · VAT ${HELIAXIS_PARTY.vatNumber}<br>
        ${esc(note)}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}


const MARK = '<!--hx-branded-->';
export const isBranded = (html?: string | null) => !!html && html.includes(MARK);
const LINK = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/g;

/** Plain text to paragraphs: blank lines split them, line breaks stay, web addresses become links. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(LINK, '<a href="$1" style="color:#8A5600;word-break:break-all">$1</a>').replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** What is inside <body> of a page, without its style sheet, for putting inside the template. */
function bodyOf(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (m ? m[1] : html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!doctype[^>]*>/i, '');
}

/**
 * The branded HTML for any email: already-branded HTML is left alone; other HTML goes inside the template; plain text becomes
 * paragraphs inside it. `tag` is the small line under the logo.
 */
export function brandEmail(o: { subject: string; html?: string | null; text?: string | null; tag?: string }): string {
  if (isBranded(o.html)) return o.html as string;
  const tag = o.tag ?? 'South Wales solar, batteries, heat pumps and EV chargers';
  const inner = o.html ? bodyOf(o.html) : textToHtml(o.text ?? '');
  return emailShell(o.subject, inner, undefined, tag);
}

/** A tidy label/value table for the details of an enquiry or submission. Empty values are left out. */
export function detailRows(rows: [string, string | null | undefined][], href?: Record<string, string>): string {
  const body = rows
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([l, v]) => {
      const link = href?.[l];
      const val = link ? `<a href="${esc(link)}" style="color:#211F18;font-weight:600">${esc(v)}</a>` : esc(v).replace(/\n/g, '<br>');
      return `<tr><td style="padding:7px 16px 7px 0;color:#6E6A5E;font-size:12px;letter-spacing:.04em;text-transform:uppercase;vertical-align:top;white-space:nowrap">${esc(l)}</td><td style="padding:7px 0;font-size:15px">${val}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F7F2E7;border-left:4px solid #F8BC1E;padding:10px 16px;margin:0 0 16px"><tr><td><table role="presentation" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

/** Two or three buttons in a row (stacking on a phone): the first is the main gold one, the others are outlined. `kind: 'whatsapp'` is green. */
export function buttonsHtml(buttons: { href: string; label: string; kind?: 'primary' | 'whatsapp' | 'outline' }[]): string {
  const style = (k: string) =>
    k === 'whatsapp'
      ? 'background:#1B7F4D;color:#FFFFFF;border:2px solid #1B7F4D'
      : k === 'outline'
        ? 'background:#FFFDF8;color:#211F18;border:2px solid #211F18'
        : 'background:#F8BC1E;color:#211F18;border:2px solid #F8BC1E';
  const cells = buttons
    .map((b, i) => `<td class="hx-btn" style="padding:0 ${i === buttons.length - 1 ? 0 : 10}px 10px 0"><a href="${esc(b.href)}" style="display:inline-block;${style(b.kind ?? (i === 0 ? 'primary' : 'outline'))};font-weight:700;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:2px">${esc(b.label)}</a></td>`)
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr>${cells}</tr></table>`;
}
