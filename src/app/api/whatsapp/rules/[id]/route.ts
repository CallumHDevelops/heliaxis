import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid, json, session } from '@/lib/whatsapp/routes';
import { cleanRule } from '../clean';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const rule = cleanRule(await req.json().catch(() => ({})), true);
  if ('error' in rule) return json(rule, 400);
  const { data, error } = await createAdminClient().from('whatsapp_rules').update(rule).eq('id', id).select('*').single();
  if (error) return json({ error: error.message }, 500);
  return json({ item: data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { error } = await createAdminClient().from('whatsapp_rules').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
