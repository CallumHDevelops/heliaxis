/**
 * When automatic messages go out: quiet hours (UK time, to the minute: 21:00 → 08:45 by default)
 * and keeping chasers inside the free 24-hour window. Pure (no I/O, nothing imported at run time)
 * so it's safe anywhere and scripts/test-wa-schedule.mjs can check it directly.
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
 * The first time at or after `d` (and not before `floor`, when there is one) outside quiet hours,
 * plus a little jitter (0–20 min) if it had to move.
 */
export function nextAwake(d: Date, q: QuietHours, opts: { floor?: Date | null; rand?: () => number } = {}): Date {
  let t = Math.max(d.getTime(), opts.floor?.getTime() ?? 0);
  if (isQuiet(new Date(t), q)) t = nextClock(new Date(t), q.quietToMin).getTime();
  if (t === d.getTime()) return d;
  const j = t + Math.round((opts.rand ?? Math.random)() * 20) * MIN;
  return new Date(isQuiet(new Date(j), q) ? t : j);
}

/** The last time at or before `d` outside quiet hours. */
export function lastAwake(d: Date, q: QuietHours): Date {
  let t = d.getTime();
  for (let i = 0; i < 24 * 12 && isQuiet(new Date(t), q); i++) t -= STEP;
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
  const target = nextAwake(new Date(sentAt.getTime() + hours * HOUR), s, { floor, rand });
  const close = opts.lastInboundAt ? new Date(opts.lastInboundAt).getTime() + WINDOW_MS : null;
  const margin = 20 * MIN;
  if (close && target.getTime() < close - margin) return { at: target, free: true };
  if (keepFree && close) {
    let cand = lastAwake(new Date(close - HOUR), s);
    // Too early for the evening rule: the earliest it allows, if that still beats the window.
    if (floor && cand.getTime() < floor.getTime()) cand = nextAwake(floor, s, { rand: () => 0 });
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
 * Something a person pressed "Send now" on (`sendNow`) always goes.
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
  if (opts.sendNow) return null;
  const held = kind === 'chase' || (kind === 'reply' && s.smartRepliesQuietHours) || (kind === 'intro' && s.firstContactQuietHours);
  if (!held) return null;
  const floor = kind === 'chase' && opts.lastOutAt ? eveningFloor(opts.lastOutAt, s) : null;
  const at = nextAwake(now, s, { floor, rand: opts.rand });
  return at.getTime() > now.getTime() ? at : null;
}
