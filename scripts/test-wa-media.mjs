// Photos, videos, voice notes, stickers and files customers send on WhatsApp: the shared rules in
// src/lib/whatsapp/media-shared.ts (what's taken from the webhook, the type allow-list, safe names,
// size caps, the chat's wording) and that the server keeps to them (media.ts, the media route).
// Usage: node --experimental-strip-types scripts/test-wa-media.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  baseMime,
  canRetry,
  capFor,
  captionOf,
  cleanMime,
  downloadName,
  fileKind,
  formatSize,
  graphErrorText,
  hashMatches,
  isFileHost,
  isMetaCdn,
  jobPhotoCaption,
  MEDIA_ERRORS,
  mediaLabel,
  mediaOf,
  mediaShape,
  mediaStatusText,
  messageIdFromJobPhoto,
  SIZE_CAP,
  stillAtWhatsApp,
  storedAs,
  tooBigText,
} from '../src/lib/whatsapp/media-shared.ts';
import { describeMessage } from '../src/lib/whatsapp/describe.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const MB = 1024 * 1024;
const msg = (type, extra = {}) => ({ id: 'wamid.1', from: '447700900123', type, ...extra });

// ── What's taken from the webhook (Meta's media object on each type) ──────────────────────────────────
eq('photo', mediaOf(msg('image', { image: { id: '1003383421387256', mime_type: 'image/jpeg', sha256: 'x', caption: ' Our roof ' } })), {
  type: 'image',
  id: '1003383421387256',
  mime: 'image/jpeg',
  name: null,
  caption: 'Our roof',
});
eq('video', mediaOf(msg('video', { video: { id: '22', mime_type: 'video/mp4' } })), { type: 'video', id: '22', mime: 'video/mp4', name: null, caption: null });
eq('voice note keeps its codec', mediaOf(msg('audio', { audio: { id: '33', mime_type: 'audio/ogg; codecs=opus', voice: true } })), {
  type: 'audio',
  id: '33',
  mime: 'audio/ogg; codecs=opus',
  name: null,
  caption: null,
});
eq('audio file', mediaOf(msg('audio', { audio: { id: '34', mime_type: 'audio/mpeg', voice: false } }))?.mime, 'audio/mpeg');
eq('document: their file name, without folders', mediaOf(msg('document', { document: { id: '44', mime_type: 'application/pdf', filename: 'C:\\Users\\jo\\bill.pdf', caption: 'Last quarter' } })), {
  type: 'document',
  id: '44',
  mime: 'application/pdf',
  name: 'bill.pdf',
  caption: 'Last quarter',
});
eq('sticker with no MIME type is WebP', mediaOf(msg('sticker', { sticker: { id: '55', animated: true } }))?.mime, 'image/webp');
eq('MIME type tidied', mediaOf(msg('image', { image: { id: '1', mime_type: ' IMAGE/JPEG ' } }))?.mime, 'image/jpeg');
eq('nonsense MIME type', mediaOf(msg('document', { document: { id: '1', mime_type: '<script>' } }))?.mime, 'application/octet-stream');
eq('text has no file', mediaOf(msg('text', { text: { body: 'hi' } })), null);
eq('location has no file', mediaOf(msg('location', { location: { latitude: 1, longitude: 2 } })), null);
eq('media message without an id', mediaOf(msg('image', { image: { mime_type: 'image/jpeg' } })), null);
eq('an id that could reach a URL', mediaOf(msg('image', { image: { id: '../../me?x=1', mime_type: 'image/jpeg' } })), null);
eq('unsupported (a view-once photo)', mediaOf(msg('unsupported', { unsupported: { type: 'view_once' } })), null);
// The webhook's text for the same messages doesn't change (describe.ts).
eq('describe still says Photo', describeMessage(msg('image', { image: { id: '1', caption: 'Our roof' } })).body, '📷 Photo: Our roof');

// ── The type allow-list: stored extension and whether the page may show it ────────────────────────────
eq('jpeg', storedAs('image/jpeg'), { ext: 'jpg', inline: true, contentType: 'image/jpeg' });
eq('png', storedAs('image/png').ext, 'png');
eq('sticker webp', storedAs('image/webp'), { ext: 'webp', inline: true, contentType: 'image/webp' });
eq('voice note: the codec is dropped for storage', storedAs('audio/ogg; codecs=opus'), { ext: 'ogg', inline: true, contentType: 'audio/ogg' });
eq('mp3', storedAs('audio/mpeg').ext, 'mp3');
eq('m4a', storedAs('audio/mp4').ext, 'm4a');
eq('amr', storedAs('audio/amr').ext, 'amr');
eq('mp4', storedAs('video/mp4'), { ext: 'mp4', inline: true, contentType: 'video/mp4' });
eq('3gp', storedAs('video/3gpp').ext, '3gp');
eq('pdf is a download', storedAs('application/pdf'), { ext: 'pdf', inline: false, contentType: 'application/pdf' });
eq('docx is a download', storedAs('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), {
  ext: 'docx',
  inline: false,
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
eq('plain text is a download', storedAs('text/plain').inline, false);
eq('HEIC is a download (most browsers can’t show it)', storedAs('image/heic').inline, false);
eq('SVG is never shown: a .bin download', storedAs('image/svg+xml'), { ext: 'bin', contentType: 'application/octet-stream', inline: false });
eq('HTML is never shown: a .bin download', storedAs('text/html'), { ext: 'bin', contentType: 'application/octet-stream', inline: false });
eq('JavaScript: a .bin download', storedAs('application/javascript').ext, 'bin');
eq('no type', storedAs(null).ext, 'bin');
eq('baseMime', baseMime('Audio/OGG; codecs=opus'), 'audio/ogg');
eq('baseMime rejects junk', baseMime('not a type'), '');
eq('cleanMime keeps the codec', cleanMime('audio/ogg;codecs=opus'), 'audio/ogg; codecs=opus');

// ── How the chat shows each one ──────────────────────────────────────────────────────────────────────
eq('photo', mediaShape('image', 'image/jpeg'), 'photo');
eq('photo sent as a document is a photo', mediaShape('document', 'image/png'), 'photo');
eq('HEIC sent as a document is a file', mediaShape('document', 'image/heic'), 'file');
eq('pdf', mediaShape('document', 'application/pdf'), 'file');
eq('sticker (kind other)', mediaShape('other', 'image/webp'), 'sticker');
eq('video', mediaShape('video', 'video/mp4'), 'video');
eq('an odd video type is a file', mediaShape('video', 'video/quicktime'), 'file');
eq('voice note', mediaShape('audio', 'audio/ogg; codecs=opus'), 'audio');
eq('an image type that isn’t safe is a file', mediaShape('image', 'image/svg+xml'), 'file');
eq('label: voice note', mediaLabel('audio', 'audio/ogg', '🎤 Voice note'), 'Voice note');
eq('label: audio file', mediaLabel('audio', 'audio/mpeg', '🎵 Audio file'), 'Audio file');
eq('label: sticker', mediaLabel('other', 'image/webp', '🙂 Sticker'), 'Sticker');
eq('label: document', mediaLabel('document', 'application/pdf'), 'File');
eq('file kind from the stored type', fileKind('application/pdf', 'x.doc'), 'PDF');
eq('file kind from their extension when we don’t know the type', fileKind('application/x-dwg', 'plan.dwg'), 'DWG');
eq('file kind with nothing to go on', fileKind('', ''), 'File');

// ── The caption: their words without "📷 Photo: " in front ───────────────────────────────────────────
eq('photo caption', captionOf('image', '📷 Photo: Our roof'), 'Our roof');
eq('photo, no caption', captionOf('image', '📷 Photo'), '');
eq('multi-line caption', captionOf('image', '📷 Photo: Line 1\nLine 2'), 'Line 1\nLine 2');
eq('video caption', captionOf('video', '🎥 Video: The meter'), 'The meter');
eq('document caption', captionOf('document', '📄 bill.pdf — Last quarter', 'bill.pdf'), 'Last quarter');
eq('document, no caption', captionOf('document', '📄 bill.pdf', 'bill.pdf'), '');
eq('document without a name', captionOf('document', '📄 Document — See this', null), 'See this');
eq('voice note has none', captionOf('audio', '🎤 Voice note'), '');
eq('sticker has none', captionOf('other', '🙂 Sticker'), '');
eq('text in another form is kept whole', captionOf('image', 'Something else'), 'Something else');
eq('each message’s own describe() text round-trips', captionOf('document', describeMessage(msg('document', { document: { filename: 'a — b.pdf', caption: 'c' } })).body, 'a — b.pdf'), 'c');

// ── Safe download names ──────────────────────────────────────────────────────────────────────────────
eq('their name, our extension', downloadName({ kind: 'document', media_mime: 'application/pdf', media_name: 'Electricity bill.pdf' }), 'Electricity bill.pdf');
eq('a disguised program gets the real type’s extension', downloadName({ kind: 'document', media_mime: 'application/pdf', media_name: 'bill.pdf.exe' }), 'bill.pdf.pdf');
eq('folders and odd characters go', downloadName({ kind: 'document', media_mime: 'application/pdf', media_name: '../../Fac"ture<é>.pdf' }), 'Facturee.pdf');
eq('an unknown type keeps a harmless extension', downloadName({ kind: 'document', media_mime: 'application/x-dwg', media_name: 'plan.dwg' }), 'plan.dwg');
eq('an unknown type that would run something', downloadName({ kind: 'document', media_mime: 'text/html', media_name: 'invoice.html' }), 'invoice.bin');
eq('SVG pretending to be a photo', downloadName({ kind: 'document', media_mime: 'image/svg+xml', media_name: 'roof.svg' }), 'roof.bin');
eq('a name of only dots', downloadName({ kind: 'document', media_mime: 'application/pdf', media_name: '...', created_at: '2026-10-19T10:00:00Z' }), 'whatsapp-file-2026-10-19.pdf');
eq('photo with no name', downloadName({ kind: 'image', media_mime: 'image/jpeg', created_at: '2026-10-19T10:00:00Z' }), 'whatsapp-photo-2026-10-19.jpg');
eq('voice note with no name', downloadName({ kind: 'audio', media_mime: 'audio/ogg; codecs=opus', body: '🎤 Voice note', created_at: '2026-10-19T10:00:00Z' }), 'whatsapp-voice-note-2026-10-19.ogg');
eq('audio file with no name', downloadName({ kind: 'audio', media_mime: 'audio/mpeg', body: '🎵 Audio file', created_at: '2026-10-19T10:00:00Z' }), 'whatsapp-audio-2026-10-19.mp3');
eq('long names are cut', downloadName({ kind: 'document', media_mime: 'application/pdf', media_name: `${'a'.repeat(300)}.pdf` }).length, 84);
eq('Content-Disposition-safe characters only', /^[\w .()-]+$/.test(downloadName({ kind: 'document', media_mime: 'text/plain', media_name: 'na\u0000me;\r\n"x".txt' })), true);

// ── Size caps (WhatsApp's limits, with room for customers' HD photos) ────────────────────────────────
eq('photo cap', capFor('image'), 16 * MB);
eq('voice note cap', capFor('audio'), 16 * MB);
eq('video cap (Meta passes nothing over 100 MB)', capFor('video'), 100 * MB);
eq('document cap', capFor('document'), 100 * MB);
eq('sticker cap (kind other)', capFor('other'), 1 * MB);
eq('caps cover every type', Object.keys(SIZE_CAP).sort(), ['audio', 'document', 'image', 'sticker', 'video']);
eq('size wording', [formatSize(900), formatSize(820 * 1024), formatSize(1.44 * MB), formatSize(23.6 * MB), formatSize(0)], ['900 bytes', '820 KB', '1.4 MB', '24 MB', '']);
eq('too big wording', tooBigText(120 * MB, 100 * MB), 'Too big to keep here (120 MB; the limit is 100 MB). Ask them to email it instead.');

// ── WhatsApp keeps them 7 days ───────────────────────────────────────────────────────────────────────
const NOW = Date.parse('2026-10-19T12:00:00Z');
eq('6 days old: still there', stillAtWhatsApp('2026-10-13T12:00:01Z', NOW), true);
eq('7 days old: gone', stillAtWhatsApp('2026-10-12T12:00:00Z', NOW), false);
eq('no date: gone', stillAtWhatsApp(null, NOW), false);
eq('retry a failed one that’s still there', canRetry({ media_status: 'failed', created_at: '2026-10-19T11:00:00Z' }, NOW), true);
eq('no retry once too big', canRetry({ media_status: 'too_big', created_at: '2026-10-19T11:00:00Z' }, NOW), false);
eq('no retry past 7 days', canRetry({ media_status: 'failed', created_at: '2026-10-01T11:00:00Z' }, NOW), false);

// ── The chat's wording for each state ────────────────────────────────────────────────────────────────
const at = (kind, body, mime, status, error = null) => mediaStatusText({ kind, body, media_mime: mime, media_status: status, media_error: error });
eq('photo pending', at('image', '📷 Photo', 'image/jpeg', 'pending'), 'Photo on its way…');
eq('voice note pending', at('audio', '🎤 Voice note', 'audio/ogg', 'pending'), 'Voice note on its way…');
eq('video pending', at('video', '🎥 Video', 'video/mp4', 'pending'), 'Video on its way…');
eq('document pending', at('document', '📄 a.pdf', 'application/pdf', 'pending'), 'File on its way…');
eq('sticker pending', at('other', '🙂 Sticker', 'image/webp', 'pending'), 'Sticker on its way…');
eq('failed, with the reason saved', at('image', '📷 Photo', 'image/jpeg', 'failed', MEDIA_ERRORS.busy), 'WhatsApp was busy. Try again in a minute.');
eq('failed, no reason saved', at('image', '📷 Photo', 'image/jpeg', 'failed'), 'Couldn’t fetch this photo from WhatsApp. Try again.');
eq('expired', at('image', '📷 Photo', 'image/jpeg', 'expired'), 'WhatsApp only keeps files for 7 days, and this one wasn’t saved in time.');
eq('too big', at('video', '🎥 Video', 'video/mp4', 'too_big', tooBigText(120 * MB, 100 * MB)), tooBigText(120 * MB, 100 * MB));
eq('saved says nothing', at('image', '📷 Photo', 'image/jpeg', 'saved'), '');
eq('Graph 190: the access key', graphErrorText(190), MEDIA_ERRORS.token);
eq('Graph 100/33: gone', graphErrorText(100, 33), MEDIA_ERRORS.gone);
eq('Graph 80007: busy', graphErrorText(80007), MEDIA_ERRORS.busy);
eq('Graph 4: busy', graphErrorText(4), MEDIA_ERRORS.busy);
eq('Graph 10: permissions', graphErrorText(10), MEDIA_ERRORS.permission);
eq('no code: network', graphErrorText(), MEDIA_ERRORS.network);
eq('another code', graphErrorText(131052), 'WhatsApp wouldn’t hand it over (error 131052). Try again, or ask them to send it again.');
eq('no wording mentions opening WhatsApp (there’s no app on this number)', Object.values(MEDIA_ERRORS).some((t) => /open whatsapp/i.test(t)), false);

// ── Where the access key goes ────────────────────────────────────────────────────────────────────────
eq('Meta’s file host', isFileHost('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1&ext=2&hash=3'), true);
eq('not over http', isFileHost('http://lookaside.fbsbx.com/x'), false);
eq('not a look-alike', isFileHost('https://lookaside.fbsbx.com.evil.example/x'), false);
eq('not a sub-domain', isFileHost('https://x.lookaside.fbsbx.com/x'), false);
eq('not with a login in the link', isFileHost('https://user:pw@lookaside.fbsbx.com/x'), false);
eq('not on another port', isFileHost('https://lookaside.fbsbx.com:8443/x'), false);
eq('not junk', isFileHost('lookaside.fbsbx.com'), false);
eq('redirect to Meta’s CDN is followed (without the key)', isMetaCdn('https://scontent.xx.fbcdn.net/v/t1/abc'), true);
eq('redirect elsewhere is not', isMetaCdn('https://example.com/fbcdn.net'), false);
eq('nor to a look-alike', isMetaCdn('https://fbcdn.net.evil.example/x'), false);

// ── The SHA-256 Meta gives: base64 (the webhook) or hex ──────────────────────────────────────────────
const bytes = Buffer.from('a photo of a roof');
const hex = createHash('sha256').update(bytes).digest('hex');
eq('base64 matches', hashMatches(hex, createHash('sha256').update(bytes).digest('base64')), true);
eq('hex matches', hashMatches(hex, hex.toUpperCase()), true);
eq('base64url matches', hashMatches(hex, createHash('sha256').update(bytes).digest('base64url')), true);
eq('a different file doesn’t', hashMatches(hex, createHash('sha256').update('another').digest('base64')), false);
eq('a different file (hex) doesn’t', hashMatches(hex, createHash('sha256').update('another').digest('hex')), false);
eq('none given: nothing to check', hashMatches(hex, undefined), true);
eq('not a SHA-256 at all: nothing to check', hashMatches(hex, '<HASH>'), true);
eq('Meta’s own example parses', hashMatches(hex, 'SfInY0gGKTsJlUWbwxC1k+FAD0FZHvzwfpvO0zX0GUI='), false);

// ── Save to job photos ───────────────────────────────────────────────────────────────────────────────
const MID = '3f2b8c1e-6a7d-4e2f-9b1a-0c5d7e8f9a10';
eq('message id back from the job photo’s name', messageIdFromJobPhoto(`p1/site/wa-${MID}.jpg`), MID);
eq('ordinary job photos aren’t from a chat', messageIdFromJobPhoto('p1/site/1700000000000-ab12cd34.jpg'), null);
eq('thumbnails aren’t counted', messageIdFromJobPhoto(`p1/site/wa-${MID}.thumb.jpg`), null);
eq('caption', jobPhotoCaption('2026-10-19T10:00:00Z'), 'From WhatsApp, 19 Oct 2026');
eq('caption with theirs', jobPhotoCaption('2026-10-19T23:30:00Z', 'Our roof'), 'From WhatsApp, 20 Oct 2026 — Our roof');

// ── The server keeps to it (source checks) ───────────────────────────────────────────────────────────
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const media = src('src/lib/whatsapp/media.ts');
const route = src('src/app/api/whatsapp/media/[id]/route.ts');
const inbox = src('src/lib/whatsapp/inbox.ts');
const sql = src('supabase/whatsapp-media.sql');
eq('the key only goes to the file host', /if \(isFileHost\(url\)\) headers\.Authorization/.test(media), true);
eq('redirects are followed by hand', media.includes("redirect: 'manual'"), true);
eq('downloads time out', /AbortSignal\.timeout\(DOWNLOAD_MS\)/.test(media) && /AbortSignal\.timeout\(LOOKUP_MS\)/.test(media), true);
eq('stored under a fixed path per message, extension from the allow-list', media.includes('const path = `${row.enquiry_id}/${row.id}.${kept.ext}`'), true);
eq('stored with the allow-listed type, not Meta’s', media.includes('contentType: kept.contentType, upsert: true'), true);
eq('private bucket', media.includes('createBucket(MEDIA_BUCKET, { public: false })'), true);
eq('the route asks chatSession + mayOpenChat', route.includes('await chatSession()') && route.includes('mayOpenChat(s, found.enquiry_id)') && route.includes('mayOpenChat(s, row.enquiry_id)'), true);
eq('the route says nothing exists to people who can’t open the chat', route.includes("json({ error: 'Not found' }, 404)"), true);
eq('no-store and no-referrer on the redirect', route.includes("'Cache-Control': 'no-store'") && route.includes("'Referrer-Policy': 'no-referrer'"), true);
eq('saving to a job needs CRM access', route.includes("canAccess(s.profile, 'crm')"), true);
eq('the webhook saves the file columns only once the SQL is run', inbox.includes('const media = await inboundMediaColumns(m)') && inbox.includes('...media,'), true);
eq('the webhook doesn’t wait for the download', inbox.includes('if (media.media_id) storeMediaSoon(m.id)') && media.includes('after(() => run()'), true);
eq('SQL is safe to run twice', sql.split('\n').filter((l) => /^alter table/.test(l)).every((l) => l.includes('add column if not exists')), true);
eq('SQL adds every column', ['media_id', 'media_mime', 'media_name', 'media_size', 'media_path', 'media_status', 'media_error'].every((c) => sql.includes(`if not exists ${c}`)), true);
eq('SQL statuses match', sql.includes("check (media_status in ('pending','saved','failed','too_big','expired'))"), true);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
