import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';

/** { hidden: boolean }: keep one photo out of the content library (or put it back). CRM staff only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { hidden?: unknown };
  const { error } = await createAdminClient().from('crm_photos').update({ content_hidden: b.hidden === true }).eq('id', id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}
