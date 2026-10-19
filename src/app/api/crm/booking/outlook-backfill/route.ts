import { crmSession, isUuid, json } from '@/lib/crm/server';
import { msConfigured } from '@/lib/ms365';
import { schemaReady } from '@/lib/schema-ready';
import { backfillList, markForBackfill, skipBackfill } from '@/lib/booking/calendar-sync';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** The one-off "Copy these dates into Outlook" list: upcoming dates set before the copy existed. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ connected: msConfigured(), items: [] });
  return json({ connected: msConfigured(), items: await backfillList() });
}

/**
 * { project_ids, entry_ids, skip? }: the ticked ones, marked for the sync; skip = the unticked ones
 * ('survey:<id>' | 'install:<id>' | 'entry:<id>'), never copied unless their date changes. With
 * rewrite: true ("Put it back" on a copy moved in Outlook) the CRM's time is written over Outlook's
 * on the next run.
 */
export async function POST(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!msConfigured()) return json({ error: 'Connect Microsoft 365 first.' }, 409);
  const b = await readBody(req);
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && isUuid(x)))].slice(0, 500) : []);
  const skip = (Array.isArray(b.skip) ? b.skip : [])
    .map((x) => (typeof x === 'string' ? /^(survey|install|entry):(.+)$/.exec(x) : null))
    .filter((m): m is RegExpExecArray => !!m && isUuid(m[2]))
    .slice(0, 500)
    .map((m) => ({ kind: m[1] as 'survey' | 'install' | 'entry', id: m[2] }));
  const skipped = skip.length ? await skipBackfill(skip) : 0;
  const marked = await markForBackfill(ids(b.project_ids), ids(b.entry_ids), { rewrite: b.rewrite === true });
  return json({ ok: true, marked, skipped });
}
