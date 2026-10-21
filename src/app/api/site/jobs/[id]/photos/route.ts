import { after } from 'next/server';
import { CRM_BUCKET, ensureCrmBucket, MAX_PHOTO_BYTES, thumbPath } from '@/lib/crm/server';
import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { afterAnswers, afterPhoto, lateKeysFor } from '@/lib/site/hooks';
import { openPutRightSlots } from '@/lib/site/returns';
import { isPutRightSlot } from '@/lib/site/review-shared';
import { logSiteEvent, readAssignment } from '@/lib/site/server';
import { getSiteSettings } from '@/lib/site/settings';

export const dynamic = 'force-dynamic';

const SLOT = /^[A-Za-z][A-Za-z0-9_]{0,30}(?::[A-Za-z0-9_-]{1,30})?$/;
const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const MIME = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * <job>/site/<assignment>/<slot>/<phone's queue id>.jpg: named by the phone, so a retried upload finds
 * itself (and is never overwritten). In the job's own folder of crm-photos, so merging jobs moves them and deleting the customer
 * removes them (crm/merge.ts, crm/delete-customer.ts).
 */
const pathFor = (projectId: string, assignmentId: string, slot: string, clientId: string, mime: string) =>
  `${projectId}/site/${assignmentId}/${slot.replace(':', '_')}/${clientId.toLowerCase()}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`;

/**
 * Trade photos, straight from the phone to storage (Vercel limits request bodies):
 * - { action: 'prepare', client_id, slot, mime, size }: signed upload links for the photo and its thumbnail.
 * - { action: 'save', client_id, slot, mime, taken_at, width, height, lat?, lng?, read? }: record it as a
 *   job photo (category 'site', so the customer doesn't see it), once however often it's retried.
 * - { action: 'delete', client_id }: before sign-off only.
 * Photos for a signed-off form are refused, apart from the slots still open (the scaffold's tag and
 * strike, and PR:<n> while a return to site waits for their put right).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slot = String(b.slot ?? '');
  const clientId = b.client_id;
  if (!isUuid(clientId)) return siteJson({ error: 'bad', message: 'That photo can’t be sent.' }, 400);
  const signed = a.status === 'signed' || a.status === 'done';
  const late = signed ? new Set(await lateKeysFor(s.db, a)) : null;
  const putRight = isPutRightSlot(slot) || b.action === 'delete' ? await openPutRightSlots(s.db, a.id) : new Set<string>();
  // A put right's photos only while its return to site is open; the form's own slots as before.
  const open = (sl: string) => (isPutRightSlot(sl) ? putRight.has(sl) : !late || late.has(sl) || late.has(sl.split(':')[0]));

  if (b.action === 'prepare') {
    const mime = String(b.mime || 'image/jpeg');
    if (!SLOT.test(slot) || !MIME.includes(mime)) return siteJson({ error: 'bad', message: 'That photo can’t be sent.' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_PHOTO_BYTES) return siteJson({ error: 'too_big', message: 'That photo is too big to send.' }, 400);
    if (!open(slot)) return siteJson({ error: 'signed', message: 'This form is signed off. Ask the office to reopen it.' }, 409);
    await ensureCrmBucket();
    const path = pathFor(a.project_id, a.id, slot, clientId, mime);
    const store = s.db.storage.from(CRM_BUCKET);
    // Upload links that can't overwrite: a photo that's there (a retry after the upload landed) gets
    // no link (null: the phone skips it), so a link kept back can't swap the photo after it's signed.
    const link = async (p: string): Promise<string | null | undefined> => {
      if ((await store.exists(p)).data) return null;
      const r = await store.createSignedUploadUrl(p);
      return r.error || !r.data ? undefined : r.data.signedUrl;
    };
    const [url, thumbUrl] = await Promise.all([link(path), link(thumbPath(path))]);
    if (url === undefined || thumbUrl === undefined) return siteJson({ error: 'busy', message: 'Couldn’t get ready to send. It will try again.' }, 503);
    return siteJson({ path, url, thumbPath: thumbPath(path), thumbUrl });
  }

  if (b.action === 'save') {
    const mime = String(b.mime || 'image/jpeg');
    if (!SLOT.test(slot) || !MIME.includes(mime)) return siteJson({ error: 'bad', message: 'That photo can’t be sent.' }, 400);
    if (!open(slot)) return siteJson({ error: 'signed', message: 'This form is signed off. Ask the office to reopen it.' }, 409);
    const path = pathFor(a.project_id, a.id, slot, clientId, mime);
    // No row without its photo: the photo and its thumbnail must have arrived (else the phone sends them again).
    const { data: saved } = await s.db.from('crm_photos').select('id').eq('storage_path', path).maybeSingle();
    if (!saved) {
      const store = s.db.storage.from(CRM_BUCKET);
      const [m, t] = await Promise.all([store.exists(path), store.exists(thumbPath(path))]);
      if (!m.data || !t.data) return siteJson({ error: 'busy', message: 'That photo hasn’t arrived yet. It will try again.' }, 503);
    }
    const takenAt = typeof b.taken_at === 'string' && !Number.isNaN(Date.parse(b.taken_at)) ? new Date(b.taken_at).toISOString() : null;
    const { error } = await s.db.from('crm_photos').upsert(
      {
        project_id: a.project_id,
        category: 'site',
        storage_path: path,
        width: Number(b.width) || null,
        height: Number(b.height) || null,
        taken_at: takenAt,
        assignment_id: a.id,
        slot,
      },
      { onConflict: 'storage_path', ignoreDuplicates: true }
    );
    if (error) return siteJson({ error: 'busy', message: 'That photo didn’t save. It will try again.' }, 503);
    const { data: row } = await s.db.from('crm_photos').select('id').eq('storage_path', path).maybeSingle();
    if (!row) return siteJson({ error: 'busy', message: 'That photo didn’t save. It will try again.' }, 503);
    // The first photo counts as starting, as the first answer does.
    if (a.status === 'sent' || a.status === 'opened') {
      const now = new Date().toISOString();
      await s.db.from('site_assignments').update({ status: 'started', started_at: a.started_at ?? now, updated_at: now }).eq('id', a.id).in('status', ['sent', 'opened']);
    }
    // Location only when the owner has turned location stamps on (D18); kept in the history, never on a customer's document.
    if ((await getSiteSettings()).locationStamps && Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng))) {
      await logSiteEvent(s.db, a.id, 'trade', 'photo_location', { photo: row.id, lat: Number(b.lat), lng: Number(b.lng) });
    }
    const id = row.id as string;
    const read = b.read === true;
    after(async () => {
      // A label read first: what it finds can raise a flag (a model that isn't the design's).
      await afterPhoto(s.db, a, { id, slot, read });
      const fresh = await readAssignment(s.db, a.id);
      if (fresh) await afterAnswers(s.db, fresh);
    });
    return siteJson({ id, path });
  }

  if (b.action === 'delete') {
    const { data: rows } = await s.db.from('crm_photos').select('id, storage_path, slot').eq('assignment_id', a.id).like('storage_path', `%/${clientId.toLowerCase()}.%`);
    // Photos on a signed-off form stay; the slots still open (the tag, the strike) can lose one.
    if ((rows ?? []).some((r) => !open(String(r.slot ?? '')))) return siteJson({ error: 'signed', message: 'Photos on a signed-off form stay. Ask the office if one needs taking off.' }, 409);
    for (const r of (rows ?? []) as { id: string; storage_path: string }[]) {
      await s.db.storage.from(CRM_BUCKET).remove([r.storage_path, thumbPath(r.storage_path)]);
      await s.db.from('crm_photos').delete().eq('id', r.id);
    }
    await logSiteEvent(s.db, a.id, 'trade', 'photo_deleted', { client_id: clientId });
    const fresh = await readAssignment(s.db, a.id);
    if (fresh) await afterAnswers(s.db, fresh);
    return siteJson({ ok: true });
  }
  return siteJson({ error: 'bad', message: 'Unknown action' }, 400);
}
