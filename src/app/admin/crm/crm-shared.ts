/**
 * Helpers shared by the CRM home, Board and List and the Projects pages: UK dates and times worked out
 * from a `now` the component was given (components can't read the clock while rendering), short money,
 * initials, the stage colours and the pipeline filters. Safe for the browser.
 */
import type { PipelineProject } from '@/lib/projects/server';
import { isProjectStage, SALES_STAGES, stageLabel } from '@/lib/crm/stages';
import { plusDays } from '@/lib/projects/feed';
import { looksLikeRef, refMatches, refOnly } from '@/lib/projects/refs';
import { everyWord, hasText } from '@/lib/search-words';

export type { PipelineProject };

/* ── UK dates and times ──────────────────────────────────────────────────────── */

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(at: string | number | Date) {
  const p = PARTS.formatToParts(new Date(at));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hm: `${get('hour')}:${get('minute')}` };
}

/** The UK date ('YYYY-MM-DD') of a moment. */
export const ukDayOf = (at: string | number | Date) => parts(at).ymd;
/** The UK time of day ('09:30'). */
export const ukTime = (at: string | number | Date) => parts(at).hm;

const noon = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};
/** 'Mon 12 Oct' for a UK date. */
export function shortDate(ymd: string): string {
  const d = noon(ymd);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}
export const weekdayOf = (ymd: string) => WEEKDAY[noon(ymd).getUTCDay()];
/** 0 = Monday … 6 = Sunday. */
export const mondayIndex = (ymd: string) => (noon(ymd).getUTCDay() + 6) % 7;

/** 'Today', 'Yesterday', 'Tomorrow', or 'Mon 12 Oct'. */
export function dayLabel(ymd: string, today: string): string {
  if (ymd === today) return 'Today';
  if (ymd === plusDays(today, -1)) return 'Yesterday';
  if (ymd === plusDays(today, 1)) return 'Tomorrow';
  return shortDate(ymd);
}

/** A due date in a task row: 'Today', 'Tomorrow', 'Fri' (this week), 'Thu 15 Oct'. */
export function dueWords(ymd: string, today: string): string {
  if (ymd === today) return 'Today';
  if (ymd === plusDays(today, 1)) return 'Tomorrow';
  if (ymd === plusDays(today, -1)) return 'Yesterday';
  if (ymd > today && ymd <= plusDays(today, 6)) return weekdayOf(ymd);
  return shortDate(ymd);
}

/** How long ago, for chat and feed rows: '2m', '3h', 'Yesterday', 'Mon', '12 Oct'. `now` 0 = not known yet. */
export function agoShort(at: string, now: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  if (!now) return ukTime(t);
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  if (min < 12 * 60) return `${Math.floor(min / 60)}h`;
  const day = ukDayOf(t);
  const today = ukDayOf(now);
  if (day === today) return ukTime(t);
  if (day === plusDays(today, -1)) return 'Yesterday';
  if (day > plusDays(today, -7)) return weekdayOf(day);
  const d = noon(day);
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** The moment it's `hm` ('09:00') in the UK on `ymd`, as an ISO time. */
export function londonIso(ymd: string, hm: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = parts(guess);
  const [py, pm, pd] = p.ymd.split('-').map(Number);
  const [ph, pmi] = p.hm.split(':').map(Number);
  const offset = Date.UTC(py, pm - 1, pd, ph, pmi) - guess;
  return new Date(guess - offset).toISOString();
}

/** The next weekday from `today` (5 = Friday), 'YYYY-MM-DD'. Today itself if it is one. */
export function nextWeekday(today: string, weekday: number): string {
  for (let i = 0; i < 7; i++) {
    const d = plusDays(today, i);
    if (noon(d).getUTCDay() === weekday) return d;
  }
  return today;
}

/* ── Words and numbers ───────────────────────────────────────────────────────── */

/** £48k, £31.2k, £950. */
export function moneyShort(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '£0';
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (v >= 1000) {
    const k = v / 1000;
    return `£${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `£${Math.round(v)}`;
}

export function initials(name: string | null | undefined): string {
  const w = (name || '').split('@')[0].split(/[\s._-]+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '?';
}

export const firstName = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || '';

const SHORT: Record<string, string> = { solar: 'Solar', battery: 'Battery', heatpump: 'Heat pump', ev: 'EV charger', infrared: 'Infrared', led: 'LED', other: 'Other' };
/** 'Solar + battery' (the default job title starts with this). */
export function productsShort(products: string[]): string {
  const words = products.map((p) => SHORT[p] ?? p).filter(Boolean);
  return words.map((w, i) => (i ? w.toLowerCase().replace(/^ev/, 'EV').replace(/^led/, 'LED') : w)).join(' + ');
}

/** The stage's colour group: early sales yellow, survey and quote blue, delivery green, done. */
export function phaseOf(stage: string): 'y' | 'b' | 'g' | 'done' | 'lost' {
  if (stage === 'lead' || stage === 'contacted') return 'y';
  if (stage === 'survey_booked' || stage === 'surveyed' || stage === 'quote_sent') return 'b';
  if (stage === 'complete') return 'done';
  if (stage === 'lost') return 'lost';
  return 'g';
}

export { stageLabel };

/**
 * What a card calls a job: the customer, plus the job's own name when they have more than one (a
 * title that only repeats their name and postcode adds nothing, so it's left off).
 */
export function jobLabel(p: { customer?: string | null; title?: string | null; postcode?: string | null; customer_projects?: number }): string {
  const c = (p.customer || '').trim();
  const t = (p.title || '').trim();
  if (!c) return t;
  if ((p.customer_projects ?? 1) <= 1) return c;
  const rest = t.toLowerCase().startsWith(c.toLowerCase()) ? t.slice(c.length).replace(/^\s*·\s*/, '') : t;
  return !rest || rest === (p.postcode || '').trim() ? c : `${c} · ${rest}`;
}

/* ── The pipeline: what counts as live, due, quiet ───────────────────────────── */

export const isSales = (stage: string) => (SALES_STAGES as string[]).includes(stage);
export const isLive = (p: { stage: string }) => p.stage !== 'complete' && p.stage !== 'lost';
/** Won in the last 30 days (the Board's last column). */
export const wonRecently = (p: PipelineProject, now: number) =>
  isProjectStage(p.stage) && !!now && now - Date.parse(p.project_started_at || p.stage_changed_at) <= 30 * 86_400_000;

/** The next step or task is due by the end of today (UK). */
export function isDue(p: PipelineProject, today: string): boolean {
  if (!isLive(p)) return false;
  if (p.next_step && p.next_step_at) return ukDayOf(p.next_step_at) <= today;
  return !!p.next_task?.due_date && p.next_task.due_date <= today;
}
export const hasNoNextStep = (p: PipelineProject) => isLive(p) && !p.next_step && !p.next_task;
/** A lead nobody has called, messaged or emailed yet. */
export const notContacted = (p: PipelineProject) => p.stage === 'lead' && !p.first_contact_at;
export const quietDays = (p: PipelineProject, now: number) => (now ? Math.floor((now - Date.parse(p.updated_at)) / 86_400_000) : 0);

/** Phone digits only, with a UK 0 for +44 ('+44 7700 900123' → '07700900123'). */
export function phoneDigits(s: string | null | undefined): string {
  const d = (s || '').replace(/\D/g, '');
  return d.startsWith('44') ? `0${d.slice(2)}` : d;
}
/** Postcode without spaces, upper case. */
export const squashPostcode = (s: string | null | undefined) => (s || '').replace(/\s+/g, '').toUpperCase();

/**
 * Does a job match the search box, every word of it in any order ("rob evans", src/lib/search-words.ts)?
 * Name or job title (accents aside), postcode (with or without its space), phone digits, or a reference
 * (HX-0042, hx42, 0042 find the customer's ref and each job's).
 */
export function matchesSearch(
  p: { customer?: string | null; title?: string | null; postcode?: string | null; phone?: string | null; project_ref?: string | null; customer_ref?: string | null },
  q: string
): boolean {
  return everyWord(q, (t) => {
    if (looksLikeRef(t) && (refMatches(t, p.project_ref) || refMatches(t, p.customer_ref))) return true;
    if (refOnly(t)) return false;
    if (hasText(`${p.customer ?? ''} ${p.title ?? ''}`, t)) return true;
    const pc = squashPostcode(t);
    if (pc.length >= 3 && squashPostcode(p.postcode).includes(pc)) return true;
    const d = phoneDigits(t);
    return d.length >= 4 && /^[\d\s+()-]+$/.test(t) && phoneDigits(p.phone).includes(d);
  });
}

/** Remember a view: the cookie the dock reads (hx-crm-view), and ?view= in the address bar without a reload. */
export function rememberView(param: string, value: string, cookie?: string) {
  try {
    if (cookie) document.cookie = `${cookie}=${value}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Cookies off: the address bar still has it.
  }
  const url = new URL(window.location.href);
  url.searchParams.set(param, value);
  // Next keeps useSearchParams in step with replaceState, so the dock follows (open on Home, the strip on Board and List).
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
