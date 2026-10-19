import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * One tap from the Heliaxis menu into RAMS, already signed in. RAMS is a separate app with its
 * own Supabase project, so it can't see our session. Instead we ask RAMS's Supabase for a
 * one-time sign-in link for the same email address and send the browser to RAMS's own
 * /auth/callback, which accepts a token_hash and sets its session (no change to RAMS needed).
 *
 * Only for people who already have an APPROVED RAMS account with the same email; anyone else
 * just lands on RAMS as before. Needs RAMS_SUPABASE_URL and RAMS_SUPABASE_SERVICE_ROLE_KEY.
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

/** Where to send this person: a signed-in link when we can make one, else RAMS's normal door. */
export async function ramsLink(email: string | null | undefined, next: string): Promise<string> {
  const plain = `${RAMS_ORIGIN}${next}`;
  const address = email?.trim().toLowerCase();
  if (!address || !ramsSsoConfigured()) return plain;
  try {
    const rams = createClient(process.env.RAMS_SUPABASE_URL!, process.env.RAMS_SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Exact email, any capitalisation (LIKE wildcards escaped, then compared properly).
    const like = address.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: people } = await rams.from('profiles').select('email, status').ilike('email', like).limit(5);
    const person = (people ?? []).find((p) => (p.email || '').trim().toLowerCase() === address);
    if (!person || person.status !== 'approved') return plain;

    const { data, error } = await rams.auth.admin.generateLink({ type: 'magiclink', email: person.email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error('[sso] RAMS link failed', error?.message);
      return plain;
    }
    const q = new URLSearchParams({ token_hash: tokenHash, type: 'magiclink', next });
    return `${RAMS_ORIGIN}/auth/callback?${q}`;
  } catch (e) {
    console.error('[sso] RAMS link failed', e);
    return plain;
  }
}
