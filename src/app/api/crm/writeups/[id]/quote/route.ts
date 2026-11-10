import { crmSession, isUuid, json } from '@/lib/crm/server';
import { loadQuoteTables } from '@/lib/writeups/server';

export const dynamic = 'force-dynamic';

/** One quote as a table, for the editor's page preview: ?q=<quote id> → { table }. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!isUuid(q)) return json({ error: 'Not found' }, 404);
  const tables = await loadQuoteTables({ subtitle: '', blocks: [{ id: 'q', type: 'quote', quote_id: q, caption: '' }] });
  const table = tables.get(q);
  return table ? json({ table }) : json({ error: 'Not found' }, 404);
}
