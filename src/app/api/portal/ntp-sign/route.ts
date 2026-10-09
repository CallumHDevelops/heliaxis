import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findNtpBySigningToken, recordNtpSignature } from '@/lib/subcontractors/ntp';
import { clientIp } from '@/lib/subcontractors/server';
import { jsonError, sameOrigin } from '@/lib/subcontractors/portal-request';

/**
 * The named NTP signs from their personal emailed link. The link token is the
 * credential (256-bit, hashed at rest, 14 days, single-use), so no portal session.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError('Forbidden', 403);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ntp = await findNtpBySigningToken(typeof body.token === 'string' ? body.token : null);
  if (!ntp) return jsonError('This signing link has expired or has already been used. Ask Heliaxis to send a new one.', 401);

  const { data: sub } = await createAdminClient()
    .from('subcontractors')
    .select('id, company_name, email, status')
    .eq('id', ntp.subcontractor_id)
    .maybeSingle();
  if (!sub || sub.status === 'terminated') return jsonError('This agreement is no longer available.', 410);

  const res = await recordNtpSignature(ntp, sub, body, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
    origin: new URL(req.url).origin,
    via: 'personal link',
  });
  if (!res.ok) return jsonError(res.error, res.status);
  return NextResponse.json({ ok: true });
}
