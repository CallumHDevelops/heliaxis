import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Landing point for Supabase email links (password reset). Exchanges the code
 * (PKCE) or token hash for a session, then continues to `next` (same-site paths only).
 */
/**
 * Only continue within this site. Resolve against our origin and compare,
 * rather than testing for a leading "/": the URL parser folds backslashes into
 * slashes, so "/\evil.com" passes a startsWith check and then lands on another host.
 */
function safeNext(requested: string | null, origin: string): string {
  if (!requested) return '/admin';
  try {
    const candidate = new URL(requested, origin);
    if (candidate.origin !== origin || candidate.pathname === '/auth/confirm') return '/admin';
    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return '/admin';
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get('next'), url.origin);
  const supabase = await createClient();

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('missing code') };

  if (error) return NextResponse.redirect(new URL('/forgot-password?expired=1', url));
  return NextResponse.redirect(new URL(next, url));
}
