import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, checkRamsKey, noStore, s, toPortalAssignment } from '@/lib/subcontractors/rams-api';
import { emailShell, esc, logEvent, portalBaseUrl, sendEmail } from '@/lib/subcontractors/server';
import type { AssignmentRow } from '@/lib/subcontractors/types';

export const dynamic = 'force-dynamic';

/** RAMS: assignments for one RAMS document (?documentId=…). */
export async function GET(req: Request) {
  const denied = checkRamsKey(req);
  if (denied) return denied;
  const documentId = s(new URL(req.url).searchParams.get('documentId'), 100);
  if (!documentId) return bad('documentId is required');
  const { data } = await createAdminClient()
    .from('subcontractor_assignments')
    .select('*')
    .eq('rams_document_id', documentId)
    .order('created_at');
  const assignments = await Promise.all(((data ?? []) as AssignmentRow[]).map(toPortalAssignment));
  return NextResponse.json({ assignments }, { headers: noStore });
}

/**
 * RAMS: book a firm onto a RAMS document. Idempotent per (firm, RAMS document).
 * The firm is emailed to sign in and choose who they're sending.
 */
export async function POST(req: Request) {
  const denied = checkRamsKey(req);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid JSON');
  }
  const subId = s(body.subcontractorId, 40);
  const project = (body.project || {}) as Record<string, unknown>;
  const document = (body.document || {}) as Record<string, unknown>;
  const requestedBy = (body.requestedBy || {}) as Record<string, unknown>;
  const startDate = s(body.startDate, 10);
  if (!/^[0-9a-f-]{36}$/i.test(subId)) return bad('subcontractorId is required');
  if (!s(project.id, 100) || !s(project.name, 200)) return bad('project.id and project.name are required');
  if (!s(document.id, 100)) return bad('document.id is required');
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return bad('startDate must be YYYY-MM-DD');

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from('subcontractors')
    .select('id, ref, company_name, contact_name, email, status')
    .eq('id', subId)
    .maybeSingle();
  if (!sub || sub.status !== 'active') return bad('Subcontractor not found or not active', 404);

  const fields = {
    rams_project_id: s(project.id, 100),
    rams_project_ref: s(project.ref, 60) || null,
    rams_project_name: s(project.name, 200),
    site_address: s(project.siteAddress, 400) || null,
    rams_document_title: s(document.title, 200) || null,
    scope: s(body.scope, 500) || null,
    start_date: startDate || null,
    requested_by_name: s(requestedBy.name, 120) || null,
    requested_by_email: s(requestedBy.email, 160) || null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from('subcontractor_assignments')
    .select('*')
    .eq('subcontractor_id', subId)
    .eq('rams_document_id', s(document.id, 100))
    .maybeSingle();

  let row: AssignmentRow;
  let isNew = false;
  if (existing) {
    const reopened = existing.status === 'cancelled';
    const { data, error } = await admin
      .from('subcontractor_assignments')
      .update({ ...fields, ...(reopened ? { status: 'awaiting_crew', crew: [], confirmed_at: null, decline_reason: null } : {}) })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return bad(error.message, 500);
    row = data as AssignmentRow;
    isNew = reopened;
  } else {
    const { data, error } = await admin
      .from('subcontractor_assignments')
      .insert({ ...fields, subcontractor_id: subId, rams_document_id: s(document.id, 100) })
      .select('*')
      .single();
    if (error) return bad(error.message, 500);
    row = data as AssignmentRow;
    isNew = true;
  }

  if (isNew) {
    await logEvent(subId, `rams:${fields.requested_by_email || 'unknown'}`, 'assignment_created', {
      project: fields.rams_project_name,
      document: fields.rams_document_title,
    });
    await sendEmail({
      to: sub.email,
      subject: `New job: ${fields.rams_project_name} — choose your crew`,
      html: emailShell(
        "You've been booked on a Heliaxis job",
        `<p>Hi ${esc(String(sub.contact_name).split(' ')[0])},</p>
         <p>${esc(sub.company_name)} has been added to <strong>${esc(fields.rams_project_name)}</strong>${fields.rams_project_ref ? ` (${esc(fields.rams_project_ref)})` : ''}${fields.start_date ? `, starting ${esc(new Date(`${fields.start_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}.</p>
         ${fields.scope ? `<p>Scope: ${esc(fields.scope)}</p>` : ''}
         ${fields.site_address ? `<p>Site: ${esc(fields.site_address)}</p>` : ''}
         <p>Please sign in to the portal and choose which of your team will be on this job, so we can add them to the RAMS.</p>`,
        { href: `${portalBaseUrl()}/portal`, label: 'Choose your crew' }
      ),
    });
  }

  return NextResponse.json({ assignment: await toPortalAssignment(row) }, { status: isNew ? 201 : 200, headers: noStore });
}
