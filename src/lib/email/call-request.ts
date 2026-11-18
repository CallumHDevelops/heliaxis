/**
 * "I'm available at 12 if you are", "call me at 3pm tomorrow": a customer's message asking for a call at a particular time.
 * Pure (no network, no clock but the one it is given), so it can be tested. It only looks at what the person wrote this time, not
 * the quoted conversation or the signature underneath, and only suggests a time when it is clear.
 */
export type CallRequest = {
  /** When they want the call (a moment), UK time worked out. */
  at: Date;
  /** "today at 12:00". */
  label: string;
  /** The sentence it was found in. */
  snippet: string;
  /** They named no day, so today (or tomorrow, if the time has gone) was assumed. */
  assumedDay: boolean;
};

const ent: Record<string, string> = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

/** An email body as plain text: tags out, line breaks kept. */
export function plainText(body: string): string {
  return body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|nbsp|lt|gt|quot|#39|apos);/g, (m) => ent[m] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** What the person wrote this time: everything above the quoted thread, "Sent from…" and the signature. */
export function newPart(text: string): string {
  const cut = text.search(/^\s*(from|sent|on .{3,80} wrote|-{2,}\s*original message|_{5,}|-{5,}|sent from (my|outlook)|get outlook for)\b.*$/im);
  return (cut > 0 ? text.slice(0, cut) : text).trim().slice(0, 800);
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const INTENT = /\b(call|ring|phone|speak|talk|chat|catch|available|free|around|ready|works?|good for me|suits?|convenient|reach)\b/i;
const NEGATIVE = /\b(can'?t|cannot|can not|not (available|free|able)|unavailable|unable|won'?t|busy|no good|doesn'?t work)\b/i;

const ukParts = (d: Date) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: String(p.weekday).toLowerCase() };
};
const addDay = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The moment it is hh:mm in the UK on that day. */
const ukMoment = (ymd: string, hh: number, mm: number) => {
  const guess = Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const p = ukParts(new Date(guess));
  const off = (p.hour * 60 + p.minute) - (hh * 60 + mm);
  return new Date(guess - (((off + 720) % 1440) - 720) * 60_000);
};

/** The time a sentence asks for, or null. */
function timeIn(s: string): { h: number; m: number } | null {
  if (/\b(noon|midday|12 ?o'?clock)\b/i.test(s)) return { h: 12, m: 0 };
  // "at 12", "at 3pm", "around 2.30", "after 5", "@ 4", "3 pm", "15:30"
  const rx = /(?:\b(?:at|around|about|after|by|from|for|@)\s*|\b)(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d/\-£%])/gi;
  for (const m of s.matchAll(rx)) {
    const lead = m[0];
    const hasWord = /^(at|around|about|after|by|from|for|@)/i.test(lead.trim());
    const ampm = (m[3] || '').toLowerCase().replace(/\./g, '');
    const colon = m[2] !== undefined;
    // A bare number is only a time with a word like "at" before it, or with am/pm, or as hh:mm.
    if (!hasWord && !ampm && !colon) continue;
    const next = s.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14).toLowerCase();
    if (/^\s*(kw|kwh|kwp|panels?|years?|yrs?|days?|weeks?|months?|minutes?|mins?|hours?|%|k\b|st\b|nd\b|rd\b|th\b)/.test(next)) continue;
    let h = Number(m[1]);
    const min = colon ? Number(m[2]) : 0;
    if (h > 23 || min > 59) continue;
    if (ampm === 'pm' && h < 12) h += 12;
    else if (ampm === 'am' && h === 12) h = 0;
    else if (!ampm && h >= 1 && h <= 7) h += 12; // "at 3" means the afternoon
    if (h < 7 || h > 21) continue; // not a time anyone rings at
    return { h, m: min };
  }
  return null;
}

function dayWord(s: string, today: { ymd: string; weekday: string }): { ymd: string; named: boolean } | null {
  const t = s.toLowerCase();
  if (/\btoday\b|\bthis (morning|afternoon|lunchtime)\b|\bthis evening\b/.test(t)) return { ymd: today.ymd, named: true };
  if (/\b(tomorrow|tmrw|tmw|tomorow)\b/.test(t)) return { ymd: addDay(today.ymd, 1), named: true };
  const i = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (i >= 0) {
    const now = DAYS.indexOf(today.weekday);
    let diff = (i - now + 7) % 7;
    if (diff === 0 || /\bnext\b/.test(t)) diff = diff === 0 ? 7 : diff + (diff < 7 && /\bnext\b/.test(t) && i > now ? 0 : 0);
    return { ymd: addDay(today.ymd, diff), named: true };
  }
  return null;
}

/** A request for a call at a particular time, in the new part of a message; null if there isn't a clear one. */
export function findCallRequest(message: string, now: Date): CallRequest | null {
  const text = newPart(plainText(message));
  if (!text) return null;
  const today = ukParts(now);
  const sentences = text.split(/(?<=[.!?])\s+|\n/).map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const near = [sentences[i - 1], s, sentences[i + 1]].filter(Boolean).join(' ');
    if (NEGATIVE.test(s)) continue;
    const t = timeIn(s);
    if (!t) continue;
    if (!INTENT.test(near)) continue;
    const named = dayWord(s, today) ?? dayWord(near, today);
    let ymd = named?.ymd ?? today.ymd;
    let at = ukMoment(ymd, t.h, t.m);
    if (!named && at.getTime() <= now.getTime()) {
      ymd = addDay(today.ymd, 1);
      at = ukMoment(ymd, t.h, t.m);
    }
    if (named && at.getTime() < now.getTime() - 15 * 60_000) continue; // a day and time already gone
    const dayLabel = ymd === today.ymd ? 'today' : ymd === addDay(today.ymd, 1) ? 'tomorrow' : new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { at, label: `${dayLabel} at ${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`, snippet: s.slice(0, 160), assumedDay: !named };
  }
  return null;
}

/* ── A call asked for, but no time given ─────────────────────────────────────── */

export type CallAsk = {
  /** "this morning", "tomorrow afternoon", "on Friday", or null when they gave no part of the day. */
  part: string | null;
  /** The day (UK) and the part of it, to look for free times: day defaults to today, or tomorrow once the day is nearly over. */
  ymd: string;
  bit: 'morning' | 'afternoon' | 'evening' | 'lunchtime' | null;
  snippet: string;
};

const ASK = /\b(call|ring|phone|bell) me\b|\bgive me a (call|ring|bell|buzz)\b|\b(can|could|would|will) you (please )?(call|ring|phone|give me a (call|ring))\b|\b(please|pls) (call|ring|phone)\b|\b(happy|free|available|keen|able) to (chat|talk|speak|have a (chat|call))\b|\bwould (like|love|prefer) (a|to) (call|talk|speak|chat)\b|\bcall (me )?back\b|\b(speak|talk) (to|with) (you|someone|somebody)\b/i;

/** The part of the day they asked for, in the words to say it back: "this morning", "tomorrow afternoon", "on Friday". */
function partOfDay(s: string, now: Date): string | null {
  const t = s.toLowerCase();
  const p = ukParts(now);
  const bit = /\bmorning\b/.test(t) ? 'morning' : /\bafternoon\b/.test(t) ? 'afternoon' : /\b(evening|tonight)\b/.test(t) ? 'evening' : /\blunch(time)?\b/.test(t) ? 'lunchtime' : null;
  if (/\btoday\b|\bthis (morning|afternoon|evening|lunchtime)\b|\btonight\b/.test(t)) return bit === 'lunchtime' ? 'at lunchtime today' : bit ? `this ${bit}` : 'today';
  if (/\b(tomorrow|tmrw|tmw|tomorow)\b/.test(t)) return bit ? `tomorrow ${bit === 'lunchtime' ? 'at lunchtime' : bit}` : 'tomorrow';
  const d = DAYS.find((x) => new RegExp(`\\b${x}\\b`).test(t));
  if (d) return `on ${d.charAt(0).toUpperCase()}${d.slice(1)}${bit ? ` ${bit === 'lunchtime' ? 'at lunchtime' : bit}` : ''}`;
  if (bit && bit !== 'lunchtime') return p.hour < (bit === 'morning' ? 11 : bit === 'afternoon' ? 15 : 19) ? `this ${bit}` : `tomorrow ${bit}`;
  return null;
}

/** They want a call but gave no time ("can you ring me tomorrow morning?"). Call this only when findCallRequest found nothing. */
export function findCallAsk(message: string, now: Date): CallAsk | null {
  const text = newPart(plainText(message));
  if (!text) return null;
  const sentences = text.split(/(?<=[.!?])\s+|\n/).map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (!ASK.test(s) || NEGATIVE.test(s) || /\b(don'?t|do not|no need to|not necessary)\b/i.test(s)) continue;
    const near = `${s} ${sentences[i + 1] ?? ''}`;
    const part = partOfDay(s, now) ?? partOfDay(sentences[i + 1] ?? '', now);
    const today = ukParts(now);
    const named = dayWord(near, today);
    const bit = (['morning', 'afternoon', 'evening', 'lunchtime'] as const).find((b) => new RegExp(`\\b${b === 'lunchtime' ? 'lunch' : b}`, 'i').test(near)) ?? (/\btonight\b/i.test(near) ? 'evening' : null);
    // "this morning" said in the afternoon, or no day at all and the day nearly over: tomorrow.
    const gone = !named && (bit === 'morning' ? today.hour >= 11 : bit === 'afternoon' ? today.hour >= 15 : today.hour >= 17);
    return { part, ymd: named?.ymd ?? (gone ? addDay(today.ymd, 1) : today.ymd), bit, snippet: s.slice(0, 160) };
  }
  return null;
}

/** The reply to suggest. Email gets a proper sign-off; WhatsApp stays short. */
export function suggestedReply(o: { kind: 'time' | 'ask'; first: string; label?: string; part?: string | null; me: string; channel: 'email' | 'whatsapp' }): string {
  const hi = `Hi ${o.first || 'there'}`;
  const body = o.kind === 'time' ? `thanks. I'd be happy to give you a call ${o.label}. Speak to you then.` : `thanks. I'd love to give you a call${o.part ? ` ${o.part}` : ''}. What time works best for you?`;
  return o.channel === 'whatsapp' ? `${hi}, ${body} ${o.me}`.replace(/\s+/g, ' ').trim() : `${hi},\n\n${body.charAt(0).toUpperCase()}${body.slice(1)}\n\nKind regards,\n${o.me}\nHeliaxis`;
}

export type QuickReply = { label: string; text: string };

/**
 * The replies to offer, first one the default. With a time asked for: confirm it (or, if the diary clashes, offer the nearest free times
 * as well). With no time: offer free times from the diary, or just ask what suits. `times` are "10:00" style, UK.
 */
export function quickReplies(o: { kind: 'time' | 'ask'; first: string; label?: string; part?: string | null; me: string; channel: 'email' | 'whatsapp'; times: string[]; clash: boolean }): QuickReply[] {
  const wrap = (body: string) => suggestedRaw(o.first, body, o.me, o.channel);
  if (o.kind === 'time') {
    const confirm = { label: 'Confirm the time', text: wrap(`thanks. I'd be happy to give you a call ${o.label}. Speak to you then.`) };
    if (!o.clash) return [confirm];
    const alt = o.times.length ? { label: `Offer ${listTimesShort(o.times)}`, text: wrap(`thanks, I'd be happy to give you a call. I'm tied up then. Could I call you at ${listTimes(o.times)} instead?`) } : null;
    const open = { label: 'Ask what suits', text: wrap(`thanks, I'd be happy to give you a call. I'm tied up then. What other time works for you?`) };
    return [...(alt ? [alt] : []), open, confirm];
  }
  const when = o.part ? ` ${o.part}` : '';
  const offer = o.times.length ? { label: `Offer ${listTimesShort(o.times)}`, text: wrap(`thanks, I'd love to give you a call${when}. Does ${listTimes(o.times)} suit you? If not, just tell me a time that does.`) } : null;
  const open = { label: 'Ask what time suits', text: wrap(`thanks, I'd love to give you a call${when}. What time works best for you?`) };
  return [...(offer ? [offer] : []), open];
}

const listTimes = (t: string[]) => (t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} or ${t[t.length - 1]}`);
const listTimesShort = (t: string[]) => t.join(' · ');

function suggestedRaw(first: string, body: string, me: string, channel: 'email' | 'whatsapp') {
  const hi = `Hi ${first || 'there'}`;
  return channel === 'whatsapp' ? `${hi}, ${body} ${me}`.replace(/\s+/g, ' ').trim() : `${hi},\n\n${body.charAt(0).toUpperCase()}${body.slice(1)}\n\nKind regards,\n${me}\nHeliaxis`;
}
