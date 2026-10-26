/**
 * Turning a WhatsApp message into an email, for a customer whose WhatsApp message could not be delivered
 * (no WhatsApp on that number, or they have blocked it). The words are the same; WhatsApp-only parts
 * (quick-reply button labels) come out and a plain company footer goes on.
 */

/** A line made only of [button labels], the quick replies a WhatsApp template shows under its text. */
const BUTTON_LINE = /^\s*(\[[^\]\n]{1,40}\]\s*)+$/;

export function emailBodyFromWhatsApp(text: string): string {
  return String(text || '')
    .split('\n')
    .filter((l) => !BUTTON_LINE.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Shown under every fallback email: who we are and that replying reaches us (it lands in the customer's CRM log). */
export function emailFooter(mailbox: string): string {
  return [
    '--',
    'Heliaxis | Solar, battery storage, heat pumps and EV charging | South Wales',
    `${mailbox || 'hello@heliaxis.co.uk'} | https://heliaxis.co.uk`,
    '',
    'We tried to reach you on WhatsApp, so we are emailing instead. Just reply to this email and it comes straight to us.',
  ].join('\n');
}

export const emailSubjectFor = (name: string) => `${name.split(/\s+/)[0] ? `${name.split(/\s+/)[0]}, ` : ''}a message from Heliaxis`;
