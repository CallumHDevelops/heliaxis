import { NextResponse } from 'next/server';
import { clientIp, logEvent } from '@/lib/subcontractors/server';
import { createSession, LoginUnavailableError, redeemLoginCode } from '@/lib/subcontractors/session';
import { jsonError, sameOrigin, str } from '@/lib/subcontractors/portal-request';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError('Forbidden', 403);
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  let result: Awaited<ReturnType<typeof redeemLoginCode>>;
  try {
    result = await redeemLoginCode(str(body.email, 160), str(body.code, 12));
  } catch (e) {
    console.error('[portal-login] cannot check codes', e);
    if (e instanceof LoginUnavailableError) {
      return jsonError('Sign-in is temporarily unavailable. Please call 01633 965205 and we will get you in.', 503);
    }
    throw e;
  }
  if (!result.ok) {
    const message = {
      wrong: "That code doesn't match. Use the code from the most recent email we sent, and check the email address above.",
      expired: 'That code has expired (codes last 10 minutes). Tap "Send a new code".',
      locked: 'Too many wrong tries. Tap "Send a new code" and use the code in that email.',
    }[result.reason];
    return jsonError(message, 401);
  }
  const subId = result.subId;
  const ip = clientIp(req.headers);
  await createSession(subId, ip, req.headers.get('user-agent'));
  await logEvent(subId, 'subcontractor', 'signed_in', { via: 'email code' }, ip);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
