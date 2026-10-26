import 'server-only';
import { emailShell, esc } from '@/lib/subcontractors/server';

/** The branded email: Heliaxis header, the message in paragraphs, a button to the portal, the company footer. */
export function quoteEmailHtml(message: string, url: string): string {
  const paras = message
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return emailShell('Your quote is ready', paras, { href: url, label: 'View your quote' }, 'Your quote');
}
