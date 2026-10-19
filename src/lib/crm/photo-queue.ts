'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Site photos from the phone: shrink on the device (quick on 4G), park them in IndexedDB, and upload
 * from there — so photos taken with no signal go up by themselves when it comes back.
 *
 * Safe to retry: each photo's file is named after its queue id (client_id), the upload may overwrite
 * it and the save upserts on the file path, so a reply lost on the way back just repeats harmlessly.
 * Survey photos carry the survey and slot (and any drawing made before they went up).
 */

export type QueuedPhoto = {
  id: string;
  projectId: string;
  category: string;
  full: Blob;
  thumb: Blob;
  mime: string;
  width: number;
  height: number;
  takenAt: string;
  caption?: string;
  tries: number;
  /** Survey photos: which survey and which question ("R4:r1"). */
  surveyId?: string;
  slot?: string;
  /** A drawing made before the photo went up: the vectors and the flattened JPEG. */
  markup?: unknown;
  markupBlob?: Blob;
  /** Set when the server said no for good ("survey deleted"): it waits for a retake or Remove. */
  failed?: string;
};

const DB = 'hx-crm';
const STORE = 'photo-queue';
export const QUEUE_CHANGED = 'hx-photo-queue';
/** Fired on window for each photo that went up: detail { id (queue id), photoId, projectId, surveyId?, slot? }. */
export const PHOTO_UPLOADED = 'hx-photo-uploaded';
export type PhotoUploadedDetail = { id: string; photoId: string | null; projectId: string; surveyId?: string; slot?: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
  });
}

export const queued = () => tx<QueuedPhoto[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedPhoto[]>);
const getOne = (id: string) => tx<QueuedPhoto | undefined>('readonly', (s) => s.get(id) as IDBRequest<QueuedPhoto | undefined>);
const put = (p: QueuedPhoto) => tx('readwrite', (s) => s.put(p));
const remove = (id: string) => tx('readwrite', (s) => s.delete(id));
const changed = () => window.dispatchEvent(new Event(QUEUE_CHANGED));

/** Photos waiting for one survey (failed ones included, so they can be shown with "Remove"). */
export async function queuedForSurvey(surveyId: string): Promise<QueuedPhoto[]> {
  return (await queued()).filter((p) => p.surveyId === surveyId);
}

/** Take a photo off the queue ("Remove" on one that couldn't upload, or delete before it went up). */
export async function removeQueued(id: string) {
  await remove(id);
  changed();
}

/** Try a failed photo again. */
export async function retryQueued(id: string) {
  const p = await getOne(id);
  if (!p) return 0;
  await put({ ...p, failed: undefined, tries: 0 });
  changed();
  return uploadQueued();
}

/** A drawing made on a photo that hasn't gone up yet: kept on the queue item and sent with it. */
export async function setQueuedMarkup(id: string, markup: unknown, blob: Blob | null) {
  const p = await getOne(id);
  if (!p) return false;
  await put({ ...p, markup: markup ?? undefined, markupBlob: blob ?? undefined });
  changed();
  return true;
}

/** Move a waiting survey photo to another question (a roof area renumbered when two phones' answers merged). */
export async function setQueuedSlot(id: string, slot: string) {
  const p = await getOne(id);
  if (!p) return false;
  await put({ ...p, slot });
  changed();
  return true;
}

/** Some Android galleries give HEIC photos no type; go by the file name. */
const mimeOf = (f: File) => f.type || (/\.hei[cf]$/i.test(f.name) ? 'image/heic' : '');

/** Downscale to `max` px on the long side as JPEG; keeps the original if the browser can't decode it (e.g. HEIC). */
async function shrink(file: Blob, mime: string, max: number, quality: number) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob) return { blob, w, h, mime: 'image/jpeg', shrunk: true };
  } catch {
    /* fall through */
  }
  // Uploaded as is (the server turns HEIC into JPEG); the blob needs its type for the upload.
  const type = mime || 'image/jpeg';
  return { blob: file.type === type ? file : new Blob([file], { type }), w: 0, h: 0, mime: type, shrunk: false };
}

async function enqueue(projectId: string, category: string, f: File, extra: Partial<QueuedPhoto> = {}): Promise<string | null> {
  const mime = mimeOf(f);
  if (!mime.startsWith('image/')) return null;
  const full = await shrink(f, mime, 2000, 0.82);
  const thumb = full.shrunk ? await shrink(f, mime, 480, 0.7) : full;
  const id = crypto.randomUUID();
  await put({
    id,
    projectId,
    category,
    full: full.blob,
    thumb: thumb.blob,
    mime: full.mime,
    width: full.w,
    height: full.h,
    takenAt: new Date(f.lastModified || Date.now()).toISOString(),
    tries: 0,
    ...extra,
  });
  return id;
}

/** Add camera/gallery picks to the queue, then try uploading. */
export async function addPhotos(projectId: string, category: string, files: FileList | File[]) {
  for (const f of Array.from(files)) await enqueue(projectId, category, f);
  changed();
  return uploadQueued();
}

/** Add photos for one survey question. Resolves to their queue ids straight away; uploading carries on. */
export async function addSurveyPhotos(projectId: string, surveyId: string, slot: string, files: FileList | File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const f of Array.from(files)) {
    const id = await enqueue(projectId, 'survey', f, { surveyId, slot });
    if (id) ids.push(id);
  }
  changed();
  void uploadQueued();
  return ids;
}

/* ── Uploading ────────────────────────────────────────────────────────────────── */

let signInNeeded = false;
/** True after the server said "signed out": show "Sign in again to upload your photos". */
export const queueNeedsSignIn = () => signInNeeded;

type Outcome = { kind: 'ok'; photoId: string | null } | { kind: 'gone' } | { kind: 'failed'; message: string } | { kind: 'signin' } | { kind: 'later' };

/** A 4xx other than 401/408/429 is the server saying no for good; 401 is signed out; the rest is "try later". */
function outcomeOf(status: number, error: string | undefined): Outcome {
  if (status === 401) return { kind: 'signin' };
  if (status === 408 || status === 429 || status >= 500) return { kind: 'later' };
  if (status === 404 && error !== 'survey_not_found') return { kind: 'gone' }; // the job was deleted
  if (status >= 400) return { kind: 'failed', message: error === 'survey_not_found' ? 'survey deleted' : error || 'not accepted' };
  return { kind: 'later' };
}

/** The photo store refusing the file itself (too big, wrong type) is for good; anything else, try later. */
function storageOutcome(err: unknown): Outcome {
  const e = (err ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = Number(e.status ?? e.statusCode);
  if (status >= 400 && status < 500 && ![401, 408, 429].includes(status))
    return { kind: 'failed', message: `the photo store wouldn’t take it (${String(e.message || status)})` };
  return { kind: 'later' };
}

async function post(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> } | null> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: r.status, data };
  } catch {
    return null; // no signal
  }
}

type Supabase = ReturnType<typeof createClient>;

async function sendOne(supabase: Supabase, p: QueuedPhoto): Promise<Outcome> {
  const url = `/api/crm/projects/${p.projectId}/photos`;
  const withMarkup = !!(p.surveyId && p.markup && p.markupBlob);
  const prep = await post(url, {
    action: 'prepare',
    category: p.category,
    mime: p.mime,
    size: p.full.size,
    client_id: p.id,
    ...(p.surveyId ? { survey_id: p.surveyId, slot: p.slot } : {}),
    ...(withMarkup ? { with_markup: true } : {}),
  });
  if (!prep) return { kind: 'later' };
  if (prep.status !== 200) return outcomeOf(prep.status, String(prep.data.error || ''));
  const u = prep.data as { bucket: string; path: string; token: string; thumbPath: string; thumbToken: string; markupPath?: string; markupToken?: string };
  try {
    const store = supabase.storage.from(u.bucket);
    const a = await store.uploadToSignedUrl(u.path, u.token, p.full, { contentType: p.mime, upsert: true });
    if (a.error) return storageOutcome(a.error);
    // A thumbnail only when the phone could make one; the server makes it for HEIC.
    if (p.thumb.type === 'image/jpeg')
      await store.uploadToSignedUrl(u.thumbPath, u.thumbToken, p.thumb, { contentType: 'image/jpeg', upsert: true }).catch(() => null);
    let markupPath: string | null = null;
    if (withMarkup && u.markupPath && u.markupToken && p.markupBlob) {
      const m = await store.uploadToSignedUrl(u.markupPath, u.markupToken, p.markupBlob, { contentType: 'image/jpeg', upsert: true });
      if (!m.error) markupPath = u.markupPath;
    }
    const save = await post(url, {
      action: 'save',
      items: [
        {
          path: u.path,
          category: p.category,
          width: p.width,
          height: p.height,
          taken_at: p.takenAt,
          caption: p.caption,
          mime: p.mime,
          ...(p.surveyId
            ? { survey_id: p.surveyId, slot: p.slot, ...(markupPath ? { markup: p.markup, markup_path: markupPath } : {}) }
            : {}),
        },
      ],
    });
    if (!save) return { kind: 'later' };
    if (save.status !== 200) return outcomeOf(save.status, String(save.data.error || ''));
    const ids = (save.data.ids || {}) as Record<string, string>;
    return { kind: 'ok', photoId: ids[u.path] ?? null };
  } catch {
    return { kind: 'later' };
  }
}

async function drain(): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const supabase = createClient();
  let done = 0;
  for (const p of await queued()) {
    if (p.failed) continue;
    const r = await sendOne(supabase, p);
    if (r.kind === 'ok') {
      signInNeeded = false;
      await remove(p.id);
      done++;
      window.dispatchEvent(
        new CustomEvent<PhotoUploadedDetail>(PHOTO_UPLOADED, {
          detail: { id: p.id, photoId: r.photoId, projectId: p.projectId, surveyId: p.surveyId, slot: p.slot },
        })
      );
      changed();
    } else if (r.kind === 'gone') {
      await remove(p.id); // the job was deleted
      changed();
    } else if (r.kind === 'failed') {
      await put({ ...p, failed: r.message, tries: p.tries + 1 });
      changed(); // carry on with the next photo
    } else if (r.kind === 'signin') {
      signInNeeded = true;
      break;
    } else {
      await put({ ...p, tries: p.tries + 1 });
      break; // probably offline — try again later
    }
  }
  return done;
}

let running: Promise<number> | null = null;

/**
 * Upload everything waiting (one at a time). Returns how many went up. Only one tab uploads at a
 * time (Web Locks; another tab already uploading means this one skips), so no photo goes up twice.
 */
export function uploadQueued(): Promise<number> {
  if (running) return running;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const job = locks?.request
    ? (async () => await locks.request('hx-photo-queue', { ifAvailable: true }, async (lock) => (lock ? drain() : 0)))()
    : drain();
  running = job
    .catch(() => 0)
    .finally(() => {
      running = null;
      changed();
    });
  return running;
}

/** Retry when the signal comes back, and when the app comes to the front. */
export function watchQueue() {
  const go = () => void uploadQueued();
  window.addEventListener('online', go);
  document.addEventListener('visibilitychange', go);
  const t = setInterval(go, 60_000);
  go();
  return () => {
    window.removeEventListener('online', go);
    document.removeEventListener('visibilitychange', go);
    clearInterval(t);
  };
}
