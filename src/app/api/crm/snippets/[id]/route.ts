import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if ('title' in b) u.title = String(b.title || '').trim().slice(0, 80);
  if ('body' in b) u.body = String(b.body || '').trim().slice(0, 4000);
  if (u.title === '' || u.body === '') return json({ error: 'Title and message can’t be empty.' }, 400);
  const { error } = await createAdminClient().from('crm_snippets').update(u).eq('id', id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  await createAdminClient().from('crm_snippets').delete().eq('id', id);
  return json({ ok: true });
}
