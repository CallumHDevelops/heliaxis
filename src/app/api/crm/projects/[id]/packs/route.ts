import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { packsView } from '@/lib/docs/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The three packs on a job (Proposal, In-House, Handover) as line items for the Docs tab, and how many general files there are. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const v = await packsView(createAdminClient(), id);
  return v ? json(v) : json({ error: 'Not found' }, 404);
}
