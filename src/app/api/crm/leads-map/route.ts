import { crmSession, json } from '@/lib/crm/server';
import { leadAreas } from '@/lib/crm/lead-geo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Leads by postcode area for the map: GET ?days=90. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const days = Math.min(730, Math.max(7, Number(new URL(req.url).searchParams.get('days')) || 90));
  try {
    return json(await leadAreas(days));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not build the map' }, 500);
  }
}
