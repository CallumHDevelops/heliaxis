import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ntpHash } from '@/lib/subcontractors/ntp';
import {
  ADMIN_EMAIL,
  clientIp,
  emailShell,
  esc,
  logEvent,
  sendEmail,
  siteBaseUrl,
  validSignature,
} from '@/lib/subcontractors/server';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';
import type { NtpRow } from '@/lib/subcontractors/types';

/** The NTP signs their appointment (for themselves and the firm). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await portalRequest<{ name: string; title: string; signature: string; agree: boolean; hash: string }>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;
  const { id } = await params;

  const admin = createAdminClient();
  const { data } = await admin
    .from('subcontractor_ntp_agreements')
    .select('*')
    .eq('id', id)
    .eq('subcontractor_id', sub.id)
    .maybeSingle();
  const ntp = data as NtpRow | null;
  if (!ntp) return jsonError('Agreement not found.', 404);
  if (ntp.status !== 'awaiting_signature') return jsonError('This agreement is not waiting for a signature.', 409);
  if (!body.agree) return jsonError('Please confirm you have read and agree to the agreement.');
  const name = str(body.name, 120);
  if (name.length < 2) return jsonError('Please type your full name.');
  if (!validSignature(body.signature)) return jsonError('Please draw your signature.');
  if (body.hash !== ntp.content_hash || ntpHash(ntp.snapshot) !== ntp.content_hash) {
    return jsonError('The agreement has changed since you opened it. Please reload and review it again.', 409);
  }

  const ip = clientIp(req.headers);
  await admin
    .from('subcontractor_ntp_agreements')
    .update({
      status: 'awaiting_countersign',
      sub_name: name,
      sub_title: str(body.title, 120) || null,
      sub_signature: body.signature,
      sub_signed_at: new Date().toISOString(),
      sub_ip: ip,
      sub_user_agent: req.headers.get('user-agent')?.slice(0, 400) || null,
    })
    .eq('id', ntp.id)
    .eq('status', 'awaiting_signature');
  await logEvent(sub.id, 'subcontractor', 'ntp_signed', { ref: ntp.ref, name }, ip);
  await sendEmail({
    to: ADMIN_EMAIL(),
    replyTo: sub.email,
    subject: `Signed: NTP agreement ${ntp.ref} (${sub.company_name}) needs countersigning`,
    html: emailShell(
      'NTP agreement signed',
      `<p><strong>${esc(name)}</strong> signed NTP agreement <strong>${esc(ntp.ref)}</strong> for ${esc(sub.company_name)}.</p>`,
      { href: `${siteBaseUrl(new URL(req.url).origin)}/admin/subcontractors/${sub.id}`, label: 'Countersign' }
    ),
  });
  return NextResponse.json({ ok: true });
}
