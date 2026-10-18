'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Site photos from the phone: shrink on the device (quick on 4G), park them in IndexedDB, and upload
 * from there — so photos taken with no signal go up by themselves when it comes back.
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
};

const DB = 'hx-crm';
const STORE = 'photo-queue';
export const QUEUE_CHANGED = 'hx-photo-queue';

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
const put = (p: QueuedPhoto) => tx('readwrite', (s) => s.put(p));
const remove = (id: string) => tx('readwrite', (s) => s.delete(id));
const changed = () => window.dispatchEvent(new Event(QUEUE_CHANGED));

/** Downscale to `max` px on the long side as JPEG; keeps the original if the browser can't decode it (e.g. HEIC). */
async function shrink(file: Blob, max: number, quality: number) {
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
    if (blob) return { blob, w, h, mime: 'image/jpeg' };
  } catch {
    /* fall through */
  }
  return { blob: file, w: 0, h: 0, mime: file.type || 'image/jpeg' };
}

/** Add camera/gallery picks to the queue, then try uploading. */
export async function addPhotos(projectId: string, category: string, files: FileList | File[]) {
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('image/')) continue;
    const full = await shrink(f, 2000, 0.82);
    const thumb = await shrink(f, 480, 0.7);
    await put({
      id: crypto.randomUUID(),
      projectId,
      category,
      full: full.blob,
      thumb: thumb.blob,
      mime: full.mime,
      width: full.w,
      height: full.h,
      takenAt: new Date(f.lastModified || Date.now()).toISOString(),
      tries: 0,
    });
  }
  changed();
  return uploadQueued();
}

let running: Promise<number> | null = null;

/** Upload everything waiting (one at a time). Returns how many went up. */
export function uploadQueued(): Promise<number> {
  if (running) return running;
  running = (async () => {
    let done = 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    const supabase = createClient();
    for (const p of await queued()) {
      try {
        const r = await fetch(`/api/crm/projects/${p.projectId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'prepare', category: p.category, mime: p.mime, size: p.full.size }),
        });
        if (r.status === 404) {
          await remove(p.id); // project deleted
          continue;
        }
        const u = await r.json();
        if (!r.ok) throw new Error(u.error || 'prepare failed');
        const store = supabase.storage.from(u.bucket);
        const a = await store.uploadToSignedUrl(u.path, u.token, p.full, { contentType: p.mime });
        if (a.error) throw a.error;
        await store.uploadToSignedUrl(u.thumbPath, u.thumbToken, p.thumb, { contentType: 'image/jpeg' }).catch(() => null);
        const s = await fetch(`/api/crm/projects/${p.projectId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save',
            items: [{ path: u.path, category: p.category, width: p.width, height: p.height, taken_at: p.takenAt, caption: p.caption }],
          }),
        });
        if (!s.ok) throw new Error('save failed');
        await remove(p.id);
        done++;
        changed();
      } catch {
        await put({ ...p, tries: p.tries + 1 });
        break; // probably offline — try again later
      }
    }
    return done;
  })().finally(() => {
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
