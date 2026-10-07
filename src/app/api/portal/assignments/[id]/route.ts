import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_EMAIL, clientIp, emailShell, esc, logEvent, sendEmail, siteBaseUrl } from '@/lib/subcontractors/server';
import { notifyRams } from '@/lib/subcontractors/rams-webhook';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';
import type { AssignmentRow } from '@/lib/subcontractors/types';

export const maxDuration = 60;

/** The subcontractor confirms (or changes) who's on a job, or declines it. RAMS is told immediately. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await portalRequest<{ action: 'confirm' | 'decline'; operativeIds?: string[]; reason?: string }>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;
  const { id } = await params;

  const admin = createAdminClient();
  const { data } = await admin
    .from('subcontractor_assignments')
    .select('*')
    .eq('id', id)
    .eq('subcontractor_id', sub.id)
    .maybeSingle();
  const a = data as AssignmentRow | null;
  if (!a) return jsonError('Job not found.', 404);
  if (a.status === 'cancelled') return jsonError('This job has been cancelled.', 409);
  if (sub.status !== 'active') return jsonError('Your account is not active — contact Heliaxis.', 403);
  const ip = clientIp(req.headers);

  if (body.action === 'decline') {
    const reason = str(body.reason, 300);
    if (!reason) return jsonError('Please give a reason.');
    await admin
      .from('subcontractor_assignments')
      .update({ status: 'declined', decline_reason: reason, crew: [], updated_at: new Date().toISOString() })
      .eq('id', a.id);
    await logEvent(sub.id, 'subcontractor', 'assignment_declined', { project: a.rams_project_name, reason }, ip);
    await notifyRams(a.id, sub.id, 'assignment.declined');
    await sendEmail({
      to: a.requested_by_email || ADMIN_EMAIL(),
      subject: `${sub.company_name} declined ${a.rams_project_name}`,
      html: emailShell('Job declined', `<p>${esc(sub.company_name)} declined <strong>${esc(a.rams_project_name)}</strong>.</p><p>Reason: ${esc(reason)}</p>`),
    });
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(body.operativeIds) ? [...new Set(body.operativeIds.map((x) => str(x, 40)))] : [];
  if (!ids.length) return jsonError('Choose at least one person.');
  const { data: ops } = await admin
    .from('subcontractor_operatives')
    .select('id, full_name')
    .eq('subcontractor_id', sub.id)
    .is('archived_at', null)
    .in('id', ids);
  if ((ops ?? []).length !== ids.length) return jsonError('One of those people is no longer on your team.', 409);

  const changed = a.status === 'crew_confirmed';
  await admin
    .from('subcontractor_assignments')
    .update({
      status: 'crew_confirmed',
      crew: ids,
      decline_reason: null,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', a.id);
  const names = (ops ?? []).map((o) => o.full_name);
  await logEvent(sub.id, 'subcontractor', changed ? 'crew_changed' : 'crew_confirmed', { project: a.rams_project_name, crew: names }, ip);
  const webhook = await notifyRams(a.id, sub.id, changed ? 'assignment.crew_changed' : 'assignment.crew_confirmed');
  if (!webhook.startsWith('delivered')) {
    await sendEmail({
      to: ADMIN_EMAIL(),
      subject: `RAMS not updated: ${sub.company_name} crew for ${a.rams_project_name}`,
      html: emailShell(
        'Crew confirmed but RAMS was not notified',
        `<p>${esc(sub.company_name)} confirmed ${esc(names.join(', '))} for ${esc(a.rams_project_name)}, but RAMS could not be notified (${esc(webhook)}). Use "Pull again" in RAMS.</p>`,
        { href: `${siteBaseUrl(new URL(req.url).origin)}/admin/subcontractors/${sub.id}`, label: 'Open subcontractor' }
      ),
    });
  }
  return NextResponse.json({ ok: true });
}
