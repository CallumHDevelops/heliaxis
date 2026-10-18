import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, crmSession, ensureCrmBucket, isUuid, json, logActivity, MAX_PHOTO_BYTES, PHOTO_MIME, thumbPath } from '@/lib/crm/server';
import { PHOTO_KEYS, photoLabel } from '@/lib/crm/stages';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * Step 1 — { action: 'prepare', count }: one-time signed upload URLs (photo + thumbnail each), so
 * images go straight from the phone to storage (Vercel caps request bodies at ~4.5 MB).
 * Step 2 — { action: 'save', items }: record the uploaded photos.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: project } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!project) return json({ error: 'Not found' }, 404);

  if (b.action === 'prepare') {
    const category = String(b.category || '');
    if (!PHOTO_KEYS.includes(category)) return json({ error: 'Pick a photo type.' }, 400);
    const mime = String(b.mime || 'image/jpeg');
    if (!PHOTO_MIME.includes(mime)) return json({ error: 'Photos only (JPG, PNG, WebP, HEIC).' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_PHOTO_BYTES) return json({ error: 'Photos must be under 20 MB.' }, 400);
    await ensureCrmBucket();
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime.startsWith('image/hei') ? 'heic' : 'jpg';
    const path = `${id}/${category}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const store = db.storage.from(CRM_BUCKET);
    const [main, thumb] = await Promise.all([store.createSignedUploadUrl(path), store.createSignedUploadUrl(thumbPath(path))]);
    if (main.error || thumb.error || !main.data || !thumb.data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
    return json({ bucket: CRM_BUCKET, path, token: main.data.token, thumbPath: thumbPath(path), thumbToken: thumb.data.token });
  }

  if (b.action === 'save') {
    type Item = { path: string; category: string; caption?: string; width?: number; height?: number; taken_at?: string };
    const items = (Array.isArray(b.items) ? (b.items as Item[]) : []).filter(
      (i) => typeof i?.path === 'string' && i.path.startsWith(`${id}/`) && !i.path.includes('..') && PHOTO_KEYS.includes(i.category)
    );
    if (!items.length) return json({ error: 'Nothing to save' }, 400);
    const { error } = await db.from('crm_photos').upsert(
      items.map((i) => ({
        project_id: id,
        category: i.category,
        storage_path: i.path,
        caption: i.caption ? String(i.caption).slice(0, 500) : null,
        width: Number(i.width) || null,
        height: Number(i.height) || null,
        taken_at: i.taken_at && !Number.isNaN(Date.parse(i.taken_at)) ? new Date(i.taken_at).toISOString() : null,
        uploaded_by: s.user.id,
      })),
      { onConflict: 'storage_path', ignoreDuplicates: true }
    );
    if (error) return json({ error: error.message }, 500);
    const cats = [...new Set(items.map((i) => photoLabel(i.category).toLowerCase()))].join(', ');
    await logActivity({
      enquiryId: project.enquiry_id,
      projectId: id,
      kind: 'photo',
      body: `${items.length} ${cats} photo${items.length === 1 ? '' : 's'} added`,
      meta: { count: items.length },
      byId: s.user.id,
    });
    await db.from('crm_projects').update({ updated_at: new Date().toISOString() }).eq('id', id);
    return json({ ok: true, saved: items.length });
  }

  return json({ error: 'Unknown action' }, 400);
}
