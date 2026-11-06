import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { formsReady, listForms } from '@/lib/templates/store';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The forms that belong on this project (by its products), each with where it is: not started, draft or signed, and how much is done. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  if (!(await formsReady(db))) return json({ error: 'Forms are not set up yet', ready: false }, 503);
  const { data: p } = await db.from('crm_projects').select('id, products').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const forms = await listForms(db, id, (p.products as string[] | null) ?? []);
  return json({ ready: true, forms });
}
