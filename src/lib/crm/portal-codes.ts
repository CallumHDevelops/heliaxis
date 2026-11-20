import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Db } from '@/lib/site/server';
import { msConfigured, sendMail } from '@/lib/ms365';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { emailShell, esc } from '@/lib/email-brand';
import { customerPortalOrigin } from './portal-url';
import { siteUrl } from './server';

/**
 * The second step of signing in to the customer portal: a 6-digit code sent to the mobile or email
 * already on the job (never one typed into the form), so knowing someone's postcode and surname isn't
 * enough. A code is made with the system's secure random source, only a keyed hash of it is stored
 * (supabase/portal-login-codes.sql), and it lasts 10 minutes, allows 5 tries and works once. Asking for
 * a new one ends the old. The browser holds only the challenge's id, in an httpOnly cookie.
 */

export const CODE_COOKIE = 'hx_my_code';
export const CODE_MINUTES = 10;
export const MAX_TRIES = 5;
/** Codes one job can be sent in 15 minutes, and one connection in an hour. */
const PER_JOB = 4;
const PER_IP = 8;

export type Channel = 'sms' | 'email';
export type Contact = { name: string; email: string | null; mobile: string | null };

const secret = () => process.env.PORTAL_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
/** The code, keyed to its challenge: a stolen hash can't be reused elsewhere, nor guessed offline without the secret. */
const hashOf = (id: string, code: string) => createHmac('sha256', secret()).update(`${id}:${code}`).digest('hex');

/** "j•••@gmail.com". */
export const maskEmail = (e: string) => {
  const [user, domain] = e.split('@');
  return `${(user ?? '').slice(0, 1)}•••@${domain ?? ''}`;
};
/** "07••• •••123". */
export const maskMobile = (m: string) => {
  const n = toMsisdn(m) ?? '';
  return `07••• •••${n.slice(-3)}`;
};

/** The ways this job can be sent a code: a UK mobile (when texts are set up) and an email (when mail is). */
export function channelsFor(c: Contact): { kind: Channel; to: string }[] {
  const out: { kind: Channel; to: string }[] = [];
  if (c.mobile && toMsisdn(c.mobile) && smsConfigured()) out.push({ kind: 'sms', to: maskMobile(c.mobile) });
  if (c.email && /.+@.+\..+/.test(c.email) && msConfigured()) out.push({ kind: 'email', to: maskEmail(c.email) });
  return out;
}

/** The customer's email and mobile: the enquiry's, else the contact the job is linked to. */
export async function contactFor(db: Db, job: { enquiry_id: unknown; contact_id?: unknown }): Promise<Contact> {
  const [{ data: e }, { data: k }] = await Promise.all([
    db.from('enquiries').select('name, email, phone').eq('id', String(job.enquiry_id)).maybeSingle(),
    job.contact_id ? db.from('crm_contacts').select('name, email, mobile').eq('id', String(job.contact_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    name: s(e?.name) ?? s(k?.name) ?? '',
    email: s(e?.email) ?? s(k?.email),
    mobile: (toMsisdn(s(e?.phone)) ? s(e?.phone) : null) ?? (toMsisdn(s(k?.mobile)) ? s(k?.mobile) : null),
  };
}

/** Too many codes asked for lately (this job, or this connection)? */
export async function tooMany(db: Db, projectId: string, ip: string | null): Promise<boolean> {
  const since15 = new Date(Date.now() - 15 * 60_000).toISOString();
  const since60 = new Date(Date.now() - 60 * 60_000).toISOString();
  const [{ count: job }, { count: conn }] = await Promise.all([
    db.from('portal_login_codes').select('id', { count: 'exact', head: true }).eq('project_id', projectId).gte('created_at', since15),
    ip ? db.from('portal_login_codes').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since60) : Promise.resolve({ count: 0 }),
  ]);
  return (job ?? 0) >= PER_JOB || (conn ?? 0) >= PER_IP;
}

/**
 * Make a code, end any older one for the job, store its hash and send it. Returns the challenge id
 * (for the cookie) and where it went, or why it couldn't be sent.
 */
export async function sendCode(db: Db, o: { projectId: string; contact: Contact; channel: Channel; ip: string | null }): Promise<{ ok: true; id: string; to: string } | { ok: false; error: string }> {
  const to = o.channel === 'sms' ? o.contact.mobile : o.contact.email;
  if (!to) return { ok: false, error: 'We don’t have that for you. Try the other way, or call us.' };
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const masked = o.channel === 'sms' ? maskMobile(to) : maskEmail(to);
  // Only one live code per job.
  await db.from('portal_login_codes').update({ used_at: new Date().toISOString() }).eq('project_id', o.projectId).is('used_at', null);
  const { data: row, error } = await db
    .from('portal_login_codes')
    .insert({ project_id: o.projectId, code_hash: 'pending', channel: o.channel, sent_to: masked, expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(), ip: o.ip })
    .select('id')
    .single();
  if (error || !row) return { ok: false, error: 'Couldn’t send a code just now. Please try again, or use the link we sent you.' };
  const id = String(row.id);
  await db.from('portal_login_codes').update({ code_hash: hashOf(id, code) }).eq('id', id);

  const first = o.contact.name.split(/\s+/)[0] || 'there';
  if (o.channel === 'sms') {
    // The last line lets Android fill the code in by itself (WebOTP); iPhone offers it from the keyboard.
    const host = customerPortalOrigin(siteUrl()).replace(/^https?:\/\//, '').split('/')[0];
    const r = await sendSms(to, `Your Heliaxis code is ${code}. It lasts ${CODE_MINUTES} minutes. Don’t share it: we will never ask you for it.\n\n@${host} #${code}`, 'portal-code');
    if (!r.ok) return { ok: false, error: 'We couldn’t send a text just now. Try email instead, or call us.' };
  } else {
    try {
      const html = emailShell(
        'Your Heliaxis sign-in code',
        `<p>Hi ${esc(first)},</p><p>Your code to open your Heliaxis project is:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:12px 0">${code}</p><p>It lasts ${CODE_MINUTES} minutes. If you didn’t ask for it, you can ignore this email: nobody can open your project without it.</p>`,
        undefined,
        'Your project'
      );
      await sendMail({ to, subject: `${code} is your Heliaxis code`, text: `Hi ${first},\n\nYour code to open your Heliaxis project is ${code}. It lasts ${CODE_MINUTES} minutes.\n\nIf you didn’t ask for it, you can ignore this email.`, html });
    } catch {
      return { ok: false, error: 'We couldn’t send an email just now. Try a text instead, or call us.' };
    }
  }
  return { ok: true, id, to: masked };
}

/** Check a typed code against its challenge. A right code is used up; a wrong one counts towards the 5 tries. */
export async function checkCode(db: Db, id: string, typed: string): Promise<{ ok: true; projectId: string } | { ok: false; error: string; dead?: boolean }> {
  const { data: c } = await db.from('portal_login_codes').select('*').eq('id', id).maybeSingle();
  if (!c || c.used_at) return { ok: false, error: 'That code has been used or replaced. Ask for a new one.', dead: true };
  if (Date.parse(String(c.expires_at)) < Date.now()) return { ok: false, error: 'That code has run out. Ask for a new one.', dead: true };
  if (Number(c.attempts) >= MAX_TRIES) return { ok: false, error: 'Too many wrong tries. Ask for a new code.', dead: true };
  const code = typed.replace(/\D/g, '');
  const a = Buffer.from(hashOf(id, code), 'hex');
  const b = Buffer.from(String(c.code_hash), 'hex');
  const right = code.length === 6 && a.length === b.length && timingSafeEqual(a, b);
  if (!right) {
    const tries = Number(c.attempts) + 1;
    await db.from('portal_login_codes').update({ attempts: tries }).eq('id', id);
    const left = MAX_TRIES - tries;
    return left > 0 ? { ok: false, error: `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` } : { ok: false, error: 'Too many wrong tries. Ask for a new code.', dead: true };
  }
  // Used once, and only if nobody else used it in the same instant.
  const { data: used } = await db.from('portal_login_codes').update({ used_at: new Date().toISOString() }).eq('id', id).is('used_at', null).select('id');
  if (!used?.length) return { ok: false, error: 'That code has been used. Ask for a new one.', dead: true };
  return { ok: true, projectId: String(c.project_id) };
}
