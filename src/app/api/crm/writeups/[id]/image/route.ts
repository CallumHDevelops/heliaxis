import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, ensureDocsBucket, isUuid, json } from '@/lib/crm/server';
import { imageUrls } from '@/lib/quotes/server';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Add a picture to a document (JPEG or PNG, up to 3 MB; the editor shrinks it first): returns its path and a link to show it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose a picture.' }, 400);
  const ext = TYPES[file.type];
  if (!ext) return json({ error: 'Use a JPEG or PNG picture.' }, 400);
  if (file.size > 3 * 1024 * 1024) return json({ error: 'That picture is over 3 MB.' }, 400);
  const db = createAdminClient();
  const { data: w } = await db.from('crm_writeups').select('id').eq('id', id).maybeSingle();
  if (!w) return json({ error: 'Not found' }, 404);
  await ensureDocsBucket();
  const path = `writeups/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const up = await db.storage.from(DOCS_BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) return json({ error: 'Couldn’t save the picture. Try again.' }, 500);
  return json({ path, url: (await imageUrls([path]))[path] ?? null });
}
