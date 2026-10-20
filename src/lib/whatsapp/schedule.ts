/**
 * When automatic messages go out: quiet hours (UK time, to the minute: 21:00 → 08:45 by default)
 * and keeping chasers inside the free 24-hour window. And when a message a person writes goes:
 * "Send later" and the late-night rule (typed after 20:30, it goes at 07:00). Pure (no I/O, nothing
 * imported at run time) so it's safe anywhere and scripts/test-wa-schedule.mjs and
 * scripts/test-wa-send-later.mjs can check it directly.
 */
import type { WaSettings } from './settings-shared';

/** Meta's free reply window: SERVICE_WINDOW_MS in shared.ts, repeated so this file stands alone. */
const WINDOW_MS = 24 * 3_600_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEP = 5 * MIN;

/** Quiet hours from the WhatsApp settings: minutes after midnight, UK time. */
export type QuietHours = Pick<WaSettings, 'quietFromMin' | 'quietToMin'>;
/** Everything that decides when a chaser may go: quiet hours and the evening rule. */
export type ChaseTimes = QuietHours & Pick<WaSettings, 'eveningRule' | 'eveningFromMin' | 'eveningNotBeforeMin'>;

const ukFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

/** What a UK clock and calendar show at `d`, as the UTC time that reads the same (whole minutes). */
function ukReading(d: Date | number): number {
  const p: Record<string, number> = {};
  for (const x of ukFmt.formatToParts(new Date(d))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
}

/** Minutes after midnight on a UK clock: 08:45 → 525. */
export function londonMinute(d: Date): number {
  return (ukReading(d) % DAY) / MIN;
}

export function londonHour(d: Date): number {
  return Math.floor(londonMinute(d) / 60);
}

/** Quiet from `quietFromMin` to `quietToMin` UK time, e.g. 21:00 → 08:45. Equal times = never quiet. */
export function isQuiet(d: Date, q: QuietHours): boolean {
  const { quietFromMin: from, quietToMin: to } = q;
  if (from === to) return false;
  const m = londonMinute(d);
  return from > to ? m >= from || m < to : m >= from && m < to;
}

/**
 * The first time at or after `d` when UK clocks show `minute` (after midnight). Right on the days the
 * clocks change too; a time the clocks skip in March counts as just after the jump.
 */
export function nextClock(d: Date, minute: number): Date {
  const now = ukReading(d);
  let want = now - (now % DAY) + minute * MIN;
  if (want < now) want += DAY;
  // The UK offset now, and then (different if the clocks change in between): the earliest real time
  // whose clock reads `want` or later.
  const offNow = now - Math.floor(d.getTime() / MIN) * MIN;
  const guess = want - offNow;
  const offThen = ukReading(guess) - guess;
  const fits = [guess, want - offThen].filter((t) => ukReading(t) >= want);
  return new Date(Math.max(d.getTime(), Math.min(...(fits.length ? fits : [guess]))));
}

/**
 * The outbox runs once a minute, so a chaser planned for the last minute before quiet hours would be
 * picked up in them and held overnight (missing the free window). Plans keep this far clear.
 */
const RUN_GAP = 2 * MIN;

/** Outside quiet hours at `t`, and still `lead` later. */
function awake(t: number, q: QuietHours, lead = 0): boolean {
  return !isQuiet(new Date(t), q) && !isQuiet(new Date(t + lead), q);
}

/**
 * The first time at or after `d` (and not before `floor`, when there is one) outside quiet hours
 * (and still outside them `lead` later), plus a little jitter (0–20 min) if it had to move.
 */
export function nextAwake(d: Date, q: QuietHours, opts: { floor?: Date | null; rand?: () => number; lead?: number } = {}): Date {
  const lead = opts.lead ?? 0;
  let t = Math.max(d.getTime(), opts.floor?.getTime() ?? 0);
  if (!awake(t, q, lead)) t = nextClock(new Date(t), q.quietToMin).getTime();
  if (t === d.getTime()) return d;
  const j = t + Math.round((opts.rand ?? Math.random)() * 20) * MIN;
  return new Date(awake(j, q, lead) ? j : t);
}

/** The last time at or before `d` outside quiet hours (and still outside them `lead` later). */
export function lastAwake(d: Date, q: QuietHours, lead = 0): Date {
  let t = d.getTime();
  for (let i = 0; i < 24 * 12 && !awake(t, q, lead); i++) t -= STEP;
  return new Date(t);
}

/**
 * The evening rule: when our message went at or after 18:00 (`eveningFromMin`), or in quiet hours
 * (the small hours, say), its chaser goes no sooner than the next 10:00 (`eveningNotBeforeMin`).
 * Null when the rule is off or doesn't apply.
 */
export function eveningFloor(sentAt: Date, s: ChaseTimes): Date | null {
  if (!s.eveningRule) return null;
  if (londonMinute(sentAt) < s.eveningFromMin && !isQuiet(sentAt, s)) return null;
  return nextClock(sentAt, s.eveningNotBeforeMin);
}

export type ChasePlan = { at: Date; free: boolean };

/**
 * When to chase: `hours` after our message, moved out of quiet hours and, after an evening message,
 * to no sooner than 10:00 the next morning (the evening rule). If that would miss the free window
 * and `keepFree` is on, chase shortly before the window closes instead, as long as that's still a
 * decent gap after our message (the smaller of `hours` and 4h) and the evening rule allows it;
 * otherwise it goes at the planned time as a paid template.
 */
export function planChase(opts: {
  sentAt: Date;
  hours: number;
  lastInboundAt: string | null;
  settings: ChaseTimes;
  keepFree: boolean;
  rand?: () => number;
}): ChasePlan {
  const { sentAt, hours, settings: s, keepFree, rand } = opts;
  const floor = eveningFloor(sentAt, s);
  const due = new Date(sentAt.getTime() + hours * HOUR);
  const target = nextAwake(due, s, { floor, rand, lead: RUN_GAP });
  const close = opts.lastInboundAt ? new Date(opts.lastInboundAt).getTime() + WINDOW_MS : null;
  const margin = 20 * MIN;
  // Free or not is decided without the jitter (as the chat's label works it out), so a few minutes'
  // jitter can't send it into the free-window move below; if the jitter would miss, it goes unjittered.
  const base = nextAwake(due, s, { floor, rand: () => 0, lead: RUN_GAP });
  if (close && base.getTime() < close - margin) return { at: target.getTime() < close - margin ? target : base, free: true };
  if (keepFree && close) {
    let cand = lastAwake(new Date(close - HOUR), s, RUN_GAP);
    // Too early for the evening rule: the earliest it allows, if that still beats the window.
    if (floor && cand.getTime() < floor.getTime()) cand = nextAwake(floor, s, { rand: () => 0, lead: RUN_GAP });
    const minGap = Math.min(hours, 4) * HOUR;
    if (cand.getTime() >= sentAt.getTime() + minGap && cand.getTime() < close - margin) return { at: cand, free: true };
  }
  return { at: target, free: false };
}

/** What the outbox's safety net needs from the settings. */
export type HoldSettings = ChaseTimes & Pick<WaSettings, 'smartRepliesQuietHours' | 'firstContactQuietHours'>;

/**
 * The safety net just before the outbox sends something on its own: null = it can go now, else the
 * time to wait for. Chasers and final nudges never go in quiet hours, nor before the evening rule's
 * morning time worked out from our last message in the chat (`lastOutAt`), so chasers queued under
 * older rules follow today's. Smart replies and intros wait only when their quiet-hours hold is on.
 * Something a person pressed "Send now" on (`sendNow`) always goes, and so does a message a person
 * scheduled ('scheduled'): its time was their choice, quiet hours or not.
 */
export function holdUntil(opts: {
  kind: string;
  now: Date;
  settings: HoldSettings;
  lastOutAt: Date | null;
  sendNow?: boolean;
  rand?: () => number;
}): Date | null {
  const { kind, now, settings: s } = opts;
  if (opts.sendNow || kind === 'scheduled') return null;
  const held = kind === 'chase' || (kind === 'reply' && s.smartRepliesQuietHours) || (kind === 'intro' && s.firstContactQuietHours);
  if (!held) return null;
  const floor = kind === 'chase' && opts.lastOutAt ? eveningFloor(opts.lastOutAt, s) : null;
  const at = nextAwake(now, s, { floor, rand: opts.rand });
  return at.getTime() > now.getTime() ? at : null;
}

/**
 * What a chat needs to say when a chaser would go: the chase times, whether chasers stay free, and the
 * late-night rule (a message typed late goes in the morning, and its chaser counts from then).
 */
export type ChaseView = ChaseTimes & LateRule & { keepFree: boolean };

export function chaseView(s: WaSettings): ChaseView {
  const { quietFromMin, quietToMin, eveningRule, eveningFromMin, eveningNotBeforeMin, keepChasesFree, lateRule, lateFromMin, lateSendAtMin } = s;
  return { quietFromMin, quietToMin, eveningRule, eveningFromMin, eveningNotBeforeMin, keepFree: keepChasesFree, lateRule, lateFromMin, lateSendAtMin };
}

const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' });
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });

/** A UK time in words, seen from `now`: "today about 15:30", "tomorrow about 10:00", "Thu about 10:00". */
export function whenWords(at: Date, now: Date): string {
  const days = Math.floor(ukReading(at) / DAY) - Math.floor(ukReading(now) / DAY);
  const m = londonMinute(at);
  const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const day = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : days < 7 ? weekdayFmt.format(at) : dateFmt.format(at);
  return `${day} about ${time}`;
}

/**
 * When a chaser set now would go, in words, worked out as the server will plan it (without the
 * jitter, so it's the earliest): for the "Chase if no reply" choices. A message that goes later
 * (`sendAt`: Send later, the late-night rule) is chased from when it goes.
 */
export function chaseWhen(opts: { now: Date; hours: number; lastInboundAt: string | null; view: ChaseView; sendAt?: Date | null }): string {
  const { now, hours, lastInboundAt, view } = opts;
  const sentAt = opts.sendAt && opts.sendAt.getTime() > now.getTime() ? opts.sendAt : now;
  const plan = planChase({ sentAt, hours, lastInboundAt, settings: view, keepFree: view.keepFree, rand: () => 0 });
  return whenWords(plan.at, now);
}

/* ── Messages a person sends later: "Send later" and the late-night rule ─────────────────────────── */

/** The late-night rule from the settings (Smart replies → Chasers). */
export type LateRule = Pick<WaSettings, 'lateRule' | 'lateFromMin' | 'lateSendAtMin'>;

/**
 * When a message a person sends now really goes under the late-night rule: null = straight away,
 * otherwise the next `lateSendAtMin` on a UK clock. It covers `lateFromMin` (20:30) right through the
 * small hours to that morning time, so 20:29 goes, 20:30 and 23:49 wait for 07:00 the next day, and
 * 02:00 waits for 07:00 that morning. Off, or the same two times: never.
 */
export function lateSendAt(now: Date, s: LateRule): Date | null {
  if (!s.lateRule || !isQuiet(now, { quietFromMin: s.lateFromMin, quietToMin: s.lateSendAtMin })) return null;
  return nextClock(now, s.lateSendAtMin);
}

/** "Send later"'s quick choices, minutes after midnight, UK time: 07:00, 08:45 and 09:30. */
export const LATER_TIMES = [7 * 60, 8 * 60 + 45, 9 * 60 + 30];

export type LaterChoice = { at: Date; label: string };

/** The UK calendar day of `d`, as days since 1 January 1970. */
const ukDay = (d: Date | number) => Math.floor(ukReading(d) / DAY);
const two = (n: number) => String(n).padStart(2, '0');
const clockOf = (minute: number) => `${two(Math.floor(minute / 60))}:${two(minute % 60)}`;
const longWeekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long' });
const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' });

/** The real time when UK clocks show `minute` on UK day `day` (a time the clocks skip counts as just after the jump). */
function ukAt(day: number, minute: number): Date {
  // Two hours before, a UK clock reads late the evening before or early that day: the next `minute` is the one.
  return nextClock(new Date(day * DAY + minute * MIN - 2 * HOUR), minute);
}

/**
 * The quick choices, as the composer lists them: 07:00, 08:45 and 09:30 the next morning ("This
 * morning" in the small hours, before 07:00), with Monday instead of a Sunday morning. Real times,
 * right on the days the clocks change.
 */
export function laterChoices(now: Date): LaterChoice[] {
  const today = ukDay(now);
  let day = londonMinute(now) < LATER_TIMES[0] ? today : today + 1;
  if (new Date(day * DAY).getUTCDay() === 0) day++;
  const word = day === today ? 'This morning' : day === today + 1 ? 'Tomorrow' : longWeekday.format(new Date(day * DAY + 12 * HOUR));
  return LATER_TIMES.map((m) => ({ at: ukAt(day, m), label: `${word} ${clockOf(m)}` }));
}

/**
 * When a person's message goes, in words, seen from `now`: "07:00 tomorrow", "01:00 tonight" (the
 * small hours, seen from the evening), "07:00 today", "07:00 on Monday", "07:00 on Thu 29 Oct".
 */
export function atWords(at: Date, now: Date): string {
  const days = ukDay(at) - ukDay(now);
  const m = londonMinute(at);
  const time = clockOf(m);
  if (days <= 0) return `${time} today`;
  if (days === 1) return m < 5 * 60 && londonMinute(now) >= 18 * 60 ? `${time} tonight` : `${time} tomorrow`;
  if (days < 7) return `${time} on ${longWeekday.format(at)}`;
  return `${time} on ${dateFmt.format(at).replace(',', '')}`;
}

/** For a chat list: "07:00" within the next 24 hours (so always the next 07:00), else "Mon 07:00", or "29 Oct 07:00". */
export function shortAt(at: Date, now: Date): string {
  const time = clockOf(londonMinute(at));
  const ahead = at.getTime() - now.getTime();
  if (ahead < DAY) return time;
  if (ahead < 6 * DAY) return `${weekdayFmt.format(at)} ${time}`;
  return `${dayMonth.format(at)} ${time}`;
}

/** A time for <input type="datetime-local">, as UK time whatever the computer's own clock is set to. */
export function ukInput(d: Date): string {
  return new Date(ukReading(d)).toISOString().slice(0, 16);
}

/** What a datetime-local box says ("2026-10-21T07:00"), read as UK time; null if it isn't a date and time. */
export function fromUkInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null;
  const day = Date.UTC(y, mo - 1, d) / DAY;
  if (new Date(day * DAY).getUTCDate() !== d) return null; // 31 June and the like
  return ukAt(day, h * 60 + mi);
}

/** When their free 24-hour window closes (their last message + 24h), in ms; null if they've never messaged. */
export function windowClosesAt(lastInboundAt: string | null | undefined): number | null {
  const t = lastInboundAt ? new Date(lastInboundAt).getTime() : NaN;
  return Number.isFinite(t) ? t + WINDOW_MS : null;
}

/**
 * Can a typed (free) message still go at `at`? Only inside the 24h window, with the outbox's minute
 * to spare: it runs once a minute, so something due at 00:59 for a window closing at 01:00 could miss.
 */
export function freeAt(at: Date, lastInboundAt: string | null | undefined): boolean {
  const close = windowClosesAt(lastInboundAt);
  return close !== null && at.getTime() <= close - RUN_GAP;
}

/**
 * The latest time worth offering inside the window: 5 minutes before it closes, on a 5-minute mark.
 * Null when that has gone (or nearly: under 2 minutes away), or they've never messaged.
 */
export function lastFreeAt(lastInboundAt: string | null | undefined, now: Date): Date | null {
  const close = windowClosesAt(lastInboundAt);
  if (close === null) return null;
  const t = Math.floor((close - STEP) / STEP) * STEP;
  return t > now.getTime() + RUN_GAP ? new Date(t) : null;
}
