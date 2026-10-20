import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { NOT_READY, ordersReady, suggestFor } from '@/lib/purchase-orders/server';

export const dynamic = 'force-dynamic';

/** ?project=: what a new order on that job starts with (lines from the job, never prices), its site and the office address. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const project = new URL(req.url).searchParams.get('project') ?? '';
  if (!isUuid(project)) return json({ error: 'Not found' }, 404);
  const s = await suggestFor(createAdminClient(), project);
  return s ? json(s) : json({ error: 'That job isn’t there any more.' }, 404);
}
