/** The installation dates a customer can ask for in their portal. Pure: used by the page and the API. */

export const MIN_LEAD_DAYS = 14;
export const MAX_AHEAD_DAYS = 180;
export const MAX_CHOICES = 3;

export type InstallPref = { dates: string[]; flexible: boolean; notes: string; at: string };

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
