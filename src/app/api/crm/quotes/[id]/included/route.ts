import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContent } from '@/lib/quotes/types';
import { writeIncluded } from '@/lib/quotes/included';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** "What is included", written from the quote as it is on screen now (nothing is saved): { content } → { text, via }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { content?: unknown };
  const out = await writeIncluded(cleanContent(b.content));
  if (!out.text) return json({ error: 'Add some items to the quote first, then it can write what is included.' }, 400);
  return json(out);
}
