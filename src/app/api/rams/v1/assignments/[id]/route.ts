import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, checkRamsKey, noStore, toPortalAssignment } from '@/lib/subcontractors/rams-api';
import { emailShell, esc, logEvent, sendEmail } from '@/lib/subcontractors/server';
import type { AssignmentRow } from '@/lib/subcontractors/types';

export const dynamic = 'force-dynamic';

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from('subcontractor_assignments').select('*').eq('id', id).maybeSingle();
  return (data as AssignmentRow | null) ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkRamsKey(req);
  if (denied) return denied;
  const a = await load((await params).id);
  if (!a) return bad('Not found', 404);
  return NextResponse.json({ assignment: await toPortalAssignment(a) }, { headers: noStore });
}

/** RAMS: the firm was taken off the document — cancel and let them know. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkRamsKey(req);
  if (denied) return denied;
  const a = await load((await params).id);
  if (!a) return bad('Not found', 404);
  if (a.status === 'cancelled') return NextResponse.json({ assignment: await toPortalAssignment(a) }, { headers: noStore });

  const admin = createAdminClient();
  const { data } = await admin
    .from('subcontractor_assignments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', a.id)
    .select('*')
    .single();
  const { data: sub } = await admin.from('subcontractors').select('email, contact_name, company_name').eq('id', a.subcontractor_id).maybeSingle();
  await logEvent(a.subcontractor_id, 'rams', 'assignment_cancelled', { project: a.rams_project_name });
  if (sub) {
    await sendEmail({
      to: sub.email,
      subject: `Job cancelled: ${a.rams_project_name}`,
      html: emailShell(
        'A job has been cancelled',
        `<p>Hi ${esc(String(sub.contact_name).split(' ')[0])},</p>
         <p>${esc(sub.company_name)} is no longer needed on <strong>${esc(a.rams_project_name)}</strong>. No action is needed.</p>`
      ),
    });
  }
  return NextResponse.json({ assignment: await toPortalAssignment(data as AssignmentRow) }, { headers: noStore });
}
