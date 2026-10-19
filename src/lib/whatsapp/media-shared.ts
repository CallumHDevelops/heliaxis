/**
 * Photos, videos, voice notes, stickers and files customers send on WhatsApp: the rules the server
 * (media.ts) and the chat (MediaBubble.tsx) share. Meta's messages webhook gives each one a media id,
 * which can be downloaded for 7 days, its MIME type and, for a document, the file name they sent.
 *
 * What we keep is named and typed from the allow-list below, never from the customer's file name, and
 * only the safe kinds are ever shown in the page; everything else is a download.
 *
 * No imports: scripts/test-wa-media.mjs loads this file straight into node. Safe for client code.
 */

export type MediaStatus = 'pending' | 'saved' | 'failed' | 'too_big' | 'expired';
export const MEDIA_STATUSES: readonly MediaStatus[] = ['pending', 'saved', 'failed', 'too_big', 'expired'];

/** The webhook's message types that carry a file. */
export const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** How the chat draws one. */
export type MediaShape = 'photo' | 'sticker' | 'video' | 'audio' | 'file';

/** whatsapp-media.sql's columns as the chat gets them (not where it's kept, nor Meta's id). */
export type MediaFields = {
  media_status?: MediaStatus | null;
  media_mime?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_error?: string | null;
};

/** Meta's media object on an image, video, audio, document or sticker message. */
type Part = { id?: string; mime_type?: string; sha256?: string; filename?: string; caption?: string; voice?: boolean; animated?: boolean };
export type WithMedia = { type: string } & { [K in MediaType]?: Part };

export type InboundMedia = { type: MediaType; id: string; mime: string; name: string | null; caption: string | null };

const KB = 1024;
const MB = 1024 * KB;
const DAY = 86_400_000;

/** WhatsApp keeps what customers send for 7 days (business uploads 30): after that it's gone. */
export const KEPT_AT_WHATSAPP_DAYS = 7;

/**
 * The most we'll fetch of each kind. WhatsApp's own limits are for what a business sends (photos 5 MB,
 * video and audio 16 MB, documents 100 MB, stickers 500 KB); a customer's HD photo or long video can be
 * bigger, and Meta passes nothing on over 100 MB at all, so photos and video get room to spare.
 */
export const SIZE_CAP: Record<MediaType, number> = {
  image: 16 * MB,
  video: 100 * MB,
  audio: 16 * MB,
  document: 100 * MB,
  sticker: 1 * MB,
};

/** The cap for a saved message, by its kind ('other' is a sticker). */
export function capFor(kind: string): number {
  return kind === 'other' ? SIZE_CAP.sticker : (SIZE_CAP[kind as MediaType] ?? SIZE_CAP.document);
}

/**
 * What we'll keep, by MIME type: the file extension it's stored under, and whether the page may show
 * it (inline) or only offer it as a download. Anything else is kept as a plain download (.bin).
 */
const KEPT: Record<string, { ext: string; inline: boolean }> = {
  'image/jpeg': { ext: 'jpg', inline: true },
  'image/png': { ext: 'png', inline: true },
  'image/webp': { ext: 'webp', inline: true },
  'video/mp4': { ext: 'mp4', inline: true },
  'video/3gpp': { ext: '3gp', inline: true },
  'audio/ogg': { ext: 'ogg', inline: true },
  'audio/mpeg': { ext: 'mp3', inline: true },
  'audio/mp4': { ext: 'm4a', inline: true },
  'audio/aac': { ext: 'aac', inline: true },
  'audio/amr': { ext: 'amr', inline: true },
  'application/pdf': { ext: 'pdf', inline: false },
  'text/plain': { ext: 'txt', inline: false },
  'text/csv': { ext: 'csv', inline: false },
  'application/msword': { ext: 'doc', inline: false },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', inline: false },
  'application/vnd.ms-excel': { ext: 'xls', inline: false },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', inline: false },
  'application/vnd.ms-powerpoint': { ext: 'ppt', inline: false },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', inline: false },
  'image/heic': { ext: 'heic', inline: false },
  'image/heif': { ext: 'heif', inline: false },
  'application/zip': { ext: 'zip', inline: false },
};
const UNKNOWN = { ext: 'bin', contentType: 'application/octet-stream', inline: false };

/** "audio/ogg; codecs=opus" → "audio/ogg". Empty if it isn't a MIME type at all. */
export function baseMime(mime: string | null | undefined): string {
  const m = String(mime ?? '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(m) ? m : '';
}

/** The MIME type as Meta gave it, tidied: lower case, short, nothing that isn't a MIME character. */
export function cleanMime(mime: string | null | undefined): string | null {
  const base = baseMime(mime);
  if (!base) return null;
  const params = String(mime).split(';').slice(1).join(';').toLowerCase().replace(/[^a-z0-9=;.\- ]/g, '').trim();
  return (params ? `${base}; ${params.replace(/\s*;\s*/g, '; ')}` : base).slice(0, 100);
}

/** How it's stored: extension and Content-Type from the allow-list, and whether it may show in the page. */
export function storedAs(mime: string | null | undefined): { ext: string; contentType: string; inline: boolean } {
  const base = baseMime(mime);
  const kept = KEPT[base];
  return kept ? { ...kept, contentType: base } : UNKNOWN;
}

/** The message's file, from a webhook message. Null for anything without one (text, location…). */
export function mediaOf(m: WithMedia): InboundMedia | null {
  if (!(MEDIA_TYPES as readonly string[]).includes(m.type)) return null;
  const type = m.type as MediaType;
  const part = m[type];
  const id = typeof part?.id === 'string' ? part.id.trim() : '';
  // Meta's media ids are digits; anything that couldn't be one never reaches a URL.
  if (!/^[\w.-]{1,128}$/.test(id)) return null;
  return {
    type,
    id,
    mime: cleanMime(part?.mime_type) ?? (type === 'sticker' ? 'image/webp' : 'application/octet-stream'),
    name: type === 'document' ? cleanName(part?.filename) : null,
    caption: typeof part?.caption === 'string' && part.caption.trim() ? part.caption.trim() : null,
  };
}

/** A file name as they sent it, for showing: no folders, no control characters, not too long. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim();
  return n ? n.slice(0, 200) : null;
}

/** File types that run something when opened: downloaded as .bin, so a click doesn't open them. */
const RUNS = new Set(['html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xml', 'js', 'mjs', 'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'vbe', 'wsf', 'jar', 'hta', 'lnk', 'reg', 'sh', 'apk', 'app', 'dmg', 'pkg', 'url', 'website']);

const NOUN: Record<string, string> = { photo: 'photo', video: 'video', voice: 'voice-note', audio: 'audio', sticker: 'sticker', file: 'file' };

/**
 * The name a download is saved under: theirs, made safe (letters, numbers, spaces, - _ . ( ) only),
 * with the extension we stored it as. Without one, e.g. whatsapp-photo-2026-10-19.jpg.
 */
export function downloadName(m: { kind: string; body?: string | null; media_mime?: string | null; media_name?: string | null; created_at?: string | null }): string {
  const { ext } = storedAs(m.media_mime);
  const theirs = cleanName(m.media_name);
  let stem = '';
  let theirExt = '';
  if (theirs) {
    const dot = theirs.lastIndexOf('.');
    stem = dot > 0 ? theirs.slice(0, dot) : theirs;
    theirExt = dot > 0 ? theirs.slice(dot + 1).toLowerCase() : '';
    stem = stem
      .normalize('NFKD')
      .replace(/[^\w .()-]+/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.-]+|[\s.]+$/g, '')
      .slice(0, 80);
  }
  if (!stem) {
    const day = m.created_at && !Number.isNaN(Date.parse(m.created_at)) ? new Date(m.created_at).toISOString().slice(0, 10) : '';
    const what = NOUN[voiceAware(m.kind, m.media_mime, m.body)] ?? 'file';
    stem = `whatsapp-${what}${day ? `-${day}` : ''}`;
  }
  // Our extension when we know the type; theirs for other harmless files (a .dwg, a .numbers).
  const end = ext !== 'bin' ? ext : /^[a-z0-9]{1,8}$/.test(theirExt) && !RUNS.has(theirExt) ? theirExt : 'bin';
  return `${stem}.${end}`;
}

/** How the chat shows it. A JPEG or PNG sent "as a document" is a full-size photo, so it's a photo. */
export function mediaShape(kind: string, mime: string | null | undefined): MediaShape {
  const base = baseMime(mime);
  const { inline } = storedAs(base);
  const image = inline && base.startsWith('image/');
  if (kind === 'image' || kind === 'document') return image ? 'photo' : 'file';
  if (kind === 'video') return inline && base.startsWith('video/') ? 'video' : 'file';
  if (kind === 'audio') return inline && base.startsWith('audio/') ? 'audio' : 'file';
  if (kind === 'other') return image ? 'sticker' : 'file';
  return 'file';
}

/** photo | video | voice | audio | sticker | file: the shape, telling voice notes from audio files. */
function voiceAware(kind: string, mime: string | null | undefined, body: string | null | undefined) {
  const shape = mediaShape(kind, mime);
  if (shape === 'audio') return /^🎵/u.test(body ?? '') ? 'audio' : 'voice';
  return shape;
}

const LABEL: Record<string, string> = { photo: 'Photo', video: 'Video', voice: 'Voice note', audio: 'Audio file', sticker: 'Sticker', file: 'File' };

/** "Photo", "Voice note", "File"… for the chat's own wording. */
export function mediaLabel(kind: string, mime: string | null | undefined, body?: string | null): string {
  return LABEL[voiceAware(kind, mime, body)] ?? 'File';
}

/**
 * The customer's caption, without the "📷 Photo: " describeMessage() put in front (the bubble shows
 * the photo itself). '' when there wasn't one; the whole text if it isn't in that form.
 */
export function captionOf(kind: string, body: string | null | undefined, name?: string | null): string {
  const b = body ?? '';
  const prefixed = (label: string) => {
    const m = b.match(new RegExp(`^${label}(?:: ([\\s\\S]*))?$`, 'u'));
    return m ? (m[1] ?? '').trim() : null;
  };
  if (kind === 'image') return prefixed('📷 Photo') ?? b;
  if (kind === 'video') return prefixed('🎥 Video') ?? b;
  if (kind === 'audio' && /^(🎤 Voice note|🎵 Audio file)$/u.test(b)) return '';
  if (kind === 'other' && b === '🙂 Sticker') return '';
  if (kind === 'document') {
    const rest = b.match(/^📄 ([\s\S]*)$/u)?.[1];
    if (rest === undefined) return b;
    const shown = name || 'Document';
    if (rest === shown) return '';
    if (rest.startsWith(`${shown} — `)) return rest.slice(shown.length + 3).trim();
    return rest === 'Document' ? '' : rest;
  }
  return b;
}

/** 820 KB, 1.4 MB. */
export function formatSize(bytes: number | null | undefined): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < KB) return `${n} bytes`;
  if (n < MB) return `${Math.max(1, Math.round(n / KB))} KB`;
  const mb = n / MB;
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`;
}

/** Still downloadable from WhatsApp (the 7 days start when they sent it). */
export function stillAtWhatsApp(createdAt: string | null | undefined, now = Date.now()): boolean {
  const at = Date.parse(createdAt ?? '');
  return Number.isFinite(at) && now - at < KEPT_AT_WHATSAPP_DAYS * DAY;
}

/** Why a file couldn't be kept, in plain words (stored in media_error and shown under the message). */
export const MEDIA_ERRORS = {
  notConnected: 'WhatsApp isn’t connected yet, so it couldn’t be fetched.',
  token: 'The WhatsApp access key has stopped working, so it couldn’t be fetched. Whoever looks after the WhatsApp setup needs to renew it.',
  permission: 'The WhatsApp access key isn’t allowed to fetch files. Whoever looks after the WhatsApp setup needs to check its permissions.',
  gone: 'WhatsApp no longer has this file. Ask them to send it again.',
  busy: 'WhatsApp was busy. Try again in a minute.',
  network: 'Couldn’t reach WhatsApp to fetch it. Try again.',
  badLink: 'WhatsApp gave an unexpected download link, so it wasn’t fetched.',
  incomplete: 'The file didn’t arrive complete. Try again.',
  storage: 'Couldn’t save it in the CRM’s file storage. Try again.',
  storageLimit: 'Too big for the CRM’s file storage. Ask them to email it instead.',
  expired: 'WhatsApp only keeps files for 7 days, and this one wasn’t saved in time.',
};

export function tooBigText(bytes: number, cap: number): string {
  return `Too big to keep here (${formatSize(bytes)}; the limit is ${formatSize(cap)}). Ask them to email it instead.`;
}

/** Meta's Graph API error codes for a media lookup, in plain words. */
export function graphErrorText(code?: number, subcode?: number): string {
  if (code === 190) return MEDIA_ERRORS.token;
  if (code === 10 || code === 200 || code === 3) return MEDIA_ERRORS.permission;
  // 100/33: no such media for this number. Meta answers the same for one past its 7 days.
  if (code === 100 && (subcode === 33 || subcode === undefined)) return MEDIA_ERRORS.gone;
  if (code !== undefined && [4, 17, 32, 613, 80007, 130429, 131048, 131056].includes(code)) return MEDIA_ERRORS.busy;
  return code === undefined ? MEDIA_ERRORS.network : `WhatsApp wouldn’t hand it over (error ${code}). Try again, or ask them to send it again.`;
}

/** What shows under a message whose file isn't here: "Photo on its way…", or why not. */
export function mediaStatusText(m: { kind: string; body?: string | null } & MediaFields): string {
  const what = mediaLabel(m.kind, m.media_mime, m.body);
  switch (m.media_status) {
    case 'pending':
      return `${what} on its way…`;
    case 'too_big':
      return m.media_error || 'Too big to keep here. Ask them to email it instead.';
    case 'expired':
      return m.media_error || MEDIA_ERRORS.expired;
    case 'failed':
      return m.media_error || `Couldn’t fetch this ${what.toLowerCase()} from WhatsApp. Try again.`;
    default:
      return '';
  }
}

/** Worth a "Try again": it went wrong for a reason that can pass, and WhatsApp still has it. */
export function canRetry(m: { media_status?: MediaStatus | null; created_at?: string | null }, now = Date.now()): boolean {
  return (m.media_status === 'failed' || m.media_status === 'pending') && stillAtWhatsApp(m.created_at, now);
}

/** The one host Meta serves the files from: the only one that gets the WhatsApp access key. */
export const FILE_HOST = 'lookaside.fbsbx.com';

export function isFileHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === FILE_HOST && !u.username && !u.password && (u.port === '' || u.port === '443');
  } catch {
    return false;
  }
}

/** Where the file host may send a download on to (Meta's own CDNs). Followed without the key. */
export function isMetaCdn(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port !== '' && u.port !== '443')) return false;
    return ['.fbsbx.com', '.fbcdn.net', '.whatsapp.net'].some((d) => u.hostname.endsWith(d));
  } catch {
    return false;
  }
}

/**
 * Does the file's SHA-256 (as hex) match the one Meta gave? Meta's examples show it in base64 and
 * in hex, so both count. True when Meta's isn't a SHA-256 in either form (nothing to check against).
 */
export function hashMatches(hex: string, given: string | null | undefined): boolean {
  const want = String(given ?? '').trim();
  if (!want) return true;
  if (/^[0-9a-f]{64}$/i.test(want)) return want.toLowerCase() === hex.toLowerCase();
  if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(want)) return true;
  try {
    const bin = atob(want.replace(/-/g, '+').replace(/_/g, '/').replace(/=*$/, '='));
    const asHex = Array.from(bin, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return asHex.length === 64 ? asHex === hex.toLowerCase() : true;
  } catch {
    return true;
  }
}

/** Job photos copied from a chat are named wa-{message id}, so the chat can tell which are in. */
export const jobPhotoName = (messageId: string) => `wa-${messageId}`;
export function messageIdFromJobPhoto(path: string): string | null {
  return path.match(/\/wa-([0-9a-f-]{36})\.[a-z0-9]+$/i)?.[1]?.toLowerCase() ?? null;
}

/** The caption a photo saved to the job gets: "From WhatsApp, 19 Oct 2026", and theirs after it. */
export function jobPhotoCaption(createdAt: string, caption?: string | null): string {
  const at = new Date(createdAt);
  const day = Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
  const head = day ? `From WhatsApp, ${day}` : 'From WhatsApp';
  return (caption?.trim() ? `${head} — ${caption.trim()}` : head).slice(0, 500);
}

/** "PDF", "DOCX"… for a file's label: the stored type, else the extension they gave it, else "File". */
export function fileKind(mime: string | null | undefined, name?: string | null): string {
  const { ext } = storedAs(mime);
  if (ext !== 'bin') return ext.toUpperCase();
  const theirs = cleanName(name)?.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  return theirs ? theirs.toUpperCase() : 'File';
}
