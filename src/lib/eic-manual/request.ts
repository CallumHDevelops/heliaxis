import 'server-only';
import { randomBytes } from 'node:crypto';
import { sendMail } from '@/lib/ms365';
import { siteUrl } from '@/lib/crm/server';
import { emailShell, esc } from '@/lib/subcontractors/server';
import type { Db, EicRow, InfoRequest } from './server';

/** An unguessable link for one request: 24 random bytes. */
export const newToken = () => randomBytes(24).toString('base64url');
export const fillUrl = (token: string) => `${siteUrl()}/eic/fill/${token}`;
export const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/** The certificate a personal link belongs to, or null (a wrong or withdrawn link). */
export async function readByToken(db: Db, token: string): Promise<EicRow | null> {
  if (!TOKEN.test(token)) return null;
  const { data } = await db.from('eic_manual').select('*').eq('request->>token', token).maybeSingle();
  return (data as EicRow | null) ?? null;
}

/** The email asking the installer to fill it in: what it is, for whom and where, and the button. */
export async function sendRequest(row: EicRow, req: InfoRequest, opt: { customer: string | null; address: string; from: string }): Promise<void> {
  const first = req.name.split(/\s+/)[0] || 'there';
  const lines = [opt.customer ? `For: ${opt.customer}` : null, opt.address ? `Address: ${opt.address}` : null, `Certificate: ${row.number}`].filter(Boolean) as string[];
  const body = [
    `<p>Hi ${esc(first)},</p>`,
    `<p>${esc(opt.from || 'Heliaxis')} would like you to fill in the details for an Electrical Installation Certificate. It takes a few minutes: one question at a time, on your phone or computer, and nothing to log in to.</p>`,
    `<p style="margin:0 0 14px;padding:10px 12px;border-left:3px solid #F8BC1E;background:#F7F2E7">${lines.map(esc).join('<br>')}</p>`,
    req.message.trim() ? `<p>${esc(req.message.trim()).replace(/\n/g, '<br>')}</p>` : '',
    `<p>You’ll be asked for the supply details, the inspections, each circuit’s details and test results, and your signature. Press Send when you’re done and we’ll be told.</p>`,
  ].join('');
  const html = emailShell(`Please fill in an EIC (${row.number})`, body, { href: fillUrl(req.token), label: 'Fill in the certificate' }, 'Electrical certificate', 'This link is for you only, so please don’t forward it. Reply to this email if you’d rather talk it through.');
  const text = `Hi ${first},\n\n${opt.from || 'Heliaxis'} would like you to fill in the details for an Electrical Installation Certificate (${row.number}).\n${lines.join('\n')}\n\n${req.message.trim() ? `${req.message.trim()}\n\n` : ''}Open it here: ${fillUrl(req.token)}\n\nThis link is for you only, so please don’t forward it.`;
  await sendMail({ to: req.email, subject: `Please fill in an EIC (${row.number})`, text, html });
}
