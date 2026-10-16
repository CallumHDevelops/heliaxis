/**
 * When automatic messages go out: quiet hours (UK time) and keeping chasers inside the free
 * 24-hour window. Pure (no I/O) so it's safe anywhere and easy to check.
 */
import { SERVICE_WINDOW_MS } from './shared';

const STEP = 5 * 60_000;
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' });

export function londonHour(d: Date): number {
  return Number(hourFmt.format(d)) % 24;
}

/** Quiet from `from`:00 to `to`:00 UK time, e.g. 21 → 8. Equal values = never quiet. */
export function isQuiet(d: Date, from: number, to: number): boolean {
  if (from === to) return false;
  const h = londonHour(d);
  return from > to ? h >= from || h < to : h >= from && h < to;
}

/** The first time at or after `d` outside quiet hours, plus a little jitter if it had to move. */
export function nextAwake(d: Date, from: number, to: number, rand = Math.random): Date {
  let t = d.getTime();
  let moved = false;
  for (let i = 0; i < 24 * 12 && isQuiet(new Date(t), from, to); i++) {
    t += STEP;
    moved = true;
  }
  return new Date(moved ? t + Math.round(rand() * 20) * 60_000 : t);
}

/** The last time at or before `d` outside quiet hours. */
export function lastAwake(d: Date, from: number, to: number): Date {
  let t = d.getTime();
  for (let i = 0; i < 24 * 12 && isQuiet(new Date(t), from, to); i++) t -= STEP;
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
  quietFrom: number;
  quietTo: number;
  keepFree: boolean;
  rand?: () => number;
}): ChasePlan {
  const { sentAt, hours, quietFrom, quietTo, keepFree, rand } = opts;
  const target = nextAwake(new Date(sentAt.getTime() + hours * 3_600_000), quietFrom, quietTo, rand);
  const close = opts.lastInboundAt ? new Date(opts.lastInboundAt).getTime() + SERVICE_WINDOW_MS : null;
  const margin = 20 * 60_000;
  if (close && target.getTime() < close - margin) return { at: target, free: true };
  if (keepFree && close) {
    const cand = lastAwake(new Date(close - 60 * 60_000), quietFrom, quietTo);
    const minGap = Math.min(hours, 4) * 3_600_000;
    if (cand.getTime() >= sentAt.getTime() + minGap && cand.getTime() < close - margin) return { at: cand, free: true };
  }
  return { at: target, free: false };
}
