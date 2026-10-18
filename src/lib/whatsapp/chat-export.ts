/**
 * Reading a chat exported from the WhatsApp app (chat → Export chat): the .txt Android saves, or the
 * _chat.txt inside an iPhone's .zip. Pure and dependency-free, so the import page previews a file in
 * the browser and the server parses the same text the same way before saving anything.
 *
 *   Android  18/10/2026, 14:32 - Jane Smith: Hi, is Thursday ok?
 *   iPhone   [18/10/2026, 14:32:05] Jane Smith: Hi, is Thursday ok?
 */

export type MediaType = 'photo' | 'video' | 'audio' | 'voice' | 'document' | 'sticker' | 'gif' | 'contact' | 'other';

export type ChatMessage = {
  /** When it was sent (UTC ISO). The file has UK wall-clock times. */
  at: string;
  author: string;
  /** The text; for media a short stand-in like "[Photo]" plus any caption. */
  body: string;
  kind: 'text' | 'media' | 'deleted';
  /** What the media was, when kind is 'media'. */
  media?: MediaType;
};

export type ParsedChat = {
  messages: ChatMessage[];
  /** Everyone who wrote something, most messages first. */
  authors: { name: string; count: number }[];
  warnings: string[];
};

/** Longest export the importer takes in one go (characters of the .txt). */
export const MAX_CHAT_CHARS = 3 * 1024 * 1024;

/** Direction marks and bidi controls WhatsApp puts around names, numbers and media lines. */
const MARKS = /[‎‏‪-‮⁦-⁩﻿]/g;
/** No-break, figure and narrow no-break spaces (newer phones put U+202F before "pm"). */
const SPACES = /[   ]/g;

const DATE = String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})`;
const TIME = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s?([ap])\.?\s?m\.?)?`;
const IOS_LINE = new RegExp(String.raw`^\[${DATE},?\s${TIME}\]\s(.*)$`, 'i');
const ANDROID_LINE = new RegExp(String.raw`^${DATE},?\s${TIME}\s[-–]\s(.*)$`, 'i');

/**
 * WhatsApp's own notices. Only lines WhatsApp wrote are checked against these: Android's have no
 * name, and iPhones put them under the contact's name with U+200E straight after "Name: ". A
 * customer's "Have you changed your phone number?" is an ordinary message.
 */
const SYSTEM = [
  /^Messages (and calls )?(to this (chat|group) )?(are|were) (now )?(secured with )?end-to-end encrypt/i,
  /^.{0,120}end-to-end encrypted\. (No one outside|Only people in this chat)/i,
  /^Your security code with .+ changed/i,
  /^.{1,80} changed (their|your) phone number\b/i,
  /^\+?[\d\s().-]{7,} changed to \+?[\d\s().-]{7,}\.?$/,
  /^This (business|chat|account) .*(Meta|business account|standard account|other companies|Tap to learn more)/i,
  /^.{1,80} is a contact\.?$/i,
  /^.{1,80} (turned (on|off)|uses a default timer for|changed the timer for) disappearing messages/i,
  /^Disappearing messages (were|are) turned (on|off)/i,
  /^You (blocked|unblocked) this (contact|business)/i,
  /^Tap (here )?to (learn more|change|message|unblock|view)/i,
];

const DELETED = [/^This message was deleted\.?$/i, /^You deleted this message\.?$/i, /^Waiting for this message\b/i];
/** Starts on the literal, so a long run of spaces or blank lines can't make it slow. */
const EDITED = /<This message was edited>\s*$/i;

const LABEL: Record<MediaType, string> = {
  photo: 'Photo',
  video: 'Video',
  audio: 'Audio',
  voice: 'Voice note',
  document: 'Document',
  sticker: 'Sticker',
  gif: 'GIF',
  contact: 'Contact card',
  other: 'Media',
};

/** A file name in an export ("IMG-20261018-WA0003.jpg", "00000012-PHOTO-2026-10-18-14-32-05.jpg") → what it was. */
function mediaFromFile(file: string): { media: MediaType; name?: string } {
  const f = file.trim();
  if (/^PTT-|-AUDIO-|\.opus$/i.test(f)) return { media: 'voice' };
  if (/^STK-|-STICKER-|\.webp$/i.test(f)) return { media: 'sticker' };
  if (/-GIF-|\.gif$/i.test(f)) return { media: 'gif' };
  if (/^IMG-|-PHOTO-|\.(jpe?g|png|heic|heif)$/i.test(f)) return { media: 'photo' };
  if (/^VID-|-VIDEO-|\.(mp4|mov|3gp|mkv|avi)$/i.test(f)) return { media: 'video' };
  if (/^AUD-|\.(m4a|aac|amr|mp3|ogg|wav)$/i.test(f)) return { media: 'audio' };
  // iPhones number every attachment: "00000045-Quote.pdf".
  const name = f.replace(/^\d{8}-/, '');
  if (/\.vcf$/i.test(f)) return { media: 'contact', name: name.replace(/\.vcf$/i, '') };
  return { media: 'document', name };
}

/** The first line of a message when it stands for a photo, voice note… (null for ordinary text). */
function mediaLine(line: string): { media: MediaType; name?: string } | null {
  const l = line.trim();
  if (l.length > 400) return null; // never media (and keeps the patterns below quick)
  if (/^<Media omitted>$/i.test(l) || l === 'null') return { media: 'other' };
  let m = l.match(/^<attached: (.+)>$/i) || l.match(/^(.+\.[a-z0-9]{2,5}) \(file attached\)$/i);
  if (m) return mediaFromFile(m[1]);
  m = l.match(/^<?(image|photo|video|audio|sticker|document|GIF|Contact card|video note|voice message) omitted>?$/i);
  if (m) {
    const w = m[1].toLowerCase();
    const media: MediaType =
      w === 'image' || w === 'photo' ? 'photo'
      : w === 'video' || w === 'video note' ? 'video'
      : w === 'voice message' ? 'voice'
      : w === 'contact card' ? 'contact'
      : (w as MediaType);
    return { media };
  }
  // iPhone: "Quote.pdf • 3 pages document omitted".
  m = l.match(/^(.+?)(?: • .*)? document omitted$/i);
  if (m) return { media: 'document', name: m[1].trim() };
  m = l.match(/^<(.{1,60}) omitted>$/i); // e.g. <View once voice message omitted>
  if (m) return { media: /voice|audio/i.test(m[1]) ? 'voice' : /video/i.test(m[1]) ? 'video' : /photo|image/i.test(m[1]) ? 'photo' : 'other' };
  return null;
}

let londonFmt: Intl.DateTimeFormat | null = null;
const offsetByHour = new Map<number, number>();

/** Europe/London's offset from UTC (ms) at an instant. UK clocks only change on the hour (01:00 UTC). */
function londonOffset(ms: number): number {
  const hour = Math.floor(ms / 3_600_000);
  const cached = offsetByHour.get(hour);
  if (cached !== undefined) return cached;
  londonFmt ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const p: Record<string, number> = {};
  for (const part of londonFmt.formatToParts(new Date(hour * 3_600_000))) p[part.type] = Number(part.value);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - hour * 3_600_000;
  offsetByHour.set(hour, offset);
  return offset;
}

/**
 * UK wall-clock time (as if it were UTC) → the real instant. In October's repeated hour the reading
 * at or after the previous message wins; March's missing hour reads as if clocks hadn't gone forward.
 */
function ukToUtc(wall: number, notBefore: number): number {
  const before = londonOffset(wall - 43_200_000);
  const after = londonOffset(wall + 43_200_000);
  const fits = [...new Set([wall - before, wall - after])]
    .filter((t) => londonOffset(t) === wall - t)
    .sort((a, b) => a - b);
  if (!fits.length) return wall - before;
  return fits.find((t) => t >= notBefore) ?? fits[0];
}

type Head = { a: number; b: number; y: number; h: number; mi: number; s: number; ampm: string | undefined; rest: string };

function readHead(line: string): Head | null {
  const m = line.match(IOS_LINE) || line.match(ANDROID_LINE);
  if (!m) return null;
  return { a: +m[1], b: +m[2], y: +m[3], h: +m[4], mi: +m[5], s: m[6] ? +m[6] : 0, ampm: m[7]?.toLowerCase(), rest: m[8] };
}

/** Wall-clock ms for a header line, or null when the date or time can't be real. */
function wallClock(h: Head, dayFirst: boolean): number | null {
  const day = dayFirst ? h.a : h.b;
  const month = dayFirst ? h.b : h.a;
  const year = h.y < 100 ? 2000 + h.y : h.y;
  let hour = h.h;
  if (h.ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (h.ampm === 'p' ? 12 : 0);
  }
  if (month < 1 || month > 12 || day < 1 || hour > 23 || h.mi > 59 || h.s > 59) return null;
  const t = Date.UTC(year, month - 1, day, hour, h.mi, h.s);
  return new Date(t).getUTCDate() === day ? t : null; // 31/02 rolls over to March
}

/** "Name: text" → author + text; null for WhatsApp's own lines ("Messages and calls are…"). */
function splitAuthor(rest: string): { author: string; text: string } | null {
  const i = rest.indexOf(': ');
  if (i > 0 && i <= 80) return { author: rest.slice(0, i).trim(), text: rest.slice(i + 2) };
  if (rest.endsWith(':') && rest.length <= 81) return { author: rest.slice(0, -1).trim(), text: '' };
  return null;
}

export function parseChatExport(input: string): ParsedChat {
  const raw = input.split(/\r\n|\r|\n/);
  const lines = raw.map((l) => l.replace(MARKS, '').replace(SPACES, ' '));
  const heads = lines.map(readHead);
  const warnings: string[] = [];
  const found = heads.filter((h): h is Head => !!h);
  if (!found.length) {
    return { messages: [], authors: [], warnings: ['This doesn’t look like a WhatsApp chat export, so nothing could be read from it.'] };
  }

  // Phones write dates the local way. A first number over 12 means day/month; a second, month/day.
  let dayFirst = true;
  if (!found.some((h) => h.a > 12)) {
    if (found.some((h) => h.b > 12)) dayFirst = false;
    else if (found.some((h) => h.a !== h.b)) {
      warnings.push('The dates could be day/month or month/day, so they’ve been read the UK way (day/month).');
    }
  }

  const messages: ChatMessage[] = [];
  let current: { at: number; author: string; text: string; extra: string[]; byWhatsApp: boolean } | null = null;
  let orphans = 0;
  let badDates = 0;
  let last = -Infinity;

  const finish = () => {
    if (!current) return;
    const { author } = current;
    const first = current.text.replace(EDITED, '');
    const caption = current.extra.join('\n').replace(EDITED, '').trim();
    const text = (current.extra.length ? `${current.text}\n${current.extra.join('\n')}` : current.text).replace(EDITED, '').trim();
    if (!text || (current.byWhatsApp && SYSTEM.some((r) => r.test(text)))) return;
    const at = new Date(current.at).toISOString();
    if (DELETED.some((r) => r.test(text))) {
      messages.push({ at, author, body: text.replace(/\.$/, ''), kind: 'deleted' });
      return;
    }
    const media = mediaLine(first);
    if (media) {
      const label = media.name ? `[${LABEL[media.media]}: ${media.name}]` : `[${LABEL[media.media]}]`;
      messages.push({ at, author, body: caption ? `${label} ${caption}` : label, kind: 'media', media: media.media });
      return;
    }
    messages.push({ at, author, body: text, kind: 'text' });
  };

  for (let i = 0; i < lines.length; i++) {
    const h = heads[i];
    const wall = h ? wallClock(h, dayFirst) : null;
    if (h && wall !== null) {
      const who = splitAuthor(h.rest);
      if (who) {
        finish();
        const at = ukToUtc(wall, last);
        last = at;
        const colon = raw[i].indexOf(': ');
        current = { at, ...who, extra: [], byWhatsApp: colon >= 0 && raw[i][colon + 2] === '‎' };
        continue;
      }
      if (SYSTEM.some((r) => r.test(h.rest.trim()))) {
        finish(); // one of WhatsApp's own lines, with no name
        current = null;
        continue;
      }
      // No name and not a notice: a line in a message that starts with a date and time
      // ("25/10/2026, 10:00 - 12:00"), so it stays part of that message.
    }
    if (current) {
      if (h && wall === null) badDates++;
      current.extra.push(lines[i]);
    } else if (lines[i].trim()) {
      orphans++;
    }
  }
  finish();

  if (orphans) {
    warnings.push(`${orphans === 1 ? '1 line' : `${orphans} lines`} ${orphans === 1 ? 'wasn’t' : 'weren’t'} part of any message, so ${orphans === 1 ? 'it was' : 'they were'} left out.`);
  }
  if (badDates) {
    warnings.push(`${badDates === 1 ? '1 line has' : `${badDates} lines have`} a date that can’t be right, so ${badDates === 1 ? 'it was' : 'they were'} read as part of the message before.`);
  }

  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.author, (counts.get(m.author) ?? 0) + 1);
  const authors = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { messages, authors, warnings };
}

/**
 * Who's who once it's known which author is Heliaxis (null: only the customer wrote). One-to-one
 * chats only: another name with a few stray lines (3 at most, under 5% of the chat) is left out,
 * but more than that is a group chat, and saving a third person's messages as the customer's
 * would be wrong.
 */
export function chatSides(chat: ParsedChat, us: string | null): { customer: string | null; ignored: string[]; group: boolean } {
  const others = chat.authors.filter((a) => a.name !== us);
  const extra = others.slice(1);
  const n = extra.reduce((sum, a) => sum + a.count, 0);
  return { customer: others[0]?.name ?? null, ignored: extra.map((a) => a.name), group: n > 3 || n > chat.messages.length * 0.05 };
}

/** The customer's name from the export's file name, e.g. "WhatsApp Chat with Jane Smith.txt" → "Jane Smith". */
export function nameFromFileName(fileName: string): string | null {
  const base = (fileName.split(/[\\/]/).pop() || '')
    .replace(MARKS, '')
    .replace(SPACES, ' ')
    .replace(/\.(txt|zip)$/i, '')
    .replace(/\s*\(\d+\)$/, '') // "… (1)" from downloading twice
    .trim();
  const m = base.match(/^WhatsApp[ _-]?Chat(?:\s+with\s+|\s*[-–]\s*)(.+)$/i);
  const name = m?.[1].trim();
  return name || null;
}

/** "+44 7700 900123", "07700 900123" — a chat saved under a number rather than a name. */
export function looksLikePhone(s: string | null | undefined): boolean {
  const t = (s || '').replace(MARKS, '').replace(SPACES, ' ').trim();
  const digits = t.replace(/\D/g, '').length;
  return /^\+?[\d\s().-]+$/.test(t) && digits >= 7 && digits <= 15;
}

/** "3 Mar – 2 Oct 2026", "3 Mar 2025 – 2 Oct 2026" or "3 Mar 2026", in UK time. */
export function dateRange(fromIso: string, toIso: string): string {
  const opts = { timeZone: 'Europe/London', day: 'numeric', month: 'short' } as const;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { ...opts, year: 'numeric' });
  const from = day(fromIso);
  const to = day(toIso);
  if (from === to) return from;
  const sameYear = from.slice(-4) === to.slice(-4);
  return `${sameYear ? new Date(fromIso).toLocaleDateString('en-GB', opts) : from} – ${to}`;
}
