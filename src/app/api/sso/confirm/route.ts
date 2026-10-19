import { NextResponse } from 'next/server';
import { SSO_PATH } from '@/lib/portals';
import { markEmailProven, readProofToken, safeRamsPath } from '@/lib/sso';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * The "confirm it's your email" link (sent from /admin/sso). Opening it proves the inbox is
 * theirs, so one-tap sign-in to RAMS works from then on. Works in any browser.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeRamsPath(url.searchParams.get('next'));
  const back = (q: Record<string, string>) =>
    NextResponse.redirect(new URL(`${SSO_PATH}?${new URLSearchParams({ ...q, next })}`, url), {
      status: 303,
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });

  const proof = readProofToken(url.searchParams.get('t'));
  if (!proof) return back({ expired: '1' });
  // Still the same person at the same address (an email change since then voids the link).
  const { data } = await createAdminClient().auth.admin.getUserById(proof.userId);
  if (data?.user?.email?.trim().toLowerCase() !== proof.email) return back({ expired: '1' });
  await markEmailProven(proof.userId, proof.email);
  return back({ confirmed: '1' });
}
