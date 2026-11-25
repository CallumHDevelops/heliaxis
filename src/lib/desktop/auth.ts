import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { canAccess, type PortalKey } from '@/lib/portals';
import type { Profile } from '@/lib/auth';

/**
 * Sign-in for the Metis desktop app. It holds the person's own Supabase session and sends its access token as
 * `Authorization: Bearer …`. The token is verified by Supabase, the profile is read with that token (so RLS
 * applies to the lookup), and the same approved-status and portal rules as the website are applied.
 * The desktop app never sees the service role key.
 */

export const DESKTOP_PORTAL: PortalKey = 'crm';

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export type Verdict = { ok: true } | { ok: false; status: 401 | 403; error: string };

/** The access rule, pure so it can be tested: approved, and allowed into the CRM portal. */
export function authorise(profile: Profile | null | undefined, portal: PortalKey = DESKTOP_PORTAL): Verdict {
  if (!profile) return { ok: false, status: 401, error: 'Your session has expired — sign in again.' };
  if (profile.status !== 'approved') return { ok: false, status: 403, error: 'Your HAP account is not approved yet.' };
  if (!canAccess(profile, portal)) return { ok: false, status: 403, error: 'Your HAP account does not have access to the CRM.' };
  return { ok: true };
}

export type DesktopSession = { user: { id: string; email?: string }; profile: Profile; token: string };
export type DesktopAuth = { session: DesktopSession } | { error: string; status: 401 | 403 };

export async function desktopSession(req: Request): Promise<DesktopAuth> {
  const token = bearerToken(req);
  if (!token) return { error: 'Sign in to Metis Desktop.', status: 401 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return { error: 'Your session has expired — sign in again.', status: 401 };
  const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
  const verdict = authorise(profile as Profile | null);
  if (!verdict.ok) return { error: verdict.error, status: verdict.status };
  return { session: { user: { id: data.user.id, email: data.user.email }, profile: profile as Profile, token } };
}

export const actorOf = (s: DesktopSession) => ({ id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' });
