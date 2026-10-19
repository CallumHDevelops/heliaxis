/**
 * Working days for installs and deadlines: England & Wales bank holidays (gov.uk) and pure date
 * helpers on 'YYYY-MM-DD' strings. Days are counted with Y-M-D arithmetic, never by adding
 * 86,400,000 ms, so the clocks changing can't shift them.
 *
 * Only type imports at the top: scripts/test-dates.mjs loads this file straight into node. The
 * database fallback in ukBankHolidays() is imported when it's needed, on the server.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Noon UTC on that date, so weekday maths never meets a clock change. */
function noon(ymd: string): Date {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => {
  const d = noon(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdOf(d);
};

/** The UK date ('YYYY-MM-DD', Europe/London) of a moment. */
export function ukDay(at: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Monday to Friday and not a bank holiday. */
export function isWorkingDay(ymd: string, hols: ReadonlySet<string>): boolean {
  const wd = noon(ymd).getUTCDay();
  return wd !== 0 && wd !== 6 && !hols.has(ymd);
}

/** n working days after ymd (before it when n is negative). 0 = the same date. */
export function addWorkingDays(ymd: string, n: number, hols: ReadonlySet<string>): string {
  const step = n < 0 ? -1 : 1;
  let d = ymd;
  for (let left = Math.abs(Math.trunc(n)); left > 0; ) {
    d = addDays(d, step);
    if (isWorkingDay(d, hols)) left--;
  }
  return d;
}

/**
 * The dates an install of `days` working days covers. Day 1 is the start date whatever it is (a
 * Saturday start is a Saturday); each further day is the next Monday–Friday that isn't a bank holiday.
 */
export function installDayList(startYmd: string, days: number, hols: ReadonlySet<string>): string[] {
  const n = Math.min(60, Math.max(1, Math.trunc(Number(days) || 1)));
  const out = [startYmd];
  while (out.length < n) out.push(addWorkingDays(out[out.length - 1], 1, hols));
  return out;
}

/** Consecutive dates grouped into runs (one Outlook all-day event per run). toExclusive is the day after the run. */
export function dayRuns(days: string[]): { from: string; toExclusive: string }[] {
  const sorted = [...new Set(days)].sort();
  const runs: { from: string; toExclusive: string }[] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.toExclusive === d) last.toExclusive = addDays(d, 1);
    else runs.push({ from: d, toExclusive: addDays(d, 1) });
  }
  return runs;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Fri 6, Mon 9 and Tue 10 November" (the month after the last day in it: "Fri 30 October and Mon 2 November"). */
export function dayListWords(days: string[]): string {
  const sorted = [...new Set(days)].sort();
  const words = sorted.map((ymd, i) => {
    const d = noon(ymd);
    const next = sorted[i + 1];
    const monthEnds = !next || next.slice(0, 7) !== ymd.slice(0, 7);
    return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}${monthEnds ? ` ${MONTH[d.getUTCMonth()]}` : ''}`;
  });
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] ?? '');
}

/* ── England & Wales bank holidays ───────────────────────────────────────────── */

const GOV_UK = 'https://www.gov.uk/bank-holidays.json';
const KV_KEY = 'uk-bank-holidays';
const DAY_MS = 24 * 60 * 60 * 1000;
let memo: { at: number; ttl: number; days: Set<string> } | null = null;

type GovUk = { 'england-and-wales'?: { events?: { date?: unknown }[] } };

/** The stored copy in cms_kv (server only; empty if it can't be read). */
async function readStored(): Promise<string[]> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KV_KEY).maybeSingle();
    const v: unknown = data?.value ? JSON.parse(data.value) : [];
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string' && YMD.test(d)) : [];
  } catch {
    return [];
  }
}

async function store(days: string[]) {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    await createAdminClient()
      .from('cms_kv')
      .upsert({ key: KV_KEY, value: JSON.stringify(days), updated_at: new Date().toISOString() });
  } catch {
    // Only a fallback copy: the next good fetch saves it again.
  }
}

/**
 * England & Wales bank holidays from gov.uk, kept in memory for a day. If gov.uk can't be reached,
 * the last copy saved in cms_kv; if neither works, none (never throws).
 */
export async function ukBankHolidays(): Promise<Set<string>> {
  if (memo && Date.now() - memo.at < memo.ttl) return memo.days;
  let days: string[] = [];
  let fresh = false;
  try {
    const r = await fetch(GOV_UK, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = (await r.json()) as GovUk;
      days = (j['england-and-wales']?.events ?? [])
        .map((e) => e.date)
        .filter((d): d is string => typeof d === 'string' && YMD.test(d));
      fresh = days.length > 0;
    }
  } catch {
    // Offline or slow: fall back below.
  }
  if (fresh) await store(days);
  else days = await readStored();
  // A failed fetch is tried again in an hour rather than a day.
  memo = { at: Date.now(), ttl: fresh ? DAY_MS : DAY_MS / 24, days: new Set(days) };
  return memo.days;
}
