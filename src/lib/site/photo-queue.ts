'use client';

import { putToStorage, siteFetch, type Outcome } from './client';
import { byJob, changed, delRec, getRec, putRec, withJobLock, type OutboxRecord, type PhotoRecord } from './offline';

/**
 * Photos on the phone until the server has them. Each is shrunk first (2000 px, JPEG 0.82; label
 * and data-badge photos 2400 px, 0.9, so the small print stays readable) with a 480 px thumbnail,
 * and kept in IndexedDB. Sending is prepare (signed links) → straight to storage → save (the job
 * photo row). The full-size copy is deleted only once the server has confirmed the row; the
 * thumbnail stays for the screens.
 */

export const SIZES = { normal: { max: 2000, q: 0.82 }, label: { max: 2400, q: 0.9 }, thumb: { max: 480, q: 0.72 } } as const;
const KEEP_AS_IS = ['image/jpeg', 'image/png', 'image/webp'];

type Shrunk = { blob: Blob; width: number; height: number; mime: string };

async function shrink(file: Blob, max: number, quality: number): Promise<Shrunk> {
  // createImageBitmap turns the photo the right way up from its EXIF.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('no blob');
  return { blob, width, height, mime: 'image/jpeg' };
}

export type AddPhoto = { label?: boolean; read?: boolean; lat?: number; lng?: number };

/** A photo taken (or picked) for a slot: shrunk, kept, and queued to send. */
export async function addPhoto(assignmentId: string, slot: string, file: Blob, opt: AddPhoto = {}): Promise<PhotoRecord> {
  const size = opt.label ? SIZES.label : SIZES.normal;
  let full: Shrunk;
  try {
    full = await shrink(file, size.max, size.q);
  } catch {
    // A phone that can't redraw this kind of picture: keep it as it is when the server takes the type.
    if (!KEEP_AS_IS.includes(file.type)) throw new Error('That photo can’t be read here. Take it again with the camera.');
    full = { blob: file, width: 0, height: 0, mime: file.type };
  }
  const thumb = await shrink(full.blob, SIZES.thumb.max, SIZES.thumb.q).catch(() => full);
  const rec: PhotoRecord = {
    client_id: crypto.randomUUID(),
    assignmentId,
    slot,
    full: full.blob,
    thumb: thumb.blob,
    mime: full.mime,
    width: full.width,
    height: full.height,
    takenAt: new Date().toISOString(),
    tries: 0,
    ...(opt.read ? { read: true } : {}),
    ...(Number.isFinite(opt.lat) && Number.isFinite(opt.lng) ? { lat: opt.lat, lng: opt.lng } : {}),
  };
  await putRec('photos', rec);
  changed();
  queued();
  return rec;
}

/** Take a photo off (before sign-off): gone from the phone now, and from the job once the server hears. */
export async function removePhoto(clientId: string) {
  await withJobLock((await getRec<PhotoRecord>('photos', clientId))?.assignmentId ?? 'none', async () => {
    const rec = await getRec<PhotoRecord>('photos', clientId);
    if (!rec) return;
    await delRec('photos', clientId);
    // It may have reached the server (a try was made): ask for it to go there too.
    if (rec.uploadedId || rec.tries > 0) {
      const op: OutboxRecord = { op_id: crypto.randomUUID(), assignmentId: rec.assignmentId, kind: 'photo-delete', payload: { client_id: clientId }, createdAt: new Date().toISOString(), tries: 0 };
      await putRec('outbox', op);
    }
  });
  changed();
  queued();
}

/** A photo the server held already (from the pack: taken on another phone, or before a reinstall) is removed by its queue id. */
export async function removeServerPhoto(assignmentId: string, clientId: string) {
  const op: OutboxRecord = { op_id: crypto.randomUUID(), assignmentId, kind: 'photo-delete', payload: { client_id: clientId }, createdAt: new Date().toISOString(), tries: 0 };
  await putRec('outbox', op);
  changed();
  queued();
}

export const photosOf = (assignmentId: string) => byJob<PhotoRecord>('photos', assignmentId);
export const waitingPhotos = (list: PhotoRecord[]) => list.filter((p) => p.full && !p.failed);

let queued: () => void = () => {};
/** sync.ts listens, to send soon. */
export const whenPhotoQueued = (fn: () => void) => {
  queued = fn;
};

/** Try again after "Couldn't send": clears the failure. */
export async function retryPhoto(clientId: string) {
  const rec = await getRec<PhotoRecord>('photos', clientId);
  if (!rec) return;
  await putRec('photos', { ...rec, failed: undefined, tries: 0 });
  changed();
  queued();
}

/**
 * Straight to storage, with a time limit (a stalled upload counts as no signal and goes again later).
 * The link can't overwrite (the server makes it without upsert), so nothing here asks to.
 */
const put = (url: string, blob: Blob, mime: string) => putToStorage(url, blob, { 'content-type': mime });

export type SendResult = 'sent' | 'offline' | 'failed' | 'later' | Outcome<unknown>;

/** Send one photo: prepare → upload (photo and thumbnail) → save. Once however often it's retried (the path is named by the phone). */
export async function sendPhoto(rec: PhotoRecord): Promise<SendResult> {
  if (!rec.full) return 'sent';
  const job = rec.assignmentId;
  const mark = async (patch: Partial<PhotoRecord>) => {
    const now = await getRec<PhotoRecord>('photos', rec.client_id);
    // Removed meanwhile: its delete is on the outbox, behind this.
    if (now) await putRec('photos', { ...now, ...patch });
    changed();
  };
  await mark({ tries: rec.tries + 1 });
  // A link is null when that file has arrived already (the server never overwrites one).
  const prep = await siteFetch<{ url: string | null; thumbUrl: string | null }>(`/api/site/jobs/${job}/photos`, {
    body: { action: 'prepare', client_id: rec.client_id, slot: rec.slot, mime: rec.mime, size: rec.full.size },
    job,
  });
  if (!prep.ok) return settle(prep, mark);
  const main = prep.data.url ? await put(prep.data.url, rec.full, rec.mime) : 'ok';
  if (main !== 'ok') return main === 'offline' ? 'offline' : 'later';
  const thumb = prep.data.thumbUrl ? await put(prep.data.thumbUrl, rec.thumb, 'image/jpeg') : 'ok';
  if (thumb !== 'ok') return thumb === 'offline' ? 'offline' : 'later';
  const save = await siteFetch<{ id: string }>(`/api/site/jobs/${job}/photos`, {
    body: {
      action: 'save',
      client_id: rec.client_id,
      slot: rec.slot,
      mime: rec.mime,
      taken_at: rec.takenAt,
      width: rec.width || null,
      height: rec.height || null,
      ...(rec.lat !== undefined ? { lat: rec.lat, lng: rec.lng } : {}),
      ...(rec.read ? { read: true } : {}),
    },
    job,
  });
  if (!save.ok) return settle(save, mark);
  // The server has it: the full-size copy goes, the thumbnail stays.
  await mark({ full: null, uploadedId: save.data.id, failed: undefined });
  return 'sent';
}

async function settle(r: Exclude<Outcome<unknown>, { ok: true }>, mark: (p: Partial<PhotoRecord>) => Promise<void>): Promise<SendResult> {
  if (r.kind === 'offline') return 'offline';
  if (r.kind === 'signed' || (r.kind === 'error' && !r.retry)) {
    await mark({ failed: r.message });
    return 'failed';
  }
  if (r.kind === 'problem') return r;
  return 'later';
}
