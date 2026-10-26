import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { imageUrls, quoteRow, readQuote } from '@/lib/quotes/server';
import { cleanContent } from '@/lib/quotes/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const q = await readQuote(id);
  if (!q) return json({ error: 'Not found' }, 404);
  const paths = q.content.blocks.flatMap((b) => (b.type === 'images' ? b.images.map((i) => i.path) : []));
  return json({ quote: q, imageUrls: await imageUrls(paths) });
}

/** Save the draft: { title, content, valid_until, deposit_pence }. A sent quote can still be edited, then sent again. */
export async function PUT(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.title === 'string') patch.title = b.title.trim().slice(0, 120) || 'Your Heliaxis quote';
  if (b.content) patch.content = cleanContent(b.content);
  if ('valid_until' in b) patch.valid_until = /^\d{4}-\d{2}-\d{2}$/.test(String(b.valid_until)) ? b.valid_until : null;
  if ('deposit_pence' in b) patch.deposit_pence = Number(b.deposit_pence) > 0 ? Math.round(Number(b.deposit_pence)) : null;
  const { data, error } = await createAdminClient().from('crm_quotes').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'Not found' }, 404);
  return json({ ok: true, quote: quoteRow(data) });
}

export async function DELETE(_: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const q = await readQuote(id);
  if (!q) return json({ error: 'Not found' }, 404);
  if (q.status !== 'draft') return json({ error: 'Only a draft can be deleted. A sent quote stays on the record.' }, 409);
  const { error } = await createAdminClient().from('crm_quotes').delete().eq('id', id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}
