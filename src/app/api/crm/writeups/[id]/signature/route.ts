import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, ensureDocsBucket, isUuid, json } from '@/lib/crm/server';
import { imageUrls } from '@/lib/quotes/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Each person's saved signature: one PNG per user in the documents bucket (no database column needed). */
const savedPath = (userId: string) => `signatures/${userId}.png`;
const own = (id: string) => `writeups/${id}/sig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;

/** Does this person have a saved signature (and a link to show it)? */
export async function GET(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const p = savedPath(s.user.id);
  const { data } = await createAdminClient().storage.from(DOCS_BUCKET).download(p);
  return json({ saved: !!data, url: data ? ((await imageUrls([p]))[p] ?? null) : null });
}

/**
 * Put a signature in a document. multipart { file (PNG, up to 1 MB), save? } adds the drawn or chosen picture
 * (and remembers it as the person's own with save=1). JSON { use_saved: true } copies their saved signature in.
 * Either way the document gets its own copy, so changing the saved signature later never alters a made document.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: w } = await db.from('crm_writeups').select('id').eq('id', id).maybeSingle();
  if (!w) return json({ error: 'Not found' }, 404);
  await ensureDocsBucket();
  let bytes: Uint8Array;
  let save = false;
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const b = await req.json().catch(() => ({}));
    if (b.use_saved !== true) return json({ error: 'Nothing to add.' }, 400);
    const { data } = await db.storage.from(DOCS_BUCKET).download(savedPath(s.user.id));
    if (!data) return json({ error: 'You haven’t saved a signature yet.' }, 404);
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return json({ error: 'Draw or choose a signature.' }, 400);
    if (file.type !== 'image/png') return json({ error: 'Use a PNG picture.' }, 400);
    if (file.size > 1024 * 1024) return json({ error: 'That picture is over 1 MB.' }, 400);
    bytes = new Uint8Array(await file.arrayBuffer());
    save = form?.get('save') === '1';
  }
  const path = own(id);
  const up = await db.storage.from(DOCS_BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (up.error) return json({ error: 'Couldn’t save the signature. Try again.' }, 500);
  if (save) await db.storage.from(DOCS_BUCKET).upload(savedPath(s.user.id), bytes, { contentType: 'image/png', upsert: true });
  return json({ path, url: (await imageUrls([path]))[path] ?? null });
}
