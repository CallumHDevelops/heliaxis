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

/** The first time at or after `d` outside quiet hours, plus a little jitter (0–20 min) if it had to move. */
export function nextAwake(d: Date, q: QuietHours, opts: { rand?: () => number } = {}): Date {
  if (!isQuiet(d, q)) return d;
  const t = nextClock(d, q.quietToMin).getTime();
  const j = t + Math.round((opts.rand ?? Math.random)() * 20) * MIN;
  return new Date(isQuiet(new Date(j), q) ? t : j);
}

/** The last time at or before `d` outside quiet hours. */
export function lastAwake(d: Date, q: QuietHours): Date {
  let t = d.getTime();
  for (let i = 0; i < 24 * 12 && isQuiet(new Date(t), q); i++) t -= STEP;
  return new Date(t);
}

export type ChasePlan = { at: Date; free: boolean };

/**
 * When to chase: `hours` after our message, moved out of quiet hours. If that would miss the
 * free window and `keepFree` is on, chase shortly before the window closes instead, as long as
 * that's still a decent gap after our message (the smaller of `hours` and 4h).
 */
export function planChase(opts: {
  sentAt: Date;
  hours: number;
  lastInboundAt: string | null;
  settings: QuietHours;
  keepFree: boolean;
  rand?: () => number;
}): ChasePlan {
  const { sentAt, hours, settings: s, keepFree, rand } = opts;
  const target = nextAwake(new Date(sentAt.getTime() + hours * HOUR), s, { rand });
  const close = opts.lastInboundAt ? new Date(opts.lastInboundAt).getTime() + WINDOW_MS : null;
  const margin = 20 * MIN;
  if (close && target.getTime() < close - margin) return { at: target, free: true };
  if (keepFree && close) {
    const cand = lastAwake(new Date(close - HOUR), s);
    const minGap = Math.min(hours, 4) * HOUR;
    if (cand.getTime() >= sentAt.getTime() + minGap && cand.getTime() < close - margin) return { at: cand, free: true };
  }
  return { at: target, free: false };
}
