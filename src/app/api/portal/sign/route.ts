import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ADMIN_EMAIL,
  agreementHash,
  buildSnapshot,
  clientIp,
  emailShell,
  esc,
  logEvent,
  sendEmail,
  siteBaseUrl,
  validSignature,
} from '@/lib/subcontractors/server';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';
import { missingDetails } from '@/lib/subcontractors/types';

export async function POST(req: Request) {
  const r = await portalRequest<{
    name: string;
    title: string;
    signature: string;
    agree: boolean;
    hash: string;
  }>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;

  const name = str(body.name, 120);
  const title = str(body.title, 120);
  if (!body.agree) return jsonError('Please confirm you have read and agree to the Agreement.');
  if (name.length < 2) return jsonError('Please type your full name.');
  if (!validSignature(body.signature)) return jsonError('Please draw your signature.');
  const missing = missingDetails(sub.details || {});
  if (missing.length) return jsonError(`Please complete your details first: ${missing.join(', ')}.`);

  const admin = createAdminClient();
  const { count } = await admin
    .from('subcontractor_agreements')
    .select('id', { count: 'exact', head: true })
    .eq('subcontractor_id', sub.id);
  if (count) return jsonError('This agreement has already been signed.', 409);

  // The signer must have been shown exactly the text we are about to record.
  const snapshot = buildSnapshot(sub);
  const hash = agreementHash(snapshot);
  if (body.hash !== hash) {
    return jsonError('The agreement has been updated since you opened it. Please reload the page and review it again.', 409);
  }

  const ip = clientIp(req.headers);
  const { error } = await admin.from('subcontractor_agreements').insert({
    subcontractor_id: sub.id,
    version: snapshot.version,
    content_hash: hash,
    snapshot,
    sub_name: name,
    sub_title: title || null,
    sub_signature: body.signature,
    sub_ip: ip,
    sub_user_agent: req.headers.get('user-agent')?.slice(0, 400) || null,
  });
  if (error) return jsonError('Could not record your signature — please try again.', 500);

  await admin.from('subcontractors').update({ status: 'awaiting_countersign' }).eq('id', sub.id);
  await logEvent(sub.id, 'subcontractor', 'agreement_signed', { name, title, hash }, ip);

  await sendEmail({
    to: ADMIN_EMAIL(),
    replyTo: sub.email,
    subject: `Signed: ${sub.company_name} — subcontractor agreement ${sub.ref} needs countersigning`,
    html: emailShell(
      `${sub.company_name} has signed`,
      `<p><strong>${esc(name)}</strong>${title ? ` (${esc(title)})` : ''} signed the Subcontractor Framework Agreement <strong>${esc(sub.ref)}</strong>.</p>
       <p>Review their details and documents, then countersign to make the agreement live.</p>`,
      { href: `${siteBaseUrl(new URL(req.url).origin)}/admin/subcontractors/${sub.id}`, label: 'Review & countersign' }
    ),
  });

  return NextResponse.json({ ok: true });
}
