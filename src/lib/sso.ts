import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient, type User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * One tap from the Heliaxis menu into RAMS, already signed in. RAMS is a separate app with its
 * own Supabase project, so it can't see our session. Instead we ask RAMS's Supabase for a
 * one-time sign-in link for the same person and send the browser to RAMS's own /auth/callback,
 * which accepts a token_hash and sets its session (no change to RAMS needed).
 *
 * Two guards. Heliaxis sign-ups don't confirm email addresses, so someone could register with
 * a colleague's address; one-tap sign-in therefore waits until the person has proved the address
 * is theirs (a link emailed to it, once). And only an APPROVED RAMS account whose sign-in email
 * matches gets a link; anyone else just lands on RAMS as before.
 * Needs RAMS_SUPABASE_URL and RAMS_SUPABASE_SERVICE_ROLE_KEY.
 */

export const RAMS_ORIGIN = 'https://rams.heliaxis.co.uk';
const PROVEN_KEY = 'sso-email-proven';
const PROOF_TTL_S = 3600;

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

async function provenMap(): Promise<Record<string, string>> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', PROVEN_KEY).maybeSingle();
  try {
    const v = JSON.parse(data?.value || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** A real email round-trip: a sign-up confirmation or invite link, or our own proof link. */
export async function emailProven(user: User): Promise<boolean> {
  const email = norm(user.email);
  if (!email || !user.email_confirmed_at) return false;
  if (user.confirmation_sent_at || user.invited_at) return true;
  return (await provenMap())[user.id] === email;
}

export async function markEmailProven(userId: string, email: string) {
  const map = await provenMap();
  map[userId] = norm(email);
  await createAdminClient()
    .from('cms_kv')
    .upsert({ key: PROVEN_KEY, value: JSON.stringify(map), updated_at: new Date().toISOString() });
}

function sign(payload: string) {
  const s = process.env.APP_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('No secret for sign-in links');
  return createHmac('sha256', s).update(`sso-proof:${payload}`).digest('base64url');
}

/** For the "confirm it's your email" link: names the person and the address, valid for an hour. */
export function proofToken(user: User): string {
  const payload = Buffer.from(
    JSON.stringify({ u: user.id, e: norm(user.email), x: Math.floor(Date.now() / 1000) + PROOF_TTL_S })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/**
 * Who the link was sent to, if it's genuine and in date. Opening it proves that inbox is theirs, so
 * it works in any browser, signed in or not (an email link often opens outside the app).
 */
export function readProofToken(token: string | null): { userId: string; email: string } | null {
  if (!token || token.length > 1000) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const { u, e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof u !== 'string' || typeof e !== 'string' || typeof x !== 'number' || x < Date.now() / 1000) return null;
    return { userId: u, email: e };
  } catch {
    return null;
  }
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
