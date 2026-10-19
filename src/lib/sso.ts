import 'server-only';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailShell, esc, sendEmail } from '@/lib/subcontractors/server';
import { canAccess, type AccessProfile } from '@/lib/portals';

/**
 * One tap from the Heliaxis menu into RAMS or the social studio, already signed in. Each is a
 * separate app with its own Supabase project, so it can't see our session. Instead we ask that
 * app's Supabase for a one-time sign-in link for the same person and send the browser to the
 * app's own /auth/callback, which accepts a token_hash and sets its session.
 *
 * Two guards. Heliaxis sign-ups don't confirm email addresses, so someone could register with
 * a colleague's address; one-tap sign-in therefore waits until the person has proved the address
 * is theirs, once, by typing in a code emailed to it (supabase/sso.sql; one proof covers both apps).
 * And only an account in the other app whose sign-in email matches gets a link (for RAMS, an
 * existing APPROVED one; for the studio, one whose email it has confirmed); anyone else just lands
 * on that app as before. We never create RAMS accounts. For the studio, Heliaxis Users decides who
 * gets in: someone with Social media studio access here who has proved their email and has no
 * studio account at all gets one, confirmed, the first time. We never change an account that's
 * already there (its email, password or details).
 * Needs RAMS_SUPABASE_URL + RAMS_SUPABASE_SERVICE_ROLE_KEY, and SOCIAL_SUPABASE_URL +
 * SOCIAL_SUPABASE_SERVICE_ROLE_KEY for the studio.
 */

export const RAMS_ORIGIN = 'https://rams.heliaxis.co.uk';
export const SOCIAL_ORIGIN = 'https://social.heliaxis.co.uk';

export function ramsSsoConfigured() {
  return !!(process.env.RAMS_SUPABASE_URL && process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY);
}

export function socialSsoConfigured() {
  return !!(process.env.SOCIAL_SUPABASE_URL && process.env.SOCIAL_SUPABASE_SERVICE_ROLE_KEY);
}

/** A path inside `origin`, or `fallback`. Never another site, and never the app's own /auth routes. */
function safePathOn(origin: string, next: string | null, fallback: string): string {
  if (!next) return fallback;
  try {
    const u = new URL(next, origin);
    // Collapse "//" (a path like "/.//evil.com" normalises to "//evil.com", which reads as another site),
    // and never point at the app's own sign-in routes (however they're spelt or encoded).
    const path = u.pathname.replace(/\/{2,}/g, '/');
    let plain = path;
    try {
      plain = decodeURIComponent(path);
    } catch {
      return fallback;
    }
    if (u.origin !== origin || /^\/+auth(\/|$)/i.test(plain.replace(/\/{2,}/g, '/'))) return fallback;
    return `${path}${u.search}`;
  } catch {
    return fallback;
  }
}

/** Only paths inside RAMS: "/operatives?team=heliaxis" yes, "//evil.com" or "https://…" no. */
export function safeRamsPath(next: string | null): string {
  return safePathOn(RAMS_ORIGIN, next, '/');
}

/**
 * Only paths inside the studio, defaulting to /studio. Stricter than RAMS: it must already be a
 * plain path, before and after decoding ("/reel" yes; "reel", "//evil.com", "/\\evil.com",
 * "/%2F%2Fevil.com" or "https://…" no).
 */
export function safeSocialPath(next: string | null): string {
  const fallback = '/studio';
  if (typeof next !== 'string' || !next) return fallback;
  let plain: string;
  try {
    plain = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  const plainPath = (s: string) => /^\/(?![/\\])/.test(s) && ![...s].some((c) => c <= '\u001f' || c === '\u007f');
  if (!plainPath(next) || !plainPath(plain)) return fallback;
  return safePathOn(SOCIAL_ORIGIN, next, fallback);
}

/** The apps one-tap sign-in can open. Anything but 'social' is RAMS (the original, and the default). */
export type SsoApp = 'rams' | 'social';
export const ssoApp = (v: unknown): SsoApp => (v === 'social' ? 'social' : 'rams');

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
export async function sendProofCode(user: User, name: string, app: SsoApp = 'rams'): Promise<CodeResult> {
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
  const what = SSO_APPS[app].name;
  const sent = await sendEmail({
    to: email,
    from: 'Heliaxis <noreply@heliaxis.co.uk>',
    subject: `${code} is your Heliaxis code`,
    text: `Your code is ${code}\n\nSomeone signed in to Heliaxis as ${who} asked to open ${what} without signing in again. If that's you, type this code into the Heliaxis app. It works for 15 minutes.\n\nIf it isn't you, don't share the code with anyone, and tell Callum.`,
    html: emailShell(
      'Your code',
      `<p style="font-size:30px;font-weight:800;letter-spacing:.3em;margin:18px 0">${esc(code)}</p>
       <p>Someone signed in to Heliaxis as <b>${esc(who)}</b> asked to open ${esc(what)} without signing in again. If that’s you, type this code into the Heliaxis app. It works for 15 minutes.</p>
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

/* ── The sign-in links ─────────────────────────────────────────────────────────────────── */

/** A server-only client for another app's Supabase project. */
function serviceClient(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * A one-time link into `origin`'s /auth/callback, signed in as an account we've already found
 * there, or null. magiclink for an existing account only (it would otherwise create one), so the
 * link must come back for that same account. `extra` is added to the link (the studio's state).
 */
async function callbackLink(
  app: SupabaseClient,
  account: { id: string; email: string },
  origin: string,
  next: string,
  label: string,
  extra: Record<string, string> = {}
) {
  const { data, error } = await app.auth.admin.generateLink({ type: 'magiclink', email: account.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash || data.properties.verification_type !== 'magiclink' || data.user?.id !== account.id) {
    if (error) console.error(`[sso] ${label} link failed`, error.message);
    return null;
  }
  const q = new URLSearchParams({ token_hash: tokenHash, type: 'magiclink', next, ...extra });
  return `${origin}/auth/callback?${q}`;
}

/** A sign-in address, and a cookie to set alongside it when the app needs one (the studio). */
export type SsoLink = {
  url: string;
  cookie?: { name: string; value: string; domain: string; path: string; maxAge: number; httpOnly: true; secure: true; sameSite: 'lax' };
};

/** Where to send this person: a signed-in link when we can make one, else RAMS's normal door. */
export async function ramsLink(email: string | null | undefined, next: string): Promise<string> {
  const plain = `${RAMS_ORIGIN}${next}`;
  const address = norm(email);
  if (!address || !ramsSsoConfigured()) return plain;
  try {
    const rams = serviceClient(process.env.RAMS_SUPABASE_URL!, process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY!);
    // Narrow by the profile's copy of the email (LIKE wildcards escaped), then check the account itself.
    const like = address.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: people } = await rams.from('profiles').select('id, email, status').ilike('email', like).limit(5);
    const approved = (people ?? []).filter((p) => p.status === 'approved' && norm(p.email) === address);
    if (approved.length !== 1) return plain;

    // RAMS only copies the email onto profiles at sign-up; the auth record is the truth.
    const { data: found } = await rams.auth.admin.getUserById(approved[0].id);
    const account = found?.user;
    if (!account?.email || norm(account.email) !== address) return plain;

    return (await callbackLink(rams, { id: account.id, email: account.email }, RAMS_ORIGIN, next, 'RAMS')) ?? plain;
  } catch (e) {
    console.error('[sso] RAMS link failed', e);
    return plain;
  }
}

/** The studio is a small team: look through up to 1,000 accounts. */
const SOCIAL_PER_PAGE = 200;
const SOCIAL_MAX_PAGES = 5;

/**
 * What the studio has under exactly this email (any capitals). 'ok': one account, confirmed there
 * and not blocked or deleted (the studio has no profiles table: any account there can use it).
 * 'none': we read every account and none has this email. 'leave': one we mustn't use or touch.
 * 'unknown': the studio didn't answer, or has more accounts than we read.
 */
type SocialAccount = { status: 'ok'; account: User } | { status: 'none' | 'leave' | 'unknown' };

async function findSocialAccount(social: SupabaseClient, address: string): Promise<SocialAccount> {
  // Keyed by id: an account added mid-read can push another onto the next page, so we'd see it twice.
  const matches = new Map<string, User>();
  let complete = false;
  for (let page = 1; page <= SOCIAL_MAX_PAGES && !complete; page++) {
    const { data, error } = await social.auth.admin.listUsers({ page, perPage: SOCIAL_PER_PAGE });
    if (error) {
      console.error('[sso] social studio accounts unavailable', error.message);
      return { status: 'unknown' };
    }
    for (const u of data.users) if (norm(u.email) === address) matches.set(u.id, u);
    complete = !data.nextPage || data.users.length < SOCIAL_PER_PAGE;
  }
  if (!matches.size) {
    if (!complete) console.warn(`[sso] social studio has over ${SOCIAL_PER_PAGE * SOCIAL_MAX_PAGES} accounts; not adding one`);
    return { status: complete ? 'none' : 'unknown' };
  }
  const leave = (why: string) => {
    console.warn(`[sso] social studio ${why}: sending them to its own sign-in`);
    return { status: 'leave' } as const;
  };
  if (matches.size > 1) return leave('has more than one account under this email');
  const [account] = matches.values();
  if (account.deleted_at) return leave(`account ${account.id} is deleted`);
  if (account.banned_until && new Date(account.banned_until).getTime() > Date.now()) return leave(`account ${account.id} is blocked`);
  // An unconfirmed account may be a sign-up someone else started under this address; our link
  // would confirm it with their password still on it. Those people use the studio's own sign-in.
  if (!account.email_confirmed_at) return leave(`account ${account.id} isn't confirmed`);
  return { status: 'ok', account };
}

/**
 * Add a studio account under exactly this address: confirmed (they've proved it's theirs here), no
 * password, nothing else on it. The studio refuses a second account under an email it already has,
 * so this never changes one that's there. If that's why it fails (two taps at once, or one we
 * didn't see), we look again and carry on only with an account we'd have used anyway.
 */
async function addSocialAccount(social: SupabaseClient, address: string): Promise<SocialAccount> {
  const { data, error } = await social.auth.admin.createUser({ email: address, email_confirm: true });
  if (error) {
    const taken = error.code === 'email_exists' || /already (been )?registered/i.test(error.message);
    // A clash in the studio's database can also come back as a plain error: look again either way.
    if (!taken) console.error('[sso] social studio account not added', error.code ?? error.status ?? 'error');
    return findSocialAccount(social, address);
  }
  const account = data.user;
  if (!account || norm(account.email) !== address || !account.email_confirmed_at) {
    console.error("[sso] new social studio account doesn't match");
    return { status: 'unknown' };
  }
  return { status: 'ok', account };
}

/**
 * The studio only accepts our link in the browser that tapped the button: alongside it we set this
 * cookie for 5 minutes on heliaxis.co.uk (so social.heliaxis.co.uk can read it), holding the same
 * random value as the link's ?state=. A link copied out and sent to someone else signs nobody in.
 */
const SOCIAL_STATE_COOKIE = 'hx_social_sso';

/**
 * Where to send this person: a signed-in studio link (plus its state cookie, which the caller must
 * set) when we can make one, else the studio's normal door (signed out, every studio page goes to
 * its own sign-in). Heliaxis Users decides who can use the studio: if it has no account at all
 * under their email, and they're approved here with Social media studio access and have proved the
 * address with our code, we add one for them first. An account that's already there is used only
 * if it's confirmed and not blocked, and never changed.
 */
export async function socialLink(user: User, profile: AccessProfile | null | undefined, next: string): Promise<SsoLink> {
  const plain = { url: `${SOCIAL_ORIGIN}${next}` };
  const address = norm(user.email);
  if (!address || !socialSsoConfigured()) return plain;
  try {
    const social = serviceClient(process.env.SOCIAL_SUPABASE_URL!, process.env.SOCIAL_SUPABASE_SERVICE_ROLE_KEY!);
    let found = await findSocialAccount(social, address);
    if (found.status === 'none') {
      // The callers check these too; adding an account is the one thing here that writes, so again.
      if (!canAccess(profile, 'social') || !(await emailProven(user))) return plain;
      found = await addSocialAccount(social, address);
    }
    if (found.status !== 'ok') return plain;
    const { account } = found;
    if (!account.email || norm(account.email) !== address) return plain;
    const state = randomBytes(32).toString('base64url');
    const url = await callbackLink(social, { id: account.id, email: account.email }, SOCIAL_ORIGIN, next, 'social studio', { state });
    if (!url) return plain;
    return {
      url,
      cookie: { name: SOCIAL_STATE_COOKIE, value: state, domain: 'heliaxis.co.uk', path: '/auth/callback', maxAge: 300, httpOnly: true, secure: true, sameSite: 'lax' },
    };
  } catch (e) {
    console.error('[sso] social studio link failed', e instanceof Error ? e.message : e);
    return plain;
  }
}

/* ── Which app ─────────────────────────────────────────────────────────────────────────── */

type SsoAppInfo = {
  /** How it reads mid-sentence: "open RAMS", "open the social studio". */
  name: string;
  origin: string;
  configured: () => boolean;
  safePath: (next: string | null) => string;
  /** Who here may be signed in to it. */
  canUse: (profile: AccessProfile | null | undefined) => boolean;
  link: (user: User, profile: AccessProfile | null | undefined, next: string) => Promise<SsoLink>;
};

export const SSO_APPS: Record<SsoApp, SsoAppInfo> = {
  rams: {
    name: 'RAMS',
    origin: RAMS_ORIGIN,
    configured: ramsSsoConfigured,
    safePath: safeRamsPath,
    canUse: (p) => canAccess(p, 'rams') || canAccess(p, 'team'),
    link: async (user, _profile, next) => ({ url: await ramsLink(user.email, next) }),
  },
  social: {
    name: 'the social studio',
    origin: SOCIAL_ORIGIN,
    configured: socialSsoConfigured,
    safePath: safeSocialPath,
    canUse: (p) => canAccess(p, 'social'),
    link: socialLink,
  },
};
