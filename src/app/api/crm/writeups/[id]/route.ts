import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { imageUrls } from '@/lib/quotes/server';
import { forWhom, quotesFor, readWriteup } from '@/lib/writeups/server';
import { cleanContent } from '@/lib/writeups/types';

export const dynamic = 'force-dynamic';

/** One document for the editor: its blocks, who it is for, links to show its pictures, and the quotes a Quote table block can use. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const w = await readWriteup(id);
  if (!w) return json({ error: 'Not found' }, 404);
  // Pictures in storage get a link; the site's own ('assets/…') are shown from the website itself.
  const paths = w.content.blocks.flatMap((b) => (b.type === 'image' && b.path && !b.path.startsWith('assets/') ? [b.path] : b.type === 'video' && b.thumb ? [b.thumb] : []));
  const [who, urls, quotes] = await Promise.all([forWhom(w), imageUrls(paths), quotesFor(w)]);
  return json({ document: w, who, urls, quotes });
}

/** Save: { title?, content?, enquiry_id?, organisation_id?, project_id? } (assigning to a customer or organisation, or clearing it with null). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('title' in b) patch.title = String(b.title || '').trim().slice(0, 200) || 'Untitled document';
  if ('content' in b) patch.content = cleanContent(b.content);
  for (const k of ['enquiry_id', 'organisation_id', 'project_id'] as const) {
    if (k in b) patch[k] = b[k] && isUuid(String(b[k])) ? String(b[k]) : null;
  }
  const { error } = await createAdminClient().from('crm_writeups').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can delete a document.' }, 403);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { error } = await createAdminClient().from('crm_writeups').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
