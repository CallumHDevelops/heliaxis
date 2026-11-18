import { londonSlot } from '@/lib/booking/engine';

/** Free quarter-hours in a day for a short call: pure, so it can be tested. `busy` are the diary's items (epoch ms). */
export type Busy = { start: number; end: number };

export const WINDOWS: Record<string, [string, string]> = {
  morning: ['09:00', '12:00'],
  lunchtime: ['12:00', '14:00'],
  afternoon: ['13:00', '17:00'],
  evening: ['17:30', '19:00'],
  day: ['09:00', '17:30'],
};

/**
 * Up to `count` times on `ymd` within `window` when the diary is free for `minutes` (plus a 5 minute breather either side), on the
 * half hour, not before `after`, and at least `spacing` minutes apart so the options are really different.
 */
export function freeStarts(busy: Busy[], ymd: string, window: [string, string], after: number, o: { count?: number; minutes?: number; spacing?: number } = {}): number[] {
  const count = o.count ?? 3;
  const mins = o.minutes ?? 15;
  const spacing = (o.spacing ?? 60) * 60_000;
  const from = londonSlot(ymd, window[0]);
  const to = londonSlot(ymd, window[1]);
  const out: number[] = [];
  for (let t = from; t + mins * 60_000 <= to; t += 30 * 60_000) {
    if (t < after) continue;
    const clash = busy.some((b) => b.start < t + (mins + 5) * 60_000 && b.end > t - 5 * 60_000);
    if (clash) continue;
    if (out.length && t - out[out.length - 1] < spacing) continue;
    out.push(t);
    if (out.length >= count) break;
  }
  return out;
}

/** "10:00, 11:30 or 12:00". */
export const listTimes = (times: string[]) => (times.length <= 1 ? (times[0] ?? '') : `${times.slice(0, -1).join(', ')} or ${times[times.length - 1]}`);
