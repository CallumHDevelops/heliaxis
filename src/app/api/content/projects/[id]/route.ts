import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { data } = await createAdminClient().from('crm_projects').select('content_ok').eq('id', id).maybeSingle();
  return data ? json({ content_ok: (data as { content_ok: boolean }).content_ok !== false }) : json({ error: 'Not found' }, 404);
}

/** { content_ok: boolean }: share this project's work photos with the content team, or stop. Every new project starts shared. */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { content_ok?: unknown };
  const { error } = await createAdminClient().from('crm_projects').update({ content_ok: b.content_ok !== false, content_ok_at: new Date().toISOString(), content_ok_by: s.user.id }).eq('id', id);
  return error ? json({ error: error.message }, 500) : json({ ok: true, content_ok: b.content_ok !== false });
}
