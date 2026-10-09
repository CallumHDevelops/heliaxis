import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordNtpSignature } from '@/lib/subcontractors/ntp';
import { clientIp } from '@/lib/subcontractors/server';
import { jsonError, portalRequest } from '@/lib/subcontractors/portal-request';
import type { NtpRow } from '@/lib/subcontractors/types';

/** The NTP signs from the firm's portal (NTP tab) — e.g. when the NTP is the firm's own contact. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await portalRequest<Record<string, unknown>>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;
  const { id } = await params;

  const { data } = await createAdminClient()
    .from('subcontractor_ntp_agreements')
    .select('*')
    .eq('id', id)
    .eq('subcontractor_id', sub.id)
    .maybeSingle();
  const ntp = data as NtpRow | null;
  if (!ntp) return jsonError('Agreement not found.', 404);

  const res = await recordNtpSignature(ntp, sub, body, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
    origin: new URL(req.url).origin,
    via: 'portal',
  });
  if (!res.ok) return jsonError(res.error, res.status);
  return NextResponse.json({ ok: true });
}
