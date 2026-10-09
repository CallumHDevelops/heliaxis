import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, logEvent } from '@/lib/subcontractors/server';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = { id?: string; fullName?: string; role?: string; phone?: string; email?: string; archive?: boolean };

/**
 * The firm's own team. POST = add, PATCH = edit or archive (archived people stay
 * on past documents and jobs but can't be chosen for new ones).
 */
export async function POST(req: Request) {
  const r = await portalRequest<Body>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;
  const fullName = str(body.fullName, 120);
  if (fullName.length < 2) return jsonError('Enter their full name.');
  if (str(body.email, 160) && !EMAIL_RE.test(str(body.email, 160))) return jsonError("That email address doesn't look right.");
  const admin = createAdminClient();
  const { count } = await admin
    .from('subcontractor_operatives')
    .select('id', { count: 'exact', head: true })
    .eq('subcontractor_id', sub.id);
  if ((count ?? 0) >= 200) return jsonError('Team limit reached — contact Heliaxis.');
  const { data, error } = await admin
    .from('subcontractor_operatives')
    .insert({
      subcontractor_id: sub.id,
      full_name: fullName,
      role: str(body.role, 80) || null,
      phone: str(body.phone, 40) || null,
      email: str(body.email, 160) || null,
    })
    .select('*')
    .single();
  if (error) return jsonError('Could not add them — please try again.', 500);
  await logEvent(sub.id, 'subcontractor', 'operative_added', { name: fullName }, clientIp(req.headers));
  return NextResponse.json({ ok: true, operative: data });
}

export async function PATCH(req: Request) {
  const r = await portalRequest<Body>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;
  const id = str(body.id, 40);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.archive !== undefined) update.archived_at = body.archive ? new Date().toISOString() : null;
  if (body.fullName !== undefined) {
    const n = str(body.fullName, 120);
    if (n.length < 2) return jsonError('Enter their full name.');
    update.full_name = n;
  }
  if (body.role !== undefined) update.role = str(body.role, 80) || null;
  if (body.phone !== undefined) update.phone = str(body.phone, 40) || null;
  if (body.email !== undefined) {
    const email = str(body.email, 160);
    if (email && !EMAIL_RE.test(email)) return jsonError("That email address doesn't look right.");
    update.email = email || null;
  }

  const { data, error } = await createAdminClient()
    .from('subcontractor_operatives')
    .update(update)
    .eq('id', id)
    .eq('subcontractor_id', sub.id)
    .select('*')
    .maybeSingle();
  if (error || !data) return jsonError('Could not update — please try again.', error ? 500 : 404);
  // Someone who leaves the team can no longer sign an NTP agreement on its behalf.
  if (body.archive) {
    await createAdminClient()
      .from('subcontractor_ntp_agreements')
      .update({ sign_token_hash: null })
      .eq('operative_id', data.id)
      .eq('status', 'awaiting_signature');
  }
  await logEvent(sub.id, 'subcontractor', body.archive ? 'operative_archived' : 'operative_updated', { name: data.full_name }, clientIp(req.headers));
  return NextResponse.json({ ok: true, operative: data });
}
