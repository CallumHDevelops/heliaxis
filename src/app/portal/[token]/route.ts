import { NextResponse } from 'next/server';
import { clientIp, findByToken, logEvent } from '@/lib/subcontractors/server';
import { createSession } from '@/lib/subcontractors/session';

export const dynamic = 'force-dynamic';

/**
 * Emailed invite link → session. The token is checked (and must be under 14 days
 * old), a session cookie is set and the browser is sent on to /portal/app, so the
 * secret doesn't sit in the address bar, history or Referer headers afterwards.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const sub = await findByToken(token);
  if (!sub || sub.status === 'terminated') {
    return NextResponse.redirect(new URL('/portal?link=expired', url), { headers: { 'Referrer-Policy': 'no-referrer' } });
  }
  const ip = clientIp(req.headers);
  await createSession(sub.id, ip, req.headers.get('user-agent'));
  await logEvent(sub.id, 'subcontractor', 'signed_in', { via: 'invite link' }, ip);
  return NextResponse.redirect(new URL('/portal/app', url), { headers: { 'Referrer-Policy': 'no-referrer' } });
}
