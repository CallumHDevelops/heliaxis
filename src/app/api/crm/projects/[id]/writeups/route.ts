import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The Documents (tenders and the like) made for this job's customer or organisation, or for the job itself, newest edit first. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('enquiry_id, organisation_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const ors = [`project_id.eq.${id}`];
  if (p.enquiry_id && isUuid(String(p.enquiry_id))) ors.push(`enquiry_id.eq.${p.enquiry_id}`);
  if (p.organisation_id && isUuid(String(p.organisation_id))) ors.push(`organisation_id.eq.${p.organisation_id}`);
  const { data, error } = await db.from('crm_writeups').select('id, number, title, updated_at').or(ors.join(',')).order('updated_at', { ascending: false }).limit(50);
  // Documents not set up yet: nothing to show, not an error.
  if (error) return json({ documents: [] });
  return json({ documents: data ?? [] });
}
