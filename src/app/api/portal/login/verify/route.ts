import { NextResponse } from 'next/server';
import { clientIp, logEvent } from '@/lib/subcontractors/server';
import { createSession, redeemLoginCode } from '@/lib/subcontractors/session';
import { jsonError, sameOrigin, str } from '@/lib/subcontractors/portal-request';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError('Forbidden', 403);
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  const subId = await redeemLoginCode(str(body.email, 160), str(body.code, 12));
  if (!subId) return jsonError('That code is wrong or has expired. Request a new one.', 401);
  const ip = clientIp(req.headers);
  await createSession(subId, ip, req.headers.get('user-agent'));
  await logEvent(subId, 'subcontractor', 'signed_in', { via: 'email code' }, ip);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
