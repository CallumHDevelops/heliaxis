import 'server-only';
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, ensureCrmBucket, logActivity, thumbPath } from '@/lib/crm/server';
import { graph } from './api';
import {
  capFor,
  captionOf,
  downloadName,
  graphErrorText,
  hashMatches,
  isFileHost,
  isMetaCdn,
  jobPhotoCaption,
  jobPhotoName,
  MEDIA_ERRORS,
  mediaOf,
  mediaShape,
  messageIdFromJobPhoto,
  stillAtWhatsApp,
  storedAs,
  tooBigText,
  type MediaStatus,
  type WithMedia,
} from './media-shared';

/**
 * Photos, videos, voice notes, stickers and files customers send on WhatsApp (whatsapp-media.sql).
 * The webhook saves the message with Meta's media id and 'pending'; straight after, fetchAndStore()
 * asks Meta for a download link (valid 5 minutes), downloads the file with the WhatsApp access key and
 * keeps it in the private whatsapp-media bucket at {enquiry id}/{message id}.{ext}, with a small JPEG
 * beside photos for the chat. WhatsApp only keeps them for 7 days, so they're fetched at once, and
 * again when someone opens one that didn't make it (GET /api/whatsapp/media/{id}).
 *
 * Until the SQL is run none of this does anything: the chat shows "📷 Photo" as it always has.
 * The rules (types, sizes, names, wording) are in media-shared.ts, where they're tested.
 */

/**
 * Its own private bucket: the CRM's photo bucket only takes images up to 20 MB, and these include
 * video, voice notes and PDFs. No type list on the bucket: what goes in is checked here.
 */
export const MEDIA_BUCKET = 'whatsapp-media';

const MEDIA_COLS = 'media_id, media_mime, media_name, media_size, media_path, media_status, media_error';
/** What the chat needs to draw a message's file (not where it's kept, nor Meta's id). */
export const CHAT_MEDIA_COLS = 'media_mime, media_name, media_size, media_status, media_error';

/** Meta's file host turns some downloads away without a User-Agent it likes; the second try uses curl's. */
const AGENTS = ['Heliaxis-CRM/1.0 (+https://heliaxis.co.uk)', 'curl/7.64.1'];
const LOOKUP_MS = 10_000;
const DOWNLOAD_MS = 40_000;

type Db = ReturnType<typeof createAdminClient>;
export type MediaRow = {
  id: string;
  enquiry_id: string;
  kind: string;
  body: string | null;
  created_at: string;
  media_id: string | null;
  media_mime: string | null;
  media_name: string | null;
  media_size: number | null;
  media_path: string | null;
  media_status: MediaStatus | null;
  media_error: string | null;
};
const ROW_COLS = `id, enquiry_id, kind, body, created_at, ${MEDIA_COLS}`;

const missingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || /column .* does not exist/i.test(e.message ?? ''));

/** Has whatsapp-media.sql been run? Once yes, always yes; a no is asked again after 5 minutes. */
let columnsReady: boolean | null = null;
let checkedAt = 0;
export async function mediaColumnsReady(): Promise<boolean> {
  if (columnsReady) return true;
  if (columnsReady === false && Date.now() - checkedAt < 5 * 60_000) return false;
  try {
    const { error } = await createAdminClient().from('whatsapp_messages').select('media_status').limit(1);
    if (error && !missingColumn(error)) return false; // a blip: ask again next time
    columnsReady = !error;
    checkedAt = Date.now();
    return columnsReady;
  } catch {
    return false;
  }
}

/** The columns to save with an inbound message: its file, waiting to be fetched. {} without one, or before the SQL. */
export async function inboundMediaColumns(m: WithMedia): Promise<Record<string, string>> {
  const media = mediaOf(m);
  if (!media || !(await mediaColumnsReady())) return {};
  return {
    media_id: media.id,
    media_mime: media.mime,
    ...(media.name ? { media_name: media.name } : {}),
    media_status: 'pending',
  };
}

/** Fetch the file of the message Meta calls `waMessageId` once the webhook has answered (Next's after()). */
export function storeMediaSoon(waMessageId: string) {
  const run = async () => {
    const { data } = await createAdminClient().from('whatsapp_messages').select('id').eq('wa_message_id', waMessageId).maybeSingle();
    if (data?.id) await fetchAndStore(data.id as string);
  };
  try {
    after(() => run().catch((e) => console.error('[whatsapp media] fetch failed', e)));
  } catch {
    // Not inside a request (a script): just start it.
    void run().catch(() => null);
  }
}

export async function mediaRow(id: string, db: Db = createAdminClient()): Promise<MediaRow | null> {
  const { data, error } = await db.from('whatsapp_messages').select(ROW_COLS).eq('id', id).maybeSingle();
  return error || !data ? null : (data as unknown as MediaRow);
}

type Got = { ok: true; bytes: Buffer } | { ok: false; status: MediaStatus; error: string; again?: boolean };

/**
 * Download one message's file from WhatsApp and keep it. Safe to run twice or at the same time (the
 * file goes to the same place either way); does nothing once it's saved, too big or past 7 days.
 * Returns the row as it now stands, or null if it has no file (or the SQL hasn't been run).
 */
export async function fetchAndStore(rowId: string): Promise<MediaRow | null> {
  const db = createAdminClient();
  const row = await mediaRow(rowId, db);
  if (!row?.media_id) return null;
  if ((row.media_status === 'saved' && row.media_path) || row.media_status === 'too_big' || row.media_status === 'expired') return row;

  const finish = async (patch: Partial<MediaRow>) => {
    const { error } = await db.from('whatsapp_messages').update(patch).eq('id', row.id);
    if (error) console.error('[whatsapp media] row not updated', row.id, error.message);
    return { ...row, ...patch };
  };
  if (!stillAtWhatsApp(row.created_at)) return finish({ media_status: 'expired', media_error: MEDIA_ERRORS.expired });

  const got = await download(row.media_id, capFor(row.kind));
  if (!got.ok) return finish({ media_status: got.status, media_error: got.error });

  const kept = storedAs(row.media_mime);
  const path = `${row.enquiry_id}/${row.id}.${kept.ext}`;
  await ensureMediaBucket();
  const store = db.storage.from(MEDIA_BUCKET);
  const up = await store.upload(path, got.bytes, { contentType: kept.contentType, upsert: true });
  if (up.error) {
    const e = up.error as { message?: string; status?: number; statusCode?: string };
    const tooBig = e.status === 413 || e.statusCode === '413' || /too large|exceeded the maximum|maximum allowed size/i.test(e.message ?? '');
    console.error('[whatsapp media] upload failed', row.id, e.message);
    return finish(tooBig ? { media_status: 'too_big', media_error: MEDIA_ERRORS.storageLimit } : { media_status: 'failed', media_error: MEDIA_ERRORS.storage });
  }
  // A small copy for the chat, like the job photos have. Without it the chat shows the photo itself.
  if (mediaShape(row.kind, row.media_mime) === 'photo') {
    const small = await thumbnail(got.bytes);
    if (small) await store.upload(thumbPath(path), small.thumb, { contentType: 'image/jpeg', upsert: true });
  }
  return finish({ media_status: 'saved', media_path: path, media_size: got.bytes.length, media_error: null });
}

/** Meta's lookup (GET /{media-id}) for a fresh link, then the file. Twice at most: links last 5 minutes. */
async function download(mediaId: string, cap: number): Promise<Got> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, status: 'failed', error: MEDIA_ERRORS.notConnected };
  const phone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  let last: Got = { ok: false, status: 'failed', error: MEDIA_ERRORS.network };
  for (const agent of AGENTS) {
    const meta = await graph<{ url?: string; mime_type?: string; sha256?: string; file_size?: string | number }>(
      `/${encodeURIComponent(mediaId)}${phone ? `?phone_number_id=${encodeURIComponent(phone)}` : ''}`,
      { signal: AbortSignal.timeout(LOOKUP_MS) }
    );
    if (!meta.ok) {
      if (meta.code !== undefined) console.error('[whatsapp media] lookup refused', mediaId, meta.code, meta.subcode, meta.error);
      return { ok: false, status: 'failed', error: graphErrorText(meta.code, meta.subcode) };
    }
    // Meta sends the size as a string in its docs and a number elsewhere.
    const size = Number(meta.data.file_size);
    if (Number.isFinite(size) && size > cap) return { ok: false, status: 'too_big', error: tooBigText(size, cap) };
    const url = meta.data.url ?? '';
    if (!isFileHost(url)) {
      console.error('[whatsapp media] unexpected download host', safeHost(url));
      return { ok: false, status: 'failed', error: MEDIA_ERRORS.badLink };
    }
    last = await getFile(url, token, cap, agent);
    if (last.ok) {
      const hex = createHash('sha256').update(last.bytes).digest('hex');
      if (hashMatches(hex, meta.data.sha256)) return last;
      console.error('[whatsapp media] fingerprint mismatch', mediaId, { got: hex, meta: meta.data.sha256 });
      last = { ok: false, status: 'failed', error: MEDIA_ERRORS.incomplete, again: true };
    }
    if (!last.again) return last;
  }
  return last;
}

let hostLogged = false;

/**
 * GET the file: the access key goes only to Meta's file host (never to a host a redirect names), and
 * redirects are followed by hand, to Meta's own CDNs only. Stops past `cap` bytes.
 */
async function getFile(first: string, token: string, cap: number, agent: string): Promise<Got> {
  const signal = AbortSignal.timeout(DOWNLOAD_MS);
  try {
    let url = first;
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      const headers: Record<string, string> = { 'User-Agent': agent };
      if (isFileHost(url)) headers.Authorization = `Bearer ${token}`;
      res = await fetch(url, { headers, redirect: 'manual', cache: 'no-store', signal });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!next) break;
      url = new URL(next, url).toString();
      if (!isMetaCdn(url)) {
        console.error('[whatsapp media] redirect to an unexpected host', safeHost(url));
        return { ok: false, status: 'failed', error: MEDIA_ERRORS.badLink };
      }
      res = null;
    }
    if (!hostLogged) {
      hostLogged = true;
      console.info('[whatsapp media] first download came from', safeHost(url));
    }
    // An expired link is a 404; a page of HTML is Meta turning the request away: a fresh link may work.
    const type = res?.headers.get('content-type') ?? '';
    if (!res || !res.ok || /^text\/html|^application\/json/i.test(type)) {
      await res?.body?.cancel().catch(() => null);
      return { ok: false, status: 'failed', error: MEDIA_ERRORS.network, again: true };
    }
    const length = Number(res.headers.get('content-length'));
    if (Number.isFinite(length) && length > cap) {
      await res.body?.cancel().catch(() => null);
      return { ok: false, status: 'too_big', error: tooBigText(length, cap) };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, status: 'failed', error: MEDIA_ERRORS.network, again: true };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => null);
        return { ok: false, status: 'too_big', error: tooBigText(total, cap) };
      }
      chunks.push(value);
    }
    if (!total) return { ok: false, status: 'failed', error: MEDIA_ERRORS.incomplete, again: true };
    return { ok: true, bytes: Buffer.concat(chunks) };
  } catch {
    return { ok: false, status: 'failed', error: MEDIA_ERRORS.network, again: true };
  }
}

/** For logs: the host only, never the link (it carries Meta's signature). */
function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '(not a link)';
  }
}

/** A 480px JPEG and the photo's own size, the way the job photos have them. Null if it can't be read. */
async function thumbnail(bytes: Buffer): Promise<{ thumb: Buffer; width: number; height: number } | null> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(bytes).rotate().metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    const thumb = await sharp(bytes)
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { thumb, width: (turned ? meta.height : meta.width) ?? 0, height: (turned ? meta.width : meta.height) ?? 0 };
  } catch (e) {
    console.error('[whatsapp media] no thumbnail', e);
    return null;
  }
}

let bucketReady = false;
async function ensureMediaBucket() {
  if (bucketReady) return;
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(MEDIA_BUCKET);
  if (!data) await admin.storage.createBucket(MEDIA_BUCKET, { public: false });
  bucketReady = true;
}

/**
 * A short-lived link to a saved file. Photos, video and audio open in the page as themselves; anything
 * else (and anything asked for as a download) comes as an attachment under a safe name. `thumb` gives
 * a photo's small copy when there is one.
 */
export async function mediaLink(row: MediaRow, opts: { thumb?: boolean; download?: boolean } = {}): Promise<string | null> {
  if (row.media_status !== 'saved' || !row.media_path) return null;
  const store = createAdminClient().storage.from(MEDIA_BUCKET);
  const kept = storedAs(row.media_mime);
  const attach = !!opts.download || !kept.inline;
  if (opts.thumb && !attach) {
    const small = await store.createSignedUrl(thumbPath(row.media_path), 600);
    if (small.data?.signedUrl) return small.data.signedUrl;
  }
  // Long enough to finish a video or a voice note once it's started.
  const seconds = /^(audio|video)\//.test(kept.contentType) && !attach ? 3600 : 600;
  const { data } = await store.createSignedUrl(row.media_path, seconds, attach ? { download: downloadName(row) } : undefined);
  return data?.signedUrl ?? null;
}

/**
 * For the chat's "anything changed?" check: the messages whose file isn't saved, and how they stand.
 * A file arriving (or failing) changes it. Null before the SQL.
 */
export async function mediaVersion(db: Db, enquiryId: string): Promise<string[] | null> {
  if (!(await mediaColumnsReady())) return null;
  const { data, error } = await db
    .from('whatsapp_messages')
    .select('id, media_status')
    .eq('enquiry_id', enquiryId)
    .not('media_status', 'is', null)
    .neq('media_status', 'saved');
  return error ? null : (data ?? []).map((r) => `${r.id}:${r.media_status}`);
}

/**
 * A chat's select list with the file columns on the end, once the SQL has been run (as it was before).
 * Typed as the list it was given: the file columns come along as extras.
 */
export async function withChatMedia<T extends string>(cols: T): Promise<T> {
  return ((await mediaColumnsReady()) ? `${cols}, ${CHAT_MEDIA_COLS}` : cols) as T;
}

/** Every file kept for these customers (a folder each), so deleting a customer takes them too. */
export async function mediaFilesOf(enquiryIds: string[]): Promise<{ bucket: string; path: string }[]> {
  const store = createAdminClient().storage.from(MEDIA_BUCKET);
  const out: { bucket: string; path: string }[] = [];
  for (const id of enquiryIds) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await store.list(id, { limit: 1000, offset });
      if (error || !data) break; // no bucket yet: nothing kept
      out.push(...data.filter((f) => f.id).map((f) => ({ bucket: MEDIA_BUCKET, path: `${id}/${f.name}` })));
      if (data.length < 1000) break;
    }
  }
  return out;
}

/* ── Save to job photos ─────────────────────────────────────────────────────────────────────────── */

/** The messages from this job's chat already in its photos (copied as wa-{message id}). */
export async function savedToJob(projectId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('crm_photos')
    .select('storage_path')
    .eq('project_id', projectId)
    .like('storage_path', `${projectId}/%/wa-%`);
  return [...new Set((data ?? []).map((p) => messageIdFromJobPhoto(p.storage_path as string)).filter((x): x is string => !!x))];
}

/**
 * Copy a photo they sent into the job's photos (Site), the way the photos route stores one: the photo
 * at {job}/site/wa-{message id}.{ext} in the CRM bucket, a 480px JPEG beside it, a crm_photos row with
 * "From WhatsApp, 19 Oct 2026" as its caption, and a timeline entry. Saving it twice does nothing.
 * The job must be this customer's (the same enquiry, or another of theirs on the same number).
 */
export async function saveToJobPhotos(
  row: MediaRow,
  projectId: string,
  userId: string
): Promise<{ ok: true; already: boolean } | { ok: false; error: string; status: number }> {
  if (mediaShape(row.kind, row.media_mime) !== 'photo') return { ok: false, error: 'Only photos can go in the job’s photos.', status: 400 };
  if (row.media_status !== 'saved' || !row.media_path) return { ok: false, error: 'This photo hasn’t arrived yet.', status: 409 };
  const db = createAdminClient();
  const { data: project } = await db.from('crm_projects').select('id, enquiry_id').eq('id', projectId).maybeSingle();
  if (!project || !(await sameCustomer(db, project.enquiry_id as string, row.enquiry_id))) return { ok: false, error: 'Job not found', status: 404 };

  const kept = storedAs(row.media_mime);
  const path = `${projectId}/site/${jobPhotoName(row.id)}.${kept.ext}`;
  const { data: there } = await db.from('crm_photos').select('id').eq('storage_path', path).maybeSingle();
  if (there) return { ok: true, already: true };

  const { data: file } = await db.storage.from(MEDIA_BUCKET).download(row.media_path);
  if (!file) return { ok: false, error: 'Couldn’t read the photo. Try again.', status: 500 };
  const bytes = Buffer.from(await file.arrayBuffer());
  const small = await thumbnail(bytes);
  await ensureCrmBucket();
  const store = db.storage.from(CRM_BUCKET);
  const up = await store.upload(path, bytes, { contentType: kept.contentType, upsert: true });
  if (up.error) return { ok: false, error: 'Couldn’t save it to the job. Try again.', status: 500 };
  if (small) await store.upload(thumbPath(path), small.thumb, { contentType: 'image/jpeg', upsert: true });

  const { error } = await db.from('crm_photos').upsert(
    {
      project_id: projectId,
      category: 'site',
      storage_path: path,
      caption: jobPhotoCaption(row.created_at, captionOf(row.kind, row.body, row.media_name)),
      width: small?.width || null,
      height: small?.height || null,
      taken_at: row.created_at,
      uploaded_by: userId,
    },
    { onConflict: 'storage_path', ignoreDuplicates: true }
  );
  if (error) return { ok: false, error: error.message, status: 500 };
  await logActivity({
    enquiryId: project.enquiry_id as string,
    projectId,
    kind: 'photo',
    body: '1 site photo added from WhatsApp',
    meta: { count: 1, whatsapp_message_id: row.id },
    byId: userId,
  });
  await db.from('crm_projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
  return { ok: true, already: false };
}

/** Two enquiries are the same customer: the same one, or both on the same WhatsApp number. */
async function sameCustomer(db: Db, a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const { data } = await db.from('enquiries').select('id, wa_id').in('id', [a, b]);
  const [x, y] = data ?? [];
  return !!x?.wa_id && !!y && x.wa_id === y.wa_id;
}
