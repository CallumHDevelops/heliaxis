import { CHANNEL_LABEL } from '../channel';
import { unknownNumbers, type Delta } from '../maths';
import type { Overview, PeriodKey, Tile } from '../metrics';

/**
 * Reports beside the weekly one (spec §10.3): the monthly Growth Report, custom reports, and the tables every output shares
 * (screen, PDF, email, CSV), so the four can never disagree. Pure: the words come only from the snapshot, and
 * reportTextProblems() rejects any number in them that isn't in it.
 */

export type ReportKind = 'weekly' | 'monthly' | 'custom';
export const SECTIONS = [
  { key: 'measures', label: 'Measures' },
  { key: 'movers', label: 'Winners and losers' },
  { key: 'leads', label: 'Leads by channel' },
  { key: 'content', label: 'Pages published' },
  { key: 'health', label: 'Site health' },
] as const;
export type Section = (typeof SECTIONS)[number]['key'];
export const ALL_SECTIONS: Section[] = SECTIONS.map((s) => s.key);

export type CustomView = {
  periodKey: PeriodKey | 'custom';
  start?: string;
  end?: string;
  compare: 'previous' | 'year';
  sections: Section[];
  tier?: number | null;
  service?: string | null;
};

export type ContentShipped = { published: { title: string; slug: string; publishedAt: string }[]; inReview: number };
export type HealthLine = { check: string; label: string; date: string; checked: number; problems: number };

export type StoredNumbers = Pick<Overview, 'tiles' | 'winners' | 'losers' | 'leads' | 'freshness' | 'rankRunDates'> & {
  fourWeek?: Record<string, number | null>;
  /** Tile key → this period against the same period a year before (once a year of data exists). */
  yearAgo?: Record<string, Delta> | null;
  yearAgoPeriod?: { start: string; end: string } | null;
  content?: ContentShipped | null;
  health?: HealthLine[] | null;
  view?: CustomView | null;
  sections?: Section[];
};

export type ReportRow = {
  id: number;
  kind: ReportKind;
  name: string | null;
  period_start: string;
  period_end: string;
  compare_start: string | null;
  compare_end: string | null;
  status: 'provisional' | 'final';
  numbers: StoredNumbers;
  text: { headline?: string[]; actions?: string[] };
  created_at: string;
  sent_at?: string | null;
};

/* ── Dates ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

export const addDaysIso = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function addMonthsIso(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  // Clamp to the month's last day (31 Mar − 1 month = 28 or 29 Feb).
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last), 12)).toISOString().slice(0, 10);
}

const monthEnd = (start: string) => addDaysIso(addMonthsIso(start, 1), -1);

/** The month that has just ended (by `today`, UK), the month before it, and the same month a year earlier. */
export function monthPeriods(today: string) {
  const thisMonth = `${today.slice(0, 7)}-01`;
  const start = addMonthsIso(thisMonth, -1);
  const prev = addMonthsIso(start, -1);
  const yStart = addMonthsIso(start, -12);
  return {
    period: { start, end: monthEnd(start), compareStart: prev, compareEnd: monthEnd(prev), label: monthLabel(start) },
    yearAgo: { start: yStart, end: monthEnd(yStart) },
  };
}

/** UK midnight at the start of a date, as an ISO instant (enquiries are counted by UK day, as on the Overview). */
export function ukMidnight(date: string): string {
  const noon = new Date(`${date}T12:00:00Z`);
  const ukNoon = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(noon));
  return new Date(Date.parse(`${date}T00:00:00Z`) - (ukNoon - 12) * 3_600_000).toISOString();
}

/** The comparison for any period: the same number of days just before, or the same dates a year earlier. */
export function comparisonFor(start: string, end: string, compare: 'previous' | 'year'): { compareStart: string; compareEnd: string } {
  if (compare === 'year') return { compareStart: addMonthsIso(start, -12), compareEnd: addMonthsIso(end, -12) };
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return { compareStart: addDaysIso(start, -days), compareEnd: addDaysIso(start, -1) };
}

/** A monthly report is final once Search Console has the month's last day (it lags 2 to 3 days). */
export const monthlyStatus = (periodEnd: string, today: string): 'provisional' | 'final' => (today >= addDaysIso(periodEnd, 4) ? 'final' : 'provisional');

export const monthLabel = (start: string) => new Date(`${start}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = (d: string, year = true) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
export const rangeLabel = (a: string | null | undefined, b: string | null | undefined) => (a && b ? `${dayLabel(a, a.slice(0, 4) !== b.slice(0, 4))} to ${dayLabel(b)}` : '–');

export function reportTitle(r: Pick<ReportRow, 'kind' | 'name' | 'period_start' | 'period_end'>): string {
  if (r.kind === 'weekly') return `Weekly report, ${rangeLabel(r.period_start, r.period_end)}`;
  if (r.kind === 'monthly') return `Growth Report, ${monthLabel(r.period_start)}`;
  return r.name || `Custom report, ${rangeLabel(r.period_start, r.period_end)}`;
}

/** What "now" and "before" are called in a report's words and columns. */
export function periodWords(kind: ReportKind, compare: 'previous' | 'year' = 'previous') {
  if (kind === 'weekly') return { now: 'this week', before: 'the week before', nowCol: 'This week', beforeCol: 'Last week', unit: 'week' };
  if (kind === 'monthly') return { now: 'this month', before: 'the month before', nowCol: 'This month', beforeCol: 'Last month', unit: 'month' };
  return compare === 'year'
    ? { now: 'in this period', before: 'a year earlier', nowCol: 'This period', beforeCol: 'A year earlier', unit: 'period' }
    : { now: 'in this period', before: 'in the period before', nowCol: 'This period', beforeCol: 'Period before', unit: 'period' };
}

/* ── Words ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? 'no data' : `${Math.round(n * 10) / 10}`);

/** Plain sentences from the numbers alone (no model, so nothing can be invented). */
export function periodHeadline(n: Pick<StoredNumbers, 'tiles' | 'winners' | 'yearAgo' | 'content'>, w: ReturnType<typeof periodWords>): string[] {
  const t = Object.fromEntries(n.tiles.map((x) => [x.key, x]));
  const out: string[] = [];
  const org = t.organic_enquiries?.delta;
  const yy = n.yearAgo?.organic_enquiries;
  out.push(
    org && org.now !== null
      ? `Organic enquiries: ${fmt(org.now)} ${w.now} against ${fmt(org.before)} ${w.before}${yy && yy.before !== null ? `, and ${fmt(yy.before)} in the same ${w.unit} last year` : ''}.`
      : `No organic enquiries were recorded ${w.now}.`,
  );
  const top = t.top3?.delta;
  out.push(top && top.now !== null ? `${fmt(top.now)} tracked searches are in Google’s top 3 (${fmt(top.before)} at the run before), and visibility is ${fmt(t.visibility?.delta.now)} out of 100.` : `There is no rankings run ${w.now} yet.`);
  const clicks = t.clicks?.delta;
  out.push(
    clicks && clicks.now !== null
      ? `Search Console shows ${fmt(clicks.now)} clicks from ${fmt(t.impressions?.delta.now)} impressions, at an average position of ${fmt(t.avg_position?.delta.now)}.`
      : n.winners.length
        ? `The biggest rise was “${n.winners[0].label}”, up ${n.winners[0].moved} places.`
        : 'Search Console is not connected yet, so clicks and impressions are not shown.',
  );
  const shipped = n.content?.published.length ?? 0;
  if (shipped) out.push(`${shipped} new page${shipped === 1 ? ' was' : 's were'} published ${w.now}.`);
  return out;
}

/** Every number the words may use: the snapshot's own. */
export function allowedNumbers(n: Pick<StoredNumbers, 'tiles' | 'winners' | 'losers' | 'leads' | 'yearAgo' | 'content'>): number[] {
  const out: number[] = [3, 100]; // "top 3", "out of 100"
  const d = (x: Delta | undefined | null) => (x ? [x.now, x.before, x.abs, x.pct].filter((v): v is number => v !== null) : []);
  for (const t of n.tiles) out.push(...d(t.delta));
  for (const k of Object.keys(n.yearAgo ?? {})) out.push(...d(n.yearAgo![k]));
  for (const m of [...n.winners, ...n.losers]) out.push(m.moved, Math.abs(m.moved), ...(m.now !== null ? [m.now] : []), ...(m.before !== null ? [m.before] : []));
  for (const l of n.leads) out.push(l.now, l.before);
  if (n.content) out.push(n.content.published.length, n.content.inReview);
  return out;
}

/** The numbers in a report's words that aren't in its snapshot (must be empty to save). */
export const reportTextProblems = (lines: string[], n: Parameters<typeof allowedNumbers>[0]) => unknownNumbers(lines.join(' '), allowedNumbers(n));

/* ── Tables (screen, PDF, email and CSV) ─────────────────────────────────────────────────────────────────────────── */

export type Table = { key: Section; title: string; source: string; columns: string[]; rows: string[][] };

export const num = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? '–' : v.toLocaleString('en-GB', { maximumFractionDigits: digits }));
const signed = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '–' : `${v > 0 ? '+' : ''}${num(v)}${unit}`);
export const channelLabel = (c: string) => (c === 'untracked' ? 'Before tracking began' : (CHANNEL_LABEL as Record<string, string>)[c] ?? c);

export function reportTables(r: Pick<ReportRow, 'kind' | 'numbers'>): Table[] {
  const n = r.numbers;
  const w = periodWords(r.kind, n.view?.compare);
  const want = new Set<Section>(n.sections?.length ? n.sections : ALL_SECTIONS);
  const out: Table[] = [];
  const third = r.kind === 'weekly' || (!n.yearAgo && n.fourWeek && Object.keys(n.fourWeek).length) ? '4-week average' : n.yearAgo ? `Same ${w.unit} last year` : null;
  if (want.has('measures')) {
    out.push({
      key: 'measures',
      title: 'Measures',
      source: 'Each row names its own source.',
      columns: ['Measure', 'Source', w.nowCol, w.beforeCol, 'Change', 'Change %', ...(third ? [third] : [])],
      rows: n.tiles.map((t: Tile) => [
        t.label,
        t.note ? `${t.source} (${t.note})` : t.source,
        num(t.delta.now),
        num(t.delta.before),
        signed(t.delta.abs),
        t.delta.small ? 'small numbers' : signed(t.delta.pct, '%'),
        ...(third ? [third === '4-week average' ? num(n.fourWeek?.[t.key]) : num(n.yearAgo?.[t.key]?.before)] : []),
      ]),
    });
  }
  if (want.has('movers')) {
    out.push({
      key: 'movers',
      title: 'Winners and losers',
      source: `Tracked searches: the rankings run of ${n.rankRunDates?.now ?? 'none'} against ${n.rankRunDates?.before ?? 'none'} (out of the top 100 counts as 101).`,
      columns: ['Search', 'Before', 'Now', 'Places moved'],
      rows: [...n.winners, ...n.losers].map((m) => [m.label, m.before === null ? 'not in top 100' : String(m.before), m.now === null ? 'not in top 100' : String(m.now), signed(m.moved)]),
    });
  }
  if (want.has('leads')) {
    out.push({
      key: 'leads',
      title: 'Leads by channel',
      source: 'Enquiries in HAP, counted by the date received (UK time).',
      columns: ['Channel', w.nowCol, w.beforeCol],
      rows: n.leads.map((l) => [channelLabel(l.channel), String(l.now), String(l.before)]),
    });
  }
  if (want.has('content') && n.content) {
    out.push({
      key: 'content',
      title: 'Pages published',
      source: `Content studio: pages published in the period; ${n.content.inReview} waiting for approval when the report was built.`,
      columns: ['Page', 'Address', 'Published'],
      rows: n.content.published.map((p) => [p.title, p.slug, p.publishedAt.slice(0, 10)]),
    });
  }
  if (want.has('health') && n.health) {
    out.push({
      key: 'health',
      title: 'Site health',
      source: 'Site health checks: the latest run of each check when the report was built.',
      columns: ['Check', 'Checked', 'Problems', 'Checked on'],
      rows: n.health.map((h) => [h.label, String(h.checked), String(h.problems), h.date]),
    });
  }
  return out;
}

/** A CSV cell, quoted when needed; text that a spreadsheet would run as a formula is prefixed with ' (signed numbers are left alone). */
const cell = (raw: string) => {
  const s = /^[=+\-@\t\r]/.test(raw) && !/^[+-]?[\d.,]+%?$/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every table as CSV: a title line, the source, the heading row and the rows, with a blank line between tables. */
export function toCsv(tables: Table[]): string {
  const lines: string[] = [];
  for (const t of tables) {
    if (lines.length) lines.push('');
    lines.push(cell(t.title), cell(`Source: ${t.source}`), t.columns.map(cell).join(','));
    for (const r of t.rows) lines.push(r.map(cell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
