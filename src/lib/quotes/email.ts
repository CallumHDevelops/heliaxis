import 'server-only';
import { emailShell, esc } from '@/lib/subcontractors/server';

const para = (p: string) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`;

/**
 * The branded email: Heliaxis header, the message, a button to the portal, then the sign-off ("Kind regards…") and
 * the company footer. A closing paragraph that starts "Kind regards" or "Yours" goes after the button.
 */
export function quoteEmailHtml(message: string, url: string): string {
  const blocks = message.trim().split(/\n{2,}/).filter(Boolean);
  const i = blocks.findIndex((b) => /^(kind regards|best wishes|yours|many thanks|thanks)/i.test(b.trim()));
  const before = i >= 0 ? blocks.slice(0, i) : blocks;
  const after = i >= 0 ? blocks.slice(i) : [];
  const button = `<p style="margin:22px 0 8px"><a href="${esc(url)}" style="display:inline-block;background:#F8BC1E;color:#211F18;font-weight:700;text-decoration:none;padding:13px 22px">View your quote</a></p><p style="font-size:12px;color:#6E6A5E;word-break:break-all;margin:0 0 20px">Or paste this link into your browser:<br>${esc(url)}</p>`;
  return emailShell('Your quote is ready', before.map(para).join('') + button + after.map(para).join(''), undefined, 'Your quote');
}
