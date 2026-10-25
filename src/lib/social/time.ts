/** Time helpers for quiet hours, in UK time (Europe/London, so clock changes are handled). */

export type QuietHours = { start: string; end: string };

function ukMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h % 24) * 60 + (m || 0);
};

/** True when `d` falls inside quiet hours (which may run across midnight, like 21:00 to 07:30). */
export function inQuietHours(d: Date, q: QuietHours): boolean {
  const now = ukMinutes(d);
  const s = toMin(q.start);
  const e = toMin(q.end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** When quiet hours next end, to the minute. */
export function quietEnds(d: Date, q: QuietHours): Date {
  const t = new Date(Math.floor(d.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 24 * 60 + 1 && inQuietHours(t, q); i++) t.setTime(t.getTime() + 60_000);
  return t;
}
