import { crmSession, json } from '@/lib/crm/server';
import { readSavedItems, writeSavedItems } from '@/lib/quotes/items';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  return json({ items: await readSavedItems() });
}

/** Replace the list: { items }. The builder adds and removes saved items by sending the whole list. */
export async function PUT(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const r = await writeSavedItems(b.items);
  return r.ok ? json({ items: r.items }) : json({ error: r.error }, 500);
}
