import { crmSession, ensurePortalToken, isUuid, json, portalUrl } from '@/lib/crm/server';
import { PORTAL_CLOSED_MSG } from '@/lib/crm/stages';

export const dynamic = 'force-dynamic';

/** The customer's portal link (made on first request, once the job has started). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const token = await ensurePortalToken(id);
  if (!token) return json({ error: PORTAL_CLOSED_MSG, closed: true }, 400);
  return json({ url: portalUrl(token) });
}
