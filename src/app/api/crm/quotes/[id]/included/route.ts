import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContent } from '@/lib/quotes/types';
import { DEFAULT_OPTIONS, writeIncluded, writeIntro, type IncludedOptions } from '@/lib/quotes/included';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** "What is included", written from the quote as it is on screen now (nothing is saved): { content, options? } → { text, via }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { content?: unknown; options?: Partial<IncludedOptions>; intro?: { first?: string; site?: string } };
  if (b.intro) {
    const t = await writeIntro(cleanContent(b.content), String(b.intro.first ?? '').slice(0, 60), String(b.intro.site ?? '').slice(0, 160));
    if (!t.text) return json({ error: 'Add some items to the quote first, then it can write the introduction.' }, 400);
    return json(t);
  }
  const o = b.options ?? {};
  const opts: IncludedOptions = {
    ancillaries: o.ancillaries ?? DEFAULT_OPTIONS.ancillaries,
    access: o.access ?? DEFAULT_OPTIONS.access,
    handover: o.handover ?? DEFAULT_OPTIONS.handover,
    compliance: o.compliance ?? DEFAULT_OPTIONS.compliance,
    keyPoints: typeof o.keyPoints === 'string' ? o.keyPoints.slice(0, 600) : '',
  };
  const out = await writeIncluded(cleanContent(b.content), opts);
  if (!out.text) return json({ error: 'Add some items to the quote first, then it can write what is included.' }, 400);
  return json(out);
}
