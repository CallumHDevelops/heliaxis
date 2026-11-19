/**
 * What the growth dispatcher should have queued by now (spec §7), in UK time. Pure, so it can be tested: each job's
 * dedupe key makes queuing it twice harmless, so the dispatcher simply asks every 10 minutes.
 */

export type Planned = { kind: string; dedupeKey: string; payload: Record<string, unknown> };

export type UkClock = { date: string; dow: number; hour: number; minute: number; dom: number; month: string };

export function ukClock(d = new Date()): UkClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date, dow, hour: Number(parts.hour) % 24, minute: Number(parts.minute), dom: Number(parts.day), month: date.slice(0, 7) };
}

/** First Tuesday of the month? */
const firstTuesday = (c: UkClock) => c.dow === 2 && c.dom <= 7;

export function plannedJobs(now = new Date()): Planned[] {
  const c = ukClock(now);
  const at = (h: number, m = 0) => c.hour > h || (c.hour === h && c.minute >= m);
  const out: Planned[] = [];
  // Weekly phone SERPs: posted Sunday 23:00, results by Monday 06:00.
  if (c.dow === 0 && at(23)) out.push({ kind: 'serp_post', dedupeKey: `serp_post:mobile:${c.date}`, payload: { device: 'mobile', kind: 'weekly' } });
  // Monthly desktop SERPs on the 1st.
  if (c.dom === 1 && at(1)) out.push({ kind: 'serp_post', dedupeKey: `serp_post:desktop:${c.month}`, payload: { device: 'desktop', kind: 'monthly' } });
  // Search Console, daily 05:00 (re-pulls the last 4 days, since Google's data lags 2 to 3).
  if (at(5)) out.push({ kind: 'gsc_import', dedupeKey: `gsc_import:${c.date}`, payload: { date: c.date } });
  // The existing site audit and meta proposals, Monday 05:00.
  if (c.dow === 1 && at(5)) out.push({ kind: 'site_audit', dedupeKey: `site_audit:${c.date}`, payload: {} });
  // Every keyword we rank for (Labs), Monday 06:30.
  if (c.dow === 1 && at(6, 30)) out.push({ kind: 'ranked_keywords', dedupeKey: `ranked_keywords:${c.date}`, payload: {} });
  // Needs you: the setup checklist, daily 06:00.
  if (at(6)) out.push({ kind: 'setup_check', dedupeKey: `setup_check:${c.date}`, payload: {} });
  // Weekly report: provisional Monday 07:00, final Wednesday 07:00 (once Search Console has Sunday).
  if (c.dow === 1 && at(7)) out.push({ kind: 'weekly_report', dedupeKey: `weekly_report:provisional:${c.date}`, payload: { status: 'provisional' } });
  if (c.dow === 3 && at(7)) out.push({ kind: 'weekly_report', dedupeKey: `weekly_report:final:${c.date}`, payload: { status: 'final' } });
  // Monthly Growth Report, first Tuesday 08:00.
  if (firstTuesday(c) && at(8)) out.push({ kind: 'monthly_report', dedupeKey: `monthly_report:${c.month}`, payload: {} });
  return out;
}

/** Monday of the week (Mon to Sun, UK) a date falls in, and the Sunday that ends it. */
export function weekOf(date: string): { start: string; end: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(d.getTime() - dow * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export const addDays = (date: string, n: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
