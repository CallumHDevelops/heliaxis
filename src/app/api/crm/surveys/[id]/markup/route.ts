import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, crmSession, ensureCrmBucket, isUuid, json } from '@/lib/crm/server';
import { cleanMarkup, MARKUP_MAX_BYTES, markupBytes, markupPathFor } from '@/lib/surveys/markup';
import { getSurvey, recomputeFlags, SIGNED_SECONDS, type PhotoRow } from '@/lib/surveys/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * A drawing on a photo that has already gone up (drawings on queued photos travel with the photo).
 * Works on finished surveys too: the roof layout and cable routes can be drawn later in the van.
 * { action: 'prepare', photo_id } → a one-time upload URL for the flattened JPEG;
 * { action: 'save', photo_id, markup, markup_path } → keep the drawing (markup null removes it).
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; photo_id?: unknown; markup?: unknown; markup_path?: unknown };
  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) return json({ error: 'survey_not_found' }, 404);
  const photoId = String(b.photo_id || '');
  if (!isUuid(photoId)) return json({ error: 'photo_not_found' }, 404);
  const { data } = await db.from('crm_photos').select('*').eq('id', photoId).maybeSingle();
  const photo = data as PhotoRow | null;
  if (!photo || photo.survey_id !== id) return json({ error: 'photo_not_found' }, 404);
  const path = markupPathFor(photo.storage_path);
  const store = db.storage.from(CRM_BUCKET);

  if (b.action === 'prepare') {
    await ensureCrmBucket();
    const { data: up, error } = await store.createSignedUploadUrl(path, { upsert: true });
    if (error || !up) return json({ error: 'Couldn’t prepare the upload. Try again.' }, 500);
    return json({ bucket: CRM_BUCKET, path, token: up.token });
  }

  if (b.action === 'save') {
    if (b.markup == null) {
      await db.from('crm_photos').update({ markup: null, markup_path: null }).eq('id', photoId);
      if (photo.markup_path) await store.remove([photo.markup_path]);
      const r = await recomputeFlags(id);
      return json({ ok: true, flags: r?.flags ?? null, drawingsLeft: r?.drawingsLeft ?? null, markupUrl: null });
    }
    const markup = cleanMarkup(b.markup);
    if (!markup) return json({ error: 'There’s nothing in that drawing.' }, 400);
    if (markupBytes(markup) > MARKUP_MAX_BYTES) return json({ error: 'That drawing is too detailed to save. Undo a few lines and try again.' }, 413);
    const flattened = b.markup_path === path ? path : null;
    const { error } = await db.from('crm_photos').update({ markup, markup_path: flattened }).eq('id', photoId);
    if (error) return json({ error: error.message }, 500);
    const [r, signed] = await Promise.all([
      recomputeFlags(id),
      flattened ? store.createSignedUrl(flattened, SIGNED_SECONDS) : Promise.resolve({ data: null }),
    ]);
    return json({ ok: true, flags: r?.flags ?? null, drawingsLeft: r?.drawingsLeft ?? null, markupUrl: signed.data?.signedUrl ?? null });
  }

  return json({ error: 'Unknown action' }, 400);
}
