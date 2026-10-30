/** The installation dates a customer can ask for in their portal. Pure: used by the page and the API. */

export const MIN_LEAD_DAYS = 14;
export const MAX_AHEAD_DAYS = 180;
export const MAX_CHOICES = 3;

export type InstallPref = { dates: string[]; flexible: boolean; notes: string; at: string; /** Chosen from the availability calendar: a provisional booking the office confirms. */ provisional?: boolean };

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export const earliestInstall = (today: string) => addDays(today, MIN_LEAD_DAYS);
export const latestInstall = (today: string) => addDays(today, MAX_AHEAD_DAYS);

/** Why a date can't be asked for, or null if it can: weekdays only, no bank holidays, 2 weeks to 6 months ahead. */
export function dateProblem(day: string, today: string, hols: ReadonlySet<string>): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) return 'That isn’t a date.';
  const wd = weekday(day);
  if (wd === 0 || wd === 6) return 'We install Monday to Friday. Please pick a weekday.';
  if (hols.has(day)) return 'That is a bank holiday. Please pick another day.';
  if (day < earliestInstall(today)) return `We need at least ${MIN_LEAD_DAYS} days to prepare. Please pick a later date.`;
  if (day > latestInstall(today)) return 'Please pick a date within the next six months.';
  return null;
}

export function cleanPref(v: unknown, today: string, hols: ReadonlySet<string>): { ok: true; pref: Omit<InstallPref, 'at'> } | { ok: false; error: string } {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const dates = [...new Set((Array.isArray(o.dates) ? o.dates : []).map((d) => String(d)).filter(Boolean))].slice(0, MAX_CHOICES);
  if (!dates.length) return { ok: false, error: 'Pick at least one date.' };
  for (const d of dates) {
    const p = dateProblem(d, today, hols);
    if (p) return { ok: false, error: p };
  }
  return { ok: true, pref: { dates: dates.sort(), flexible: o.flexible === true, notes: String(o.notes ?? '').trim().slice(0, 500) } };
}

/** How many installations can run on the same day. */
export const INSTALL_CAPACITY = 2;
/** The calendar a customer is shown: three weeks at a time. */
export const WINDOW_DAYS = 21;

export type DayState = 'free' | 'few' | 'full' | 'closed';
export type CalendarDay = { day: string; weekend: boolean; state: DayState };

/**
 * Three weeks of dates from `from` (never before the earliest date we can prepare for), each marked free, nearly full, full or
 * closed (weekend, bank holiday, a closed date). `load` is how many installations are already on each day, provisional holds included.
 */
export function installCalendar(today: string, from: string | null, hols: ReadonlySet<string>, closed: ReadonlySet<string>, load: ReadonlyMap<string, number>): { days: CalendarDay[]; from: string; prev: string | null; next: string | null } {
  const earliest = earliestInstall(today);
  const latest = latestInstall(today);
  let start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && from > earliest ? from : earliest;
  if (start > latest) start = earliest;
  // Weeks start on a Monday, so a window never begins mid-week with a ragged first row.
  while (weekday(start) !== 1) start = addDays(start, -1);
  const days: CalendarDay[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = addDays(start, i);
    const weekend = weekday(day) === 0 || weekday(day) === 6;
    const n = load.get(day) ?? 0;
    const state: DayState = weekend || hols.has(day) || closed.has(day) || day < earliest || day > latest ? 'closed' : n >= INSTALL_CAPACITY ? 'full' : n >= INSTALL_CAPACITY - 1 && INSTALL_CAPACITY > 1 ? 'few' : 'free';
    days.push({ day, weekend, state });
  }
  const prev = addDays(start, -WINDOW_DAYS);
  const next = addDays(start, WINDOW_DAYS);
  return { days, from: start, prev: addDays(start, -1) >= earliest ? (prev > earliest ? prev : earliest) : null, next: next <= latest ? next : null };
}
