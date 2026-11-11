import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/crm/server';

/** Videos for the QR element live in their own private bucket; the watch page hands out a short-lived link. */
export const VIDEO_BUCKET = 'watch-videos';
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];

let ready = false;
export async function ensureVideoBucket() {
  if (ready) return;
  const db = createAdminClient();
  const { data } = await db.storage.getBucket(VIDEO_BUCKET);
  if (!data) await db.storage.createBucket(VIDEO_BUCKET, { public: false, fileSizeLimit: VIDEO_MAX_BYTES, allowedMimeTypes: VIDEO_MIME });
  ready = true;
}

/** What the QR code opens. The document's id and the element's id together are the key; the page is not indexed. */
export const watchUrl = (docId: string, blockId: string) => `${siteUrl()}/watch/${docId}/${blockId}`;
