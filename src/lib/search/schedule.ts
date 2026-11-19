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

  // ── Phases 2 to 4 ──
  // M7: health checks after the Monday audit; the key pages through URL Inspection daily.
  if (c.dow === 1 && at(5, 30)) out.push({ kind: 'health_checks', dedupeKey: `health_checks:${c.date}`, payload: {} });
  if (at(6, 15)) out.push({ kind: 'index_checks', dedupeKey: `index_checks:${c.date}`, payload: {} });
  // M5: Business Profile metrics daily 05:30; the map grid on the 2nd.
  if (at(5, 30)) out.push({ kind: 'gbp_import', dedupeKey: `gbp_import:${c.date}`, payload: {} });
  if (c.dom === 2 && at(2)) out.push({ kind: 'grid_start', dedupeKey: `grid_start:${c.month}`, payload: {} });
  // M2: teardown write-ups Monday 07:00 (page facts are queued when each phone run closes), business profiles 07:30.
  if (c.dow === 1 && at(7)) out.push({ kind: 'teardowns', dedupeKey: `teardowns:${c.date}`, payload: {} });
  if (c.dow === 1 && at(7, 30)) out.push({ kind: 'business_profiles', dedupeKey: `business_profiles:${c.date}`, payload: {} });
  // M3: opportunity scoring Monday 08:00; keyword research on the 1st, after the desktop run is posted.
  if (c.dow === 1 && at(8)) out.push({ kind: 'opportunity_scoring', dedupeKey: `opportunity_scoring:${c.date}`, payload: {} });
  if (c.dom === 1 && at(2)) out.push({ kind: 'keyword_research', dedupeKey: `keyword_research:${c.month}`, payload: {} });
  // M4: content measures daily (pages at day 14, 28, 56 and 90).
  if (at(9)) out.push({ kind: 'content_measures', dedupeKey: `content_measures:${c.date}`, payload: {} });
  // M6: AI-answer sampling on the 3rd.
  if (c.dom === 3 && at(3)) out.push({ kind: 'ai_sample_start', dedupeKey: `ai:${c.month}`, payload: {} });
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
