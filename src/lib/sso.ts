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
    // Collapse "//" (a path like "/.//evil.com" normalises to "//evil.com", which reads as another site),
    // and never point at RAMS's own sign-in routes (however they're spelt or encoded).
    const path = u.pathname.replace(/\/{2,}/g, '/');
    let plain = path;
    try {
      plain = decodeURIComponent(path);
    } catch {
      return '/';
    }
    if (u.origin !== RAMS_ORIGIN || /^\/+auth(\/|$)/i.test(plain.replace(/\/{2,}/g, '/'))) return '/';
    return `${path}${u.search}`;
  } catch {
    return '/';
  }
}

const norm = (email: string | null | undefined) => email?.trim().toLowerCase() || '';

/* ── Proving the email address is theirs ──────────────────────────────────────────────── */

const CODE_TTL_MS = 15 * 60_000;

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

/** sso.sql not run yet: missing table (PGRST205 / 42P01) or function (PGRST202 / 42883). */
const notSetUp = (e: { code?: string; message?: string }) =>
  ['PGRST205', 'PGRST202', '42P01', '42883'].includes(e.code || '') || /relation|does not exist|schema cache/i.test(e.message || '');

/**
 * Email a 6-digit code to their sign-in address. It only counts when typed back in by the same
 * signed-in person, so a link scanner or someone else's inbox can't prove it for them. The
 * database decides atomically whether a new code may go out (sso.sql: 2 minutes apart, none
 * after 10 wrong codes in 24 hours).
 */
export async function sendProofCode(user: User, name: string): Promise<CodeResult> {
  const email = norm(user.email);
  if (!email) return 'failed';
  const db = createAdminClient();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { data: stored, error } = await db.rpc('sso_store_code', {
    p_user: user.id,
    p_email: email,
    p_hash: codeHash(user.id, code),
    p_expires: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) return notSetUp(error) ? 'setup' : 'failed';
  if (!stored) {
    const { data: row } = await db.from('sso_email_codes').select('failures, failures_since').eq('user_id', user.id).maybeSingle();
    const lockedOut = row && row.failures >= 10 && Date.now() - new Date(row.failures_since).getTime() < 86_400_000;
    return lockedOut ? 'locked' : 'wait';
  }

  const who = name ? `${name} (${email})` : email;
  const sent = await sendEmail({
    to: email,
    from: 'Heliaxis <noreply@heliaxis.co.uk>',
    subject: `${code} is your Heliaxis code`,
    text: `Your code is ${code}\n\nSomeone signed in to Heliaxis as ${who} asked to open RAMS without signing in again. If that's you, type this code into the Heliaxis app. It works for 15 minutes.\n\nIf it isn't you, don't share the code with anyone, and tell Callum.`,
    html: emailShell(
      'Your code',
      `<p style="font-size:30px;font-weight:800;letter-spacing:.3em;margin:18px 0">${esc(code)}</p>
       <p>Someone signed in to Heliaxis as <b>${esc(who)}</b> asked to open RAMS without signing in again. If that’s you, type this code into the Heliaxis app. It works for 15 minutes.</p>
       <p style="font-size:13px;color:#6E6A5E">If it isn’t you, don’t share the code with anyone, and tell Callum.</p>`,
      undefined,
      'Account'
    ),
  });
  if (!sent.ok) {
    // Nobody received it: retire it and let them ask again straight away.
    await db
      .from('sso_email_codes')
      .update({ expires_at: new Date().toISOString(), sent_at: new Date(0).toISOString() })
      .eq('user_id', user.id);
    return 'failed';
  }
  return 'ok';
}

/** Check a typed code; on success the address counts as theirs from now on. */
export async function checkProofCode(user: User, typed: string): Promise<CodeResult> {
  const email = norm(user.email);
  const code = typed.replace(/\D/g, '');
  const db = createAdminClient();
  // Uses up a try first (atomically), so parallel guesses can't get more than 5 between them.
  const { data, error } = await db.rpc('sso_take_attempt', { p_user: user.id });
  if (error) return notSetUp(error) ? 'setup' : 'failed';
  const row = (Array.isArray(data) ? data[0] : data) as { code_hash: string; email: string; attempts: number } | null | undefined;
  if (!row) {
    const { data: state } = await db.from('sso_email_codes').select('expires_at').eq('user_id', user.id).maybeSingle();
    if (!state || new Date(state.expires_at).getTime() < Date.now()) return 'expired';
    return 'locked';
  }
  if (row.email !== email) return 'expired';

  const expected = Buffer.from(row.code_hash);
  const given = Buffer.from(code.length === 6 ? codeHash(user.id, code) : '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return row.attempts >= 5 ? 'locked' : 'wrong';

  const { error: saveErr } = await db
    .from('sso_email_proofs')
    .upsert({ user_id: user.id, email, proven_at: new Date().toISOString() });
  if (saveErr) return 'failed';
  await db.rpc('sso_code_used', { p_user: user.id });
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
