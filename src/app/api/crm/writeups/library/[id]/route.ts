import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';

/** Remove a saved section from the library (documents already using it keep their copy). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { error } = await createAdminClient().from('crm_writeup_library').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
