import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensurePortalToken } from '@/lib/crm/server';
import { channelsFor, checkCode, CODE_COOKIE, CODE_MINUTES, contactFor, sendCode, tooMany } from '@/lib/crm/portal-codes';
import { logSiteEvent } from '@/lib/site/server';
import { clientIp } from '@/lib/subcontractors/server';

export const dynamic = 'force-dynamic';

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * The sign-in code step, for the challenge in this browser's cookie (set by api/my/login):
 * - { code }: right → the portal link (and the challenge is used up); wrong → how many tries are left.
 * - { resend: 'sms' | 'email' }: a new code (by text or email) to the same job; the old one stops working.
 */
export async function POST(req: Request) {
  const db = createAdminClient();
  const ip = clientIp(req.headers);
  const id = (await cookies()).get(CODE_COOKIE)?.value ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Your sign-in timed out. Start again.', restart: true }, 400);
  const b = (await req.json().catch(() => ({}))) as { code?: unknown; resend?: unknown };

  if (b.resend === 'sms' || b.resend === 'email') {
    const { data: c } = await db.from('portal_login_codes').select('project_id').eq('id', id).maybeSingle();
    if (!c) return json({ error: 'Your sign-in timed out. Start again.', restart: true }, 400);
    const projectId = String(c.project_id);
    const { data: job } = await db.from('crm_projects').select('id, enquiry_id, contact_id').eq('id', projectId).maybeSingle();
    if (!job) return json({ error: 'Your sign-in timed out. Start again.', restart: true }, 400);
    const contact = await contactFor(db, job);
    const channels = channelsFor(contact);
    if (!channels.some((x) => x.kind === b.resend)) return json({ error: 'We can’t send it that way.', channels }, 400);
    if (await tooMany(db, projectId, ip)) return json({ error: 'We’ve sent several codes already. Wait 15 minutes, or use the link we sent you.' }, 429);
    const sent = await sendCode(db, { projectId, contact, channel: b.resend, ip });
    if (!sent.ok) return json({ error: sent.error, channels }, 502);
    await logSiteEvent(db, null, 'customer', 'portal_code_sent', { project_id: projectId, channel: b.resend }, ip);
    const res = json({ step: 'code', channel: b.resend, to: sent.to, channels, minutes: CODE_MINUTES });
    res.cookies.set(CODE_COOKIE, sent.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/my/login', maxAge: CODE_MINUTES * 60 });
    return res;
  }

  const r = await checkCode(db, id, String(b.code ?? '').slice(0, 12));
  if (!r.ok) {
    await logSiteEvent(db, null, 'customer', 'portal_code_wrong', null, ip);
    return json({ error: r.error, dead: !!r.dead }, 400);
  }
  const token = await ensurePortalToken(r.projectId);
  if (!token) return json({ error: 'Your project isn’t open just now. Please call us.' }, 409);
  await logSiteEvent(db, null, 'customer', 'portal_login', { project_id: r.projectId, by: 'code' }, ip);
  const res = json({ url: `/my/${token}` });
  res.cookies.set(CODE_COOKIE, '', { path: '/api/my/login', maxAge: 0 });
  return res;
}
