import { crmSession, isUuid, json } from '@/lib/crm/server';
import { msConfigured } from '@/lib/ms365';
import { schemaReady } from '@/lib/schema-ready';
import { backfillList, markForBackfill } from '@/lib/booking/calendar-sync';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** The one-off "Copy these dates into Outlook" list: upcoming dates set before the copy existed. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ connected: msConfigured(), items: [] });
  return json({ connected: msConfigured(), items: await backfillList() });
}

/** { project_ids, entry_ids }: the ticked ones, marked for the sync. */
export async function POST(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!msConfigured()) return json({ error: 'Connect Microsoft 365 first.' }, 409);
  const b = await readBody(req);
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && isUuid(x)))].slice(0, 500) : []);
  const marked = await markForBackfill(ids(b.project_ids), ids(b.entry_ids));
  return json({ ok: true, marked });
}
