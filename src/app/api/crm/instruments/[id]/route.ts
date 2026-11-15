import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanInstrument } from '@/lib/instruments/shared';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const c = cleanInstrument((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ('name' in c && !c.name) return json({ error: 'Give it a name.' }, 400);
  const { data, error } = await createAdminClient().from('test_instruments').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) return json({ error: error.message }, 500);
  return json({ instrument: data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can delete an instrument. Retire it instead.' }, 403);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { error } = await createAdminClient().from('test_instruments').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
