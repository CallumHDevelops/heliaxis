import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { compliance } from '@/lib/subcontractors/documents';
import {
  ADMIN_EMAIL,
  clientIp,
  emailShell,
  esc,
  logEvent,
  sendEmail,
  siteBaseUrl,
} from '@/lib/subcontractors/server';
import { jsonError, portalRequest } from '@/lib/subcontractors/portal-request';
import type { DocumentRow } from '@/lib/subcontractors/types';

/** "I've finished uploading" — tells Heliaxis there's something to review. */
export async function POST(req: Request) {
  const r = await portalRequest<{ token: string }>(req);
  if ('error' in r) return r.error;
  const { sub } = r;

  const admin = createAdminClient();
  const { data } = await admin.from('subcontractor_documents').select('*').eq('subcontractor_id', sub.id);
  const docs = (data ?? []) as DocumentRow[];
  const c = compliance(sub.details || {}, docs);
  if (c.missing.length) return jsonError(`Still needed: ${c.missing.join(', ')}.`);

  await admin.from('subcontractors').update({ docs_submitted_at: new Date().toISOString() }).eq('id', sub.id);
  await logEvent(sub.id, 'subcontractor', 'documents_submitted', { count: docs.length }, clientIp(req.headers));

  await sendEmail({
    to: ADMIN_EMAIL(),
    replyTo: sub.email,
    subject: `Documents ready to review: ${sub.company_name} (${sub.ref})`,
    html: emailShell(
      `${sub.company_name} has uploaded their documents`,
      `<p>${docs.length} document(s) on file, ${c.pendingReview} awaiting review.</p>
       ${c.expiring.length ? `<p>${c.expiring.length} expire within 30 days.</p>` : ''}
       <p>Contact: ${esc(sub.contact_name)} · ${esc(sub.email)}</p>`,
      { href: `${siteBaseUrl(new URL(req.url).origin)}/admin/subcontractors/${sub.id}`, label: 'Review documents' }
    ),
  });

  return NextResponse.json({ ok: true });
}
