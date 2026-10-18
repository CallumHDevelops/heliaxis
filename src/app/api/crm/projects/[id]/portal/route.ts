import { crmSession, ensurePortalToken, isUuid, json, logActivity, portalUrl, resetPortalToken } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PORTAL_CLOSED_MSG } from '@/lib/crm/stages';

export const dynamic = 'force-dynamic';

/**
 * The customer's portal link (made on first request, once the job has started).
 * { reset: true } replaces it, so the old link stops working.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  if (b?.reset === true) {
    const token = await resetPortalToken(id);
    if (!token) return json({ error: PORTAL_CLOSED_MSG, closed: true }, 400);
    const { data: p } = await createAdminClient().from('crm_projects').select('enquiry_id').eq('id', id).maybeSingle();
    if (p) await logActivity({ enquiryId: p.enquiry_id, projectId: id, kind: 'system', body: 'Portal link reset. The old link no longer works', byId: s.user.id });
    return json({ url: portalUrl(token), reset: true });
  }
  const token = await ensurePortalToken(id);
  if (!token) return json({ error: PORTAL_CLOSED_MSG, closed: true }, 400);
  return json({ url: portalUrl(token) });
}
