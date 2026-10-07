import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes, randomInt } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sha256 } from './server';
import { SUB_COLUMNS, type SubcontractorRow } from './types';

/**
 * Subcontractor sign-in. Replaces long-lived bearer links with:
 *   - an emailed 6-digit code (10 min, 5 attempts, rate-limited), or a fresh
 *     invite link (valid 14 days) — either is exchanged for
 *   - an httpOnly, SameSite=Lax session cookie (7 days), stored only as a hash
 *     and revocable server-side.
 * The portal holds photo ID, insurance and bank details, so every portal page
 * and API resolves the firm from this cookie and nothing else.
 */

export const SESSION_COOKIE = 'hx_sc_session';
const SESSION_DAYS = 7;
export const INVITE_LINK_DAYS = 14;
const CODE_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const CODES_PER_EMAIL_PER_HOUR = 5;
const CODES_PER_IP_PER_HOUR = 20;

export async function createSession(subId: string, ip: string | null, userAgent: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await createAdminClient().from('subcontractor_sessions').insert({
    subcontractor_id: subId,
    token_hash: sha256(token),
    expires_at: expires.toISOString(),
    ip,
    user_agent: userAgent?.slice(0, 300) ?? null,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

/** The signed-in firm, or null. Terminated firms and revoked/expired sessions are refused. */
export async function getPortalSub(): Promise<SubcontractorRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length < 30 || token.length > 100) return null;
  const admin = createAdminClient();
  const { data: session } = await admin
    .from('subcontractor_sessions')
    .select('id, subcontractor_id, expires_at, revoked_at, last_seen_at')
    .eq('token_hash', sha256(token))
    .maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) return null;

  const { data: sub } = await admin.from('subcontractors').select(SUB_COLUMNS).eq('id', session.subcontractor_id).maybeSingle();
  if (!sub || (sub as SubcontractorRow).status === 'terminated') return null;

  // Touch at most every 10 minutes.
  if (!session.last_seen_at || Date.now() - new Date(session.last_seen_at).getTime() > 600_000) {
    const now = new Date().toISOString();
    await Promise.all([
      admin.from('subcontractor_sessions').update({ last_seen_at: now }).eq('id', session.id),
      admin.from('subcontractors').update({ last_seen_at: now }).eq('id', session.subcontractor_id),
    ]);
  }
  return sub as SubcontractorRow;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await createAdminClient()
      .from('subcontractor_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', sha256(token));
  }
  jar.delete(SESSION_COOKIE);
}

/** Sign a firm out everywhere (terminate, or on request). */
export async function revokeAllSessions(subId: string) {
  await createAdminClient()
    .from('subcontractor_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('subcontractor_id', subId)
    .is('revoked_at', null);
}

/**
 * Issue a sign-in code. Always "succeeds" from the caller's point of view so the
 * form can't be used to discover which emails belong to subcontractors.
 * Returns the code + firm only when one should actually be emailed.
 */
export async function issueLoginCode(emailRaw: string, ip: string | null) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const admin = createAdminClient();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

  const [{ count: byEmail }, { count: byIp }] = await Promise.all([
    admin.from('subcontractor_login_codes').select('id', { count: 'exact', head: true }).ilike('email', email).gte('created_at', hourAgo),
    ip
      ? admin.from('subcontractor_login_codes').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', hourAgo)
      : Promise.resolve({ count: 0 }),
  ]);
  if ((byEmail ?? 0) >= CODES_PER_EMAIL_PER_HOUR || (byIp ?? 0) >= CODES_PER_IP_PER_HOUR) return null;

  const { data: sub } = await admin
    .from('subcontractors')
    .select(SUB_COLUMNS)
    .ilike('email', email)
    .neq('status', 'terminated')
    .limit(1)
    .maybeSingle();

  // Record the attempt either way (rate limiting must count misses too).
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await admin.from('subcontractor_login_codes').insert({
    subcontractor_id: sub?.id ?? null,
    email,
    code_hash: sha256(`${email}:${code}`),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    ip,
    // A miss can never be redeemed.
    used_at: sub ? null : new Date().toISOString(),
  });
  return sub ? { sub: sub as SubcontractorRow, code } : null;
}

/** Check a code; on success returns the firm id (the caller creates the session). */
export async function redeemLoginCode(emailRaw: string, codeRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const code = codeRaw.replace(/\D/g, '');
  if (code.length !== 6) return null;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('subcontractor_login_codes')
    .select('id, subcontractor_id, code_hash, expires_at, attempts, used_at')
    .ilike('email', email)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || !row.subcontractor_id || new Date(row.expires_at) < new Date() || row.attempts >= CODE_MAX_ATTEMPTS) return null;

  if (row.code_hash !== sha256(`${email}:${code}`)) {
    await admin.from('subcontractor_login_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return null;
  }
  await admin.from('subcontractor_login_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
  return row.subcontractor_id as string;
}
