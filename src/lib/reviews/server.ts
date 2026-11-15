import 'server-only';
import { randomBytes } from 'node:crypto';
import { greetingName } from '@/lib/greeting-name';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { siteUrl } from '@/lib/crm/server';
import { msConfigured, sendMail } from '@/lib/ms365';
import { emailShell, esc } from '@/lib/email-brand';
import { cleanReviewSettings, fillTemplate, reviewLink, type ReviewRequestRow, type ReviewSettings } from './shared';

type Db = ReturnType<typeof createAdminClient>;
const KEY = 'review-settings';

export async function readReviewSettings(db: Db = createAdminClient()): Promise<ReviewSettings> {
  try {
    const { data } = await db.from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    return cleanReviewSettings(parseKv<ReviewSettings>(data?.value));
  } catch {
    return cleanReviewSettings({});
  }
}
export async function writeReviewSettings(db: Db, v: unknown): Promise<ReviewSettings> {
  const s = cleanReviewSettings(v);
  await db.from('cms_kv').upsert({ key: KEY, value: toKv(s), updated_at: new Date().toISOString() });
  return s;
}

export const newReviewToken = () => randomBytes(18).toString('base64url');
export const TOKEN = /^[A-Za-z0-9_-]{16,40}$/;

export async function readRequestByToken(db: Db, token: string): Promise<ReviewRequestRow | null> {
  if (!TOKEN.test(token)) return null;
  const { data } = await db.from('review_requests').select('*').eq('token', token).maybeSingle();
  return (data as ReviewRequestRow | null) ?? null;
}

/** The words that go out: what the customer reads in an email, a text or a WhatsApp message. */
export function messageFor(s: ReviewSettings, first: string, link: string) {
  return { subject: fillTemplate(s.emailSubject, { first, link }), body: fillTemplate(s.emailBody, { first, link }), sms: fillTemplate(s.smsText, { first, link }) };
}

export async function sendReviewEmail(to: string, first: string, link: string, s: ReviewSettings): Promise<void> {
  if (!msConfigured()) throw new Error('Email isn’t set up on this system.');
  const m = messageFor(s, first, link);
  const body = `<p>Hi ${esc(first)},</p>${m.body
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')}`;
  const html = emailShell(m.subject, body, { href: link, label: 'Share your feedback' }, 'Your project', 'You are receiving this because Heliaxis installed or surveyed for you. Reply to this email if you would like to talk to us.');
  await sendMail({ to, subject: m.subject, text: `Hi ${first},\n\n${m.body}\n\n${link}`, html });
}

export const firstNameOf = (name: string) => greetingName(name) || name.split(/\s+/)[0] || '';
export { reviewLink, siteUrl };
