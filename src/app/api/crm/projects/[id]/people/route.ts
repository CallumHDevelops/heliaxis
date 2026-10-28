import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { cleanRole, listJobPeople } from '@/lib/crm/job-people';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** The people on a job besides its customer: { ready, people }. ready is false until job-people.sql has run. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const people = await listJobPeople(id);
  return json({ ready: people !== null, people: people ?? [] });
}

/** Link a contact to the job: { contact_id, role? }. Linking them again just changes the role. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { contact_id?: unknown; role?: unknown };
  if (!isUuid(id) || typeof b.contact_id !== 'string' || !isUuid(b.contact_id)) return json({ error: 'Pick a person.' }, 400);
  const db = createAdminClient();
  const [{ data: p }, { data: c }] = await Promise.all([db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle(), db.from('crm_contacts').select('id, name').eq('id', b.contact_id).maybeSingle()]);
  if (!p || !c) return json({ error: 'Not found' }, 404);
  const role = cleanRole(b.role);
  const { error } = await db.from('crm_project_contacts').upsert({ project_id: id, contact_id: b.contact_id, role, created_by: s.user.id }, { onConflict: 'project_id,contact_id' });
  if (error) return json({ error: /relation|does not exist/.test(error.message) ? 'Run supabase/job-people.sql in Supabase first.' : error.message }, error.message.includes('does not exist') ? 409 : 500);
  await logActivity({ enquiryId: p.enquiry_id as string, projectId: id, kind: 'system', body: `👥 ${c.name as string} added to the job${role ? ` (${role})` : ''}`, byId: s.user.id }).catch(() => null);
  return json({ ok: true, people: (await listJobPeople(id)) ?? [] });
}

/** Change someone's role: { contact_id, role }. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { contact_id?: unknown; role?: unknown };
  if (!isUuid(id) || typeof b.contact_id !== 'string' || !isUuid(b.contact_id)) return json({ error: 'Pick a person.' }, 400);
  const { error } = await createAdminClient().from('crm_project_contacts').update({ role: cleanRole(b.role) }).eq('project_id', id).eq('contact_id', b.contact_id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, people: (await listJobPeople(id)) ?? [] });
}

/** Take someone off the job: ?contact_id=. They stay in Contacts. */
export async function DELETE(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  const cid = new URL(req.url).searchParams.get('contact_id') || '';
  if (!isUuid(id) || !isUuid(cid)) return json({ error: 'Pick a person.' }, 400);
  const db = createAdminClient();
  const { data: c } = await db.from('crm_contacts').select('name').eq('id', cid).maybeSingle();
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', id).maybeSingle();
  const { error } = await db.from('crm_project_contacts').delete().eq('project_id', id).eq('contact_id', cid);
  if (error) return json({ error: error.message }, 500);
  if (p && c) await logActivity({ enquiryId: p.enquiry_id as string, projectId: id, kind: 'system', body: `👥 ${c.name as string} taken off the job`, byId: s.user.id }).catch(() => null);
  return json({ ok: true, people: (await listJobPeople(id)) ?? [] });
}
