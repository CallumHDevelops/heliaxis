import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { createClient, type User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailShell, esc, sendEmail } from '@/lib/subcontractors/server';

/**
 * One tap from the Heliaxis menu into RAMS, already signed in. RAMS is a separate app with its
 * own Supabase project, so it can't see our session. Instead we ask RAMS's Supabase for a
 * one-time sign-in link for the same person and send the browser to RAMS's own /auth/callback,
 * which accepts a token_hash and sets its session (no change to RAMS needed).
 *
 * Two guards. Heliaxis sign-ups don't confirm email addresses, so someone could register with
 * a colleague's address; one-tap sign-in therefore waits until the person has proved the address
 * is theirs, once, by typing in a code emailed to it (supabase/sso.sql). And only an APPROVED RAMS account whose sign-in email
 * matches gets a link; anyone else just lands on RAMS as before.
 * Needs RAMS_SUPABASE_URL and RAMS_SUPABASE_SERVICE_ROLE_KEY.
 */

export const RAMS_ORIGIN = 'https://rams.heliaxis.co.uk';

export function ramsSsoConfigured() {
  return !!(process.env.RAMS_SUPABASE_URL && process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY);
}

/** Only paths inside RAMS: "/operatives?team=heliaxis" yes, "//evil.com" or "https://…" no. */
export function safeRamsPath(next: string | null): string {
  if (!next) return '/';
  try {
    const u = new URL(next, RAMS_ORIGIN);
    return u.origin === RAMS_ORIGIN && u.pathname !== '/auth/callback' ? `${u.pathname}${u.search}` : '/';
  } catch {
    return '/';
  }
}

const norm = (email: string | null | undefined) => email?.trim().toLowerCase() || '';

/* ── Proving the email address is theirs ──────────────────────────────────────────────── */

const CODE_TTL_MS = 15 * 60_000;
const RESEND_AFTER_MS = 2 * 60_000;
const MAX_TRIES = 5;

function codeHash(userId: string, code: string) {
  const s = process.env.APP_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('No secret for sign-in codes');
  return createHmac('sha256', s).update(`sso-code:${userId}:${code}`).digest('hex');
}

/** Has this person proved their current sign-in email (sso.sql)? */
export async function emailProven(user: User): Promise<boolean> {
  const email = norm(user.email);
  if (!email) return false;
  const { data, error } = await createAdminClient().from('sso_email_proofs').select('email').eq('user_id', user.id).maybeSingle();
  return !error && norm(data?.email) === email;
}

export type CodeResult = 'ok' | 'wrong' | 'expired' | 'locked' | 'wait' | 'failed' | 'setup';

/**
 * Email a 6-digit code to their sign-in address. It only counts when typed back in by the same
 * signed-in person, so a link scanner or someone else's inbox can't prove it for them.
 */
export async function sendProofCode(user: User, name: string): Promise<CodeResult> {
  const email = norm(user.email);
  if (!email) return 'failed';
  const db = createAdminClient();
  const { data: last, error } = await db.from('sso_email_codes').select('sent_at').eq('user_id', user.id).maybeSingle();
  if (error) return /relation|does not exist/i.test(error.message) ? 'setup' : 'failed';
  if (last && Date.now() - new Date(last.sent_at).getTime() < RESEND_AFTER_MS) return 'wait';

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error: saveErr } = await db.from('sso_email_codes').upsert({
    user_id: user.id,
    email,
    code_hash: codeHash(user.id, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sent_at: new Date().toISOString(),
  });
  if (saveErr) return 'failed';

  const who = name ? `${name} (${email})` : email;
  const sent = await sendEmail({
    to: email,
    from: 'Heliaxis <noreply@heliaxis.co.uk>',
    subject: `${code} is your Heliaxis code`,
    text: `Your code is ${code}

Someone signed in to Heliaxis as ${who} asked to open RAMS without signing in again. If that's you, type this code into the Heliaxis app. It works for 15 minutes.

If it isn't you, don't share the code with anyone, and tell Callum.`,
    html: emailShell(
      'Your code',
      `<p style="font-size:30px;font-weight:800;letter-spacing:.3em;margin:18px 0">${esc(code)}</p>
       <p>Someone signed in to Heliaxis as <b>${esc(who)}</b> asked to open RAMS without signing in again. If that’s you, type this code into the Heliaxis app. It works for 15 minutes.</p>
       <p style="font-size:13px;color:#6E6A5E">If it isn’t you, don’t share the code with anyone, and tell Callum.</p>`,
      undefined,
      'Account'
    ),
  });
  return sent.ok ? 'ok' : 'failed';
}

/** Check a typed code; on success the address counts as theirs from now on. */
export async function checkProofCode(user: User, typed: string): Promise<CodeResult> {
  const email = norm(user.email);
  const code = typed.replace(/\D/g, '');
  const db = createAdminClient();
  const { data: row, error } = await db
    .from('sso_email_codes')
    .select('email, code_hash, expires_at, attempts')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return /relation|does not exist/i.test(error.message) ? 'setup' : 'failed';
  if (!row || row.email !== email || new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  if (row.attempts >= MAX_TRIES) return 'locked';

  const expected = Buffer.from(row.code_hash);
  const given = Buffer.from(code.length === 6 ? codeHash(user.id, code) : '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await db.from('sso_email_codes').update({ attempts: row.attempts + 1 }).eq('user_id', user.id);
    return row.attempts + 1 >= MAX_TRIES ? 'locked' : 'wrong';
  }
  const { error: saveErr } = await db
    .from('sso_email_proofs')
    .upsert({ user_id: user.id, email, proven_at: new Date().toISOString() });
  if (saveErr) return 'failed';
  await db.from('sso_email_codes').delete().eq('user_id', user.id);
  return 'ok';
}

/* ── The RAMS link ─────────────────────────────────────────────────────────────────────── */

/** Where to send this person: a signed-in link when we can make one, else RAMS's normal door. */
export async function ramsLink(email: string | null | undefined, next: string): Promise<string> {
  const plain = `${RAMS_ORIGIN}${next}`;
  const address = norm(email);
  if (!address || !ramsSsoConfigured()) return plain;
  try {
    const rams = createClient(process.env.RAMS_SUPABASE_URL!, process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Narrow by the profile's copy of the email (LIKE wildcards escaped), then check the account itself.
    const like = address.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: people } = await rams.from('profiles').select('id, email, status').ilike('email', like).limit(5);
    const approved = (people ?? []).filter((p) => p.status === 'approved' && norm(p.email) === address);
    if (approved.length !== 1) return plain;

    // RAMS only copies the email onto profiles at sign-up; the auth record is the truth.
    const { data: found } = await rams.auth.admin.getUserById(approved[0].id);
    const authEmail = found?.user?.email;
    if (!authEmail || norm(authEmail) !== address) return plain;

    // magiclink for an existing account only (it would otherwise create one).
    const { data, error } = await rams.auth.admin.generateLink({ type: 'magiclink', email: authEmail });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash || data.properties.verification_type !== 'magiclink') {
      if (error) console.error('[sso] RAMS link failed', error.message);
      return plain;
    }
    const q = new URLSearchParams({ token_hash: tokenHash, type: 'magiclink', next });
    return `${RAMS_ORIGIN}/auth/callback?${q}`;
  } catch (e) {
    console.error('[sso] RAMS link failed', e);
    return plain;
  }
}
