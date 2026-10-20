/**
 * A call-back reminder from a WhatsApp message: does the customer want a call, and when ("around 1pm
 * today", "at 13:30", "after 5", "half 2", "tomorrow morning", "Monday at 10"), read the UK way. Times
 * are UK time (Europe/London, both sides of the clocks changing), and a time with no day is the next
 * sensible one: "at 13:30" sent at 3pm is tomorrow, but "1pm today" stays today even once it's gone
 * (it's flagged as gone instead). Nothing found: an hour from now, or the next working morning.
 *
 * Pure, with no imports, so scripts/test-chat-time-parse.mjs loads it straight into node.
 */

export type CallTime = {
  /** UK date, 'YYYY-MM-DD'. */
  day: string;
  /** UK time, 'HH:MM'. */
  time: string;
};

export type ParsedTime = CallTime & {
  /** The words it came from ("around 1pm today"), to show in the sheet. */
  phrase: string;
  /** The customer named a day and it has gone (an old message): shown as a warning, never moved. */
  past: boolean;
};

export type Suggestion = CallTime & {
  /** The moment, as an ISO time. */
  at: string;
  /** Their message asks for a call ("give us a call", "ring me"). */
  asks: boolean;
  /** The job's next step: "Call David" or "Follow up with David". */
  callTitle: string;
  /** A task's title, with the whole name (it's read away from the job): "Call back David Clement". */
  taskTitle: string;
  /** Where the time came from, or '' when it's the default. */
  phrase: string;
  past: boolean;
  /** Their message, quoted for the note. '' with no message. */
  quote: string;
};

/* ── UK dates and times ──────────────────────────────────────────────────────── */

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The UK date and minutes past midnight of a moment. */
function uk(ms: number): { day: string; mins: number } {
  const p = PARTS.formatToParts(new Date(ms));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, mins: Number(get('hour')) * 60 + Number(get('minute')) };
}

const noon = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};
export function plusDays(day: string, n: number): string {
  const d = noon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday. */
const weekdayOf = (day: string) => noon(day).getUTCDay();
const hm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const minsOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const roundUp = (mins: number) => Math.ceil(mins / 15) * 15;

/** The moment it's `time` in the UK on `day`, as an ISO time (the offset worked out for that day). */
export function ukIso(day: string, time: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minsOf(time) / 60), minsOf(time) % 60);
  const seen = uk(guess);
  const [sy, sm, sd] = seen.day.split('-').map(Number);
  const offset = Date.UTC(sy, sm - 1, sd, Math.floor(seen.mins / 60), seen.mins % 60) - guess;
  return new Date(guess - offset).toISOString();
}
const msOf = (t: CallTime) => Date.parse(ukIso(t.day, t.time));
/** The UK day and time of a moment. */
export function callTimeOf(at: string | number): CallTime {
  const { day, mins } = uk(typeof at === 'number' ? at : Date.parse(at));
  return { day, time: hm(mins) };
}

/** "today", "tomorrow", "Mon 26 Oct". */
export function dayWords(day: string, now: number): string {
  const today = uk(now).day;
  const d = noon(day);
  return day === today ? 'today' : day === plusDays(today, 1) ? 'tomorrow' : `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}
/** "today 13:00", "tomorrow 09:30", "Mon 26 Oct 09:30", for the confirmation. */
export const whenWords = (t: CallTime, now: number) => `${dayWords(t.day, now)} ${t.time}`;

/** "Tue 20 Oct 08:47", for the quote. */
function stamp(ms: number): string {
  const { day, mins } = uk(ms);
  const d = noon(day);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} ${hm(mins)}`;
}

/* ── Nothing in the message: the default ─────────────────────────────────────── */

/** Working mornings start at 09:30; nothing is suggested after 17:00 or before 09:00. */
const MORNING = 9 * 60 + 30;
const DAY_END = 17 * 60;

/** The next weekday (Mon–Fri) after `day`, at 09:30. */
function nextWorkingMorning(day: string): CallTime {
  let d = plusDays(day, 1);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = plusDays(d, 1);
  return { day: d, time: hm(MORNING) };
}

/** An hour from now, rounded up to the quarter hour; before 9am that's 09:30, and past 17:00 the next working morning. */
export function defaultCallTime(now: number): CallTime {
  const { day, mins } = uk(now);
  const later = roundUp(mins + 60);
  if (later > DAY_END) return nextWorkingMorning(day);
  if (later < 9 * 60) return { day, time: hm(MORNING) };
  return { day, time: hm(later) };
}

/* ── Reading the message ─────────────────────────────────────────────────────── */

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
const numOf = (s: string) => NUMBER_WORDS[s] ?? Number(s);
const MERIDIEM = `(a\\.?m\\.?|p\\.?m\\.?)`;
const CUES = `at|around|about|after|from|by|before|roughly|any ?time after|between`;
/** An optional word before a time ("at 1", "after 5"), kept for "before" and "by". */
const CUE = `(?:\\b(${CUES})\\s*)?`;
/** What may follow a bare number for it to be a time: "after 5 would be great", not "from 2 suppliers". */
const BARE_END = `(?=\\s*$|\\s*[.,!?;:)\\-–]|\\s+(?:today|tomorrow|tmrw|tmw|tomoz|2moro|tonight|this|next|on|or|and|if|please|pls|then|that|would|will|is|works?|suits?|onwards|in|at|as|but|so|i|i'm|im|we|thanks|thank|cheers|x+|ta|any|ok|okay|latest|earliest|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b)`;

/** Parts of the day, with the time each one suggests and when it's over. */
type Part = { start: number; end: number; pm: boolean };
/** "this morning", "Monday afternoon", "in the evening": a day word first, so "Morning Callum!" isn't one. */
const PART_DAY = `(?:this|tomorrow|tomorow|tmrw|tmw|in the|the|any|late|early|mid|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)[- ]?`;
const PARTS_OF_DAY: [RegExp, Part][] = [
  [new RegExp(`\\b${PART_DAY}morning\\b`), { start: MORNING, end: 12 * 60, pm: false }],
  [/\b(?:lunch ?time|dinner ?time|lunch)\b/, { start: 12 * 60 + 30, end: 14 * 60, pm: true }],
  [new RegExp(`\\b${PART_DAY}afternoon\\b`), { start: 14 * 60, end: DAY_END, pm: true }],
  [/\b(?:after work|tea ?time)\b/, { start: 17 * 60 + 30, end: 20 * 60, pm: true }],
  [new RegExp(`\\b${PART_DAY}evening\\b|\\btonight\\b`), { start: 18 * 60, end: 21 * 60, pm: true }],
];

const WEEKDAYS: [string, number][] = [
  ['mon(?:day)?', 1],
  ['tue(?:s|sday)?', 2],
  ['wed(?:s|nesday)?', 3],
  ['thu(?:r|rs|rsday)?', 4],
  ['fri(?:day)?', 5],
  // Short only before a part of the day: "I sat down", "the sun's out".
  ['(?:saturday|sat(?=[- ](?:morning|afternoon|evening|night)))', 6],
  ['(?:sunday|sun(?=[- ](?:morning|afternoon|evening|night)))', 0],
];

type Span = { start: number; end: number };
type TimeHit = Span & { mins: number; meridiem: 'am' | 'pm' | null; cue: string; tie: boolean };
type DayHit = Span & ({ kind: 'offset'; days: number } | { kind: 'weekday'; weekday: number; next: boolean });

/** Every time in the message, in order, before am/pm is decided ("half 2" is 2:30). */
function timeHits(t: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const add = (m: RegExpExecArray, h: number, min: number, meridiem: string | undefined, cue: string | undefined) => {
    if (h > 23 || min > 59) return;
    const mer = meridiem ? (meridiem.startsWith('p') ? 'pm' : 'am') : null;
    if (mer && (h === 0 || h > 12)) return;
    // "busy until 2", "out at 3": when they can't talk, not when to call.
    const tie = /\b(until|till|til|busy|out|away|working|tied up|at work|in work)\s*$/.test(t.slice(Math.max(0, m.index - 18), m.index));
    // "not before 6", "don't ring before 5": the earliest they can talk, not a time to beat.
    const notBefore = cue === 'before' && /\b(not|don't|dont|never|no|can't|cannot|won't)\s+(?:[a-z']+\s+){0,2}$/.test(t.slice(Math.max(0, m.index - 24), m.index));
    hits.push({ start: m.index, end: m.index + m[0].trimEnd().length, mins: h * 60 + min, meridiem: mer, cue: notBefore ? 'from' : (cue ?? ''), tie });
  };
  const each = (re: string, on: (m: RegExpExecArray) => void) => {
    const g = new RegExp(re, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(t))) on(m);
  };

  // 13:30, 1:30pm, 1.30 pm (a dot only with am/pm or a cue word: "£1.50" is a price).
  each(`${CUE}(?<![£$\\d.:])\\b([01]?\\d|2[0-3])([:.])([0-5]\\d)(?!\\d)\\s*${MERIDIEM}?`, (m) => {
    if (m[3] === '.' && !m[1] && !m[5]) return;
    add(m, Number(m[2]), Number(m[4]), m[5], m[1]);
  });
  // 1-2pm, between 2 and 3pm (the first, with the end's am/pm). An earlier hour on the clock is the
  // morning before: "11-1pm" and "10-12pm" start at 11am and 10am (12 counts as 0, so "12-2pm" is noon).
  each(`${CUE}(?<![£$\\d.:])\\b${NUM}\\s*(?:-|–|to|and)\\s*${NUM}\\s*${MERIDIEM}`, (m) => {
    const from = numOf(m[2]);
    add(m, from, 0, m[4].startsWith('p') && from % 12 > numOf(m[3]) % 12 ? 'am' : m[4], m[1]);
  });
  // 1pm, 10 am, 3 o'clock, 2ish.
  each(`${CUE}(?<![£$\\d.:])\\b${NUM}\\s*(${MERIDIEM}|o'?clock|ish)(?![a-z])`, (m) => add(m, numOf(m[2]), 0, /^[ap]/.test(m[3]) ? m[3] : undefined, m[1]));
  // half 2, half past two (the UK "half 2" is 2:30).
  each(`${CUE}\\bhalf\\s+(?:past\\s+)?${NUM}\\b\\s*${MERIDIEM}?`, (m) => add(m, numOf(m[2]), 30, m[3], m[1]));
  // quarter past 3, quarter to 4.
  each(`${CUE}\\b(?:a\\s+)?quarter\\s+(past|to)\\s+${NUM}\\b\\s*${MERIDIEM}?`, (m) => {
    const h = numOf(m[3]);
    if (m[2] === 'past') add(m, h, 15, m[4], m[1]);
    else add(m, h === 1 ? 12 : h - 1, 45, m[4], m[1]);
  });
  // at 1, after 5, around ten: a bare number only after a cue word, and only where a time would end.
  each(`\\b(${CUES})\\s+${NUM}\\b(?![:.]\\d)${BARE_END}`, (m) => add(m, numOf(m[2]), 0, undefined, m[1]));
  // noon, midday.
  each(`\\b(?:12 )?(?:noon|midday|mid-day)\\b`, (m) => add(m, 12, 0, undefined, ''));

  // One hit per place: the longest wins (13:30 over 13, "half 2" over "2").
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: TimeHit[] = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && h.start < last.end) {
      if (h.end - h.start > last.end - last.start) out[out.length - 1] = h;
      continue;
    }
    out.push(h);
  }
  return out;
}

/** The first day word: today, tomorrow, a weekday. */
function dayHit(t: string): DayHit | null {
  const found: DayHit[] = [];
  const at = (m: RegExpExecArray): Span => ({ start: m.index, end: m.index + m[0].length });
  let m: RegExpExecArray | null;
  if ((m = /\bday after tomorrow\b/.exec(t))) found.push({ ...at(m), kind: 'offset', days: 2 });
  else if ((m = /\b(tomorrow|tomorow|tmrw|tmw|tomoz|2moro)\b/.exec(t))) found.push({ ...at(m), kind: 'offset', days: 1 });
  if ((m = /\b(today|tonight|this (?:morning|afternoon|evening)|later today)\b/.exec(t))) found.push({ ...at(m), kind: 'offset', days: 0 });
  for (const [word, weekday] of WEEKDAYS) {
    if ((m = new RegExp(`\\b(next\\s+|on\\s+|this\\s+)?${word}\\b`).exec(t))) found.push({ ...at(m), kind: 'weekday', weekday, next: !!m[1]?.startsWith('next') });
  }
  found.sort((a, b) => a.start - b.start);
  return found.find((d) => !ruledOut(t, d)) ?? found[0] ?? null;
}

/**
 * "I'm in work today but tomorrow's fine", "Not today, tomorrow at 2", "today's no good": the day (or
 * part of it) they can't do isn't the one.
 */
function ruledOut(t: string, d: Span): boolean {
  return (
    /\b(busy|working|in work|at work|out|away|not|no|can't|cannot|won't)(?:\s+(?:do|make|make it|manage|be free|free))?\s*$/.test(t.slice(Math.max(0, d.start - 18), d.start)) ||
    /^(?:'s|\s+is)?\s+(?:bad|no good|not good|out|(?:won't|doesn't|isn't|is not|wouldn't)\s+(?:work|suit|good))\b/.test(t.slice(d.end, d.end + 24))
  );
}

function partHit(t: string): (Span & { part: Part }) | null {
  let best: (Span & { part: Part }) | null = null;
  for (const [re, part] of PARTS_OF_DAY) {
    const m = re.exec(t);
    const hit = m && { start: m.index, end: m.index + m[0].length, part };
    // "Not this morning, this afternoon at 2": the afternoon.
    if (hit && !ruledOut(t, hit) && (!best || hit.start < best.start)) best = hit;
  }
  return best;
}

/** The day a day word means, counted from the day the message was sent. */
function dayFor(hit: DayHit, sentDay: string): string {
  if (hit.kind === 'offset') return plusDays(sentDay, hit.days);
  const ahead = (hit.weekday - weekdayOf(sentDay) + 7) % 7;
  return plusDays(sentDay, hit.next && ahead === 0 ? 7 : ahead);
}

/** The words a time came from: "around 1pm today", or "Monday … at 10" when they're apart. */
function phraseOf(text: string, spans: Span[]): string {
  const groups: Span[] = [];
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const last = groups[groups.length - 1];
    if (last && s.start - last.end <= 12) last.end = Math.max(last.end, s.end);
    else groups.push({ ...s });
  }
  return groups.map((g) => text.slice(g.start, g.end).trim()).join(' … ');
}

/**
 * When the message asks to be called, or null if it names no time or day. `sentAt` is when it was sent
 * ("today" is that day); `now` is for old messages, whose time-only suggestions move on to the next one.
 */
export function parseCallTime(text: string, sentAt: number, now: number): ParsedTime | null {
  // Lower case and the same length, so places in it are places in the message.
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  const sent = uk(sentAt);
  const day = dayHit(t);
  const part = partHit(t);
  const time = timeHits(t).find((h) => !h.tie) ?? null;
  // "in 20 minutes", "in an hour": from when they wrote.
  const soon = !time && !day ? /\bin\s+(?:(\d{1,3})\s+(?:mins?|minutes?)|(an?|half an|\d)\s+(?:hours?|hrs?))\b/.exec(t) : null;
  if (soon) {
    const add = soon[1] ? Number(soon[1]) : soon[2] === 'half an' ? 30 : (Number(soon[2]) || 1) * 60;
    const then = uk(sentAt + add * 60_000);
    const at: CallTime = { day: then.day, time: hm(Math.min(23 * 60 + 55, Math.ceil(then.mins / 5) * 5)) };
    return { ...at, phrase: soon[0], past: msOf(at) < now };
  }
  if (!time && !day && !part) return null;

  const explicitDay = day ? dayFor(day, sent.day) : null;
  const partOfDay = part?.part ?? null;
  const spans: Span[] = [];
  if (day) spans.push(day);
  if (part) spans.push(part);

  let mins: number;
  if (time) {
    spans.push(time);
    mins = time.mins;
    const h = Math.floor(mins / 60);
    if (!time.meridiem && h < 12) {
      // A bare 1 to 7 is the afternoon; 8 to 11 the morning, unless the part of the day says otherwise.
      const pm = partOfDay ? partOfDay.pm : h >= 1 && h <= 7;
      if (pm) mins += 12 * 60;
      // "after 8" sent at 10am for the same day: this evening, not the morning that's gone.
      else if (!partOfDay && h >= 8 && (explicitDay ?? sent.day) === sent.day && mins <= sent.mins && mins + 12 * 60 <= 21 * 60) mins += 12 * 60;
    } else if (time.meridiem === 'pm' && h < 12) mins += 12 * 60;
    else if (time.meridiem === 'am' && h === 12) mins -= 12 * 60;
    // "before 3", "by 3": half an hour earlier.
    if (time.cue === 'before' || time.cue === 'by') mins = Math.max(0, mins - 30);
  } else if (partOfDay) {
    mins = partOfDay.start;
  } else {
    // A day with no time: today means an hour from then, any other day the morning.
    if (explicitDay === sent.day) return { ...defaultCallTime(Math.max(sentAt, now)), phrase: phraseOf(text, spans), past: false };
    mins = MORNING;
  }
  const phrase = phraseOf(text, spans);
  // "This afternoon" (or just "in the afternoon") written mid-afternoon: soon, while it's still the afternoon.
  if (!time && partOfDay && (explicitDay ?? sent.day) === sent.day && mins <= sent.mins && sent.mins < partOfDay.end) {
    mins = Math.min(partOfDay.end, roundUp(sent.mins + 30));
  }

  if (explicitDay) {
    // A weekday that's today, at a time already gone when they wrote: next week's.
    const d = day?.kind === 'weekday' && explicitDay === sent.day && mins <= sent.mins ? plusDays(explicitDay, 7) : explicitDay;
    const at: CallTime = { day: d, time: hm(mins) };
    return { ...at, phrase, past: msOf(at) < now };
  }

  // No day: the next time it comes round after they wrote, or after now for an old message.
  let at: CallTime = { day: mins > sent.mins ? sent.day : plusDays(sent.day, 1), time: hm(mins) };
  if (msOf(at) < now) {
    const today = uk(now);
    at = { day: mins > today.mins ? today.day : plusDays(today.day, 1), time: hm(mins) };
  }
  return { ...at, phrase, past: false };
}

/* ── The reminder's words ────────────────────────────────────────────────────── */

/** "Give us a call", "ring me", "can we talk": they want a phone call (or we said we'd ring). */
export function asksForCall(text: string): boolean {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  return (
    /\b(call|ring|bell|buzz|phone)\s+(me|us|you|u|back|him|her|them)\b/.test(t) ||
    /\b(call|ring)\s+(today|tomorrow|this|after|at|around|any ?time|when|on|if|please|pls|later)\b/.test(t) ||
    /\b(give|gimme|have)\s+(?:(?:me|us|you|u|him|her|them)\s+)?(?:a|an)\s+(?:quick\s+)?(call|ring|bell|buzz|phone call|chat)\b/.test(t) ||
    /\b(a|quick|phone)\s+call\b/.test(t) ||
    /\b(callback|call-back|on the phone|over the phone)\b/.test(t) ||
    /\b(can|could|would|will)\s+(you|someone|somebody)\s+(call|ring|phone)\b/.test(t) ||
    /\b(can|could|shall)\s+(we|i)\s+(speak|talk|chat)\b/.test(t) ||
    /\b(speak|talk) to (you|someone|somebody)\b/.test(t)
  );
}

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || 'them';

/** A message for the note: who, when, and what was said (a long one cut short). */
export function quoteMessage(m: { body: string; direction: 'in' | 'out'; sentAt: number }, name: string): string {
  const body = m.body.trim();
  const said = body.length > 600 ? `${body.slice(0, 598).trimEnd()}…` : body;
  const who = m.direction === 'in' ? `${firstOf(name)} on WhatsApp` : 'Our WhatsApp';
  return `${who}, ${stamp(m.sentAt)}:\n“${said}”`;
}

/**
 * What the chat's reminder sheets start with, from a message (the customer's latest, or the one picked):
 * the titles, the time it asks for (or the default), and the quote. Everything can be changed before saving.
 * `asked` is our message just before theirs: "tomorrow's fine" to "when's good for a call?" is a call too.
 */
export function suggestReminder(m: { body: string; direction: 'in' | 'out'; sentAt: number } | null, name: string, now: number, asked = ''): Suggestion {
  const first = firstOf(name);
  const full = name.trim() || first;
  const asks = !!m && (asksForCall(m.body) || (m.direction === 'in' && asksForCall(asked)));
  const read = m ? parseCallTime(m.body, m.sentAt, now) : null;
  // A time that's gone, from a message sent before today, is no use: the default instead. (Today's, like
  // "1pm today" opened at 2pm, stays, with the sheet saying it's gone.)
  const parsed = read && (!read.past || uk(m!.sentAt).day === uk(now).day) ? read : null;
  const when: CallTime = parsed ?? defaultCallTime(now);
  return {
    day: when.day,
    time: when.time,
    at: ukIso(when.day, when.time),
    asks,
    callTitle: asks ? `Call ${first}` : `Follow up with ${first}`,
    taskTitle: asks ? `Call back ${full}` : `Follow up with ${full}`,
    phrase: parsed?.phrase ?? '',
    past: parsed?.past ?? false,
    quote: m ? quoteMessage(m, name) : '',
  };
}
