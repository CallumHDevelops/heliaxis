import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Landing point for Supabase email links (password reset). Exchanges the code
 * (PKCE) or token hash for a session, then continues to `next` (same-site paths only).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nextRaw = url.searchParams.get('next') || '/admin';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/admin';
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
