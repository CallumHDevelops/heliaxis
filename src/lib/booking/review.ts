import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { calendarView, msConfigured } from '@/lib/ms365';
import { haversineKm, ukDate, ukTime, weekday } from './engine';
import { resolvePlace } from './geo';
import { basePlace } from './book';
import { getBookingSettings } from './settings-server';
import { WEEKDAYS, type BookingSettings } from './settings';

/**
 * "What your diary says": the surveyor's last 10 weeks of Outlook, in plain words, with suggested
 * changes he can tap (nothing changes by itself), plus how "Ask me to confirm" has gone this week.
 * Read-only. Cached for an hour.
 */

export type Suggestion = { id: string; label: string; settings: BookingSettings };
export type TrackRecord = { requests: number; wouldAccept: number; confirmed: number; declined: number; ready: boolean; text: string };
export type DiaryReview = {
  connected: boolean;
  mailbox: string | null;
  facts: string[];
  suggestions: Suggestion[];
  track: TrackRecord;
  error?: string;
  readAt?: string;
};

const HOUR = 3_600_000;
let cache: { at: number; key: string; value: Omit<DiaryReview, 'track' | 'suggestions'> & { firstMedian?: string; lastMedian?: string } } | null = null;

const toMins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const round15 = (m: number) => Math.round(m / 15) * 15;
function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  const k = Math.floor(v.length / 2);
  return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
}
const quantile = (xs: number[], q: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
};

/** Last 7 days of requests: would instant booking have accepted them, and what happened. */
export async function trackRecord(): Promise<TrackRecord> {
  const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
  const { data } = await createAdminClient()
    .from('survey_bookings')
    .select('*')
    .gte('created_at', since)
    .neq('source', 'staff')
    .limit(1000)
    .then(
      (r) => r,
      () => ({ data: null })
    );
  // Requests are bookings made in "Ask me to confirm" (would_confirm is only set on those), plus
  // the moves and cancels that came from them.
  const rows = ((data ?? []) as { status: string; would_confirm: boolean | null; cancel_reason: string | null; confirmed_at: string | null; booked_by: string | null }[]).filter(
    (r) => r.would_confirm !== null && r.cancel_reason !== 'moved' && r.status !== 'held'
  );
  const requests = rows.length;
  const wouldAccept = rows.filter((r) => r.would_confirm === true).length;
  const confirmed = rows.filter((r) => r.status === 'confirmed' && r.booked_by).length;
  const declined = rows.filter((r) => r.cancel_reason === 'declined').length;
  const ready = wouldAccept >= 5 && !rows.some((r) => r.would_confirm === false || r.cancel_reason === 'declined');
  const all = wouldAccept === requests ? (requests === 1 ? 'it' : requests === 2 ? 'both' : `all ${requests}`) : `${wouldAccept} of them`;
  const text = !requests
    ? 'Last 7 days: no online requests yet.'
    : `Last 7 days: ${requests} request${requests === 1 ? '' : 's'}. Instant booking would have accepted ${all}; you confirmed ${confirmed}${declined ? ` and offered another time for ${declined}` : ''}.`;
  return { requests, wouldAccept, confirmed, declined, ready, text };
}

/** Read the surveyor's last 10 weeks and say what they show. */
export async function reviewDiary(o: { fresh?: boolean } = {}): Promise<DiaryReview> {
  const s = await getBookingSettings();
  const track = await trackRecord();
  const sv = s.surveyors[0];
  if (!msConfigured() || !sv) return { connected: msConfigured(), mailbox: sv?.key ?? null, facts: [], suggestions: [], track };

  const key = `${sv.key}|${s.advanced.unknownPadMins}`;
  if (o.fresh || !cache || cache.key !== key || Date.now() - cache.at > HOUR) {
    try {
      cache = { at: Date.now(), key, value: await readDiary(sv.key, s) };
    } catch (e) {
      return { connected: true, mailbox: sv.key, facts: [], suggestions: [], track, error: e instanceof Error ? e.message : 'Outlook couldn’t be read' };
    }
  }
  const v = cache.value;

  // Buttons for what looks different from the settings (weekdays only; Saturday has its own rule).
  const suggestions: Suggestion[] = [];
  const weekdays = WEEKDAYS.filter((w) => Number(w) <= 5 && sv.hours[w]);
  const current = weekdays.length ? sv.hours[weekdays[0]] : null;
  const withHours = (f: (h: { start: string; end: string; maxFromBaseMins?: number }) => { start: string; end: string; maxFromBaseMins?: number }): BookingSettings => ({
    ...s,
    surveyors: s.surveyors.map((x, i) =>
      i === 0 ? { ...x, hours: Object.fromEntries(WEEKDAYS.map((w) => [w, Number(w) <= 5 && x.hours[w] ? f(x.hours[w]!) : x.hours[w]])) as typeof x.hours } : x
    ),
  });
  if (current && v.firstMedian && Math.abs(toMins(v.firstMedian) - toMins(current.start)) >= 30 && v.firstMedian < current.end) {
    const t = v.firstMedian;
    suggestions.push({ id: 'first-start', label: `Use ${t} as the first start`, settings: withHours((h) => ({ ...h, start: t })) });
  }
  if (current && v.lastMedian && Math.abs(toMins(v.lastMedian) - toMins(current.end)) >= 30 && v.lastMedian > current.start) {
    const t = v.lastMedian;
    suggestions.push({ id: 'last-finish', label: `Use ${t} as the last finish`, settings: withHours((h) => ({ ...h, end: t })) });
  }
  return { connected: true, mailbox: sv.key, facts: v.facts, suggestions, track, readAt: new Date(cache.at).toISOString() };
}

async function readDiary(mailbox: string, s: BookingSettings) {
  const sv = s.surveyors[0];
  const base = await basePlace(sv);
  const now = Date.now();
  const events = await calendarView(mailbox, new Date(now - 70 * 24 * HOUR), new Date(now));
  const real = events.filter((e) => !e.isCancelled && e.response !== 'declined' && !e.transactionId?.startsWith('hx-'));
  const freeAllDay = real.filter((e) => e.isAllDay && e.showAs === 'free').length;
  const timed = real.filter((e) => !e.isAllDay && e.showAs !== 'free' && e.showAs !== 'workingElsewhere' && e.end.getTime() - e.start.getTime() < 12 * HOUR);
  const facts: string[] = [];
  if (!timed.length) {
    facts.push('There are no appointments in your Outlook diary for the last 10 weeks, so there’s nothing to compare yet.');
    if (freeAllDay) facts.push(`${freeAllDay} all-day ${freeAllDay === 1 ? 'entry is' : 'entries are'} marked Free (holidays?). They won’t stop bookings. Mark days off as Away.`);
    return { connected: true, mailbox, facts, suggestions: [] };
  }

  // First start and last finish of each day.
  const byDay = new Map<string, { first: number; last: number }>();
  for (const e of timed) {
    const d = ukDate(e.start.getTime());
    const first = toMins(ukTime(e.start.getTime()));
    const last = ukDate(e.end.getTime()) === d ? toMins(ukTime(e.end.getTime())) : 24 * 60 - 1;
    const x = byDay.get(d);
    byDay.set(d, x ? { first: Math.min(x.first, first), last: Math.max(x.last, last) } : { first, last });
  }
  const firsts = [...byDay.values()].map((x) => x.first);
  const lasts = [...byDay.values()].map((x) => x.last);
  const firstMedian = toHhmm(round15(median(firsts)));
  const lastMedian = toHhmm(round15(median(lasts)));
  facts.push(
    `Your first appointment usually starts around ${firstMedian} (earliest ${toHhmm(Math.min(...firsts))}). Your last usually ends around ${lastMedian} (latest ${toHhmm(Math.max(...lasts))}).`
  );

  // Places, and the gaps between appointments in different places.
  let noPlace = 0;
  const placed: { start: number; end: number; ll: { lat: number; lng: number } | null }[] = [];
  for (const e of timed) {
    const p = base ? await resolvePlace(e, base) : null;
    if (!p || p.unknown) noPlace++;
    placed.push({ start: e.start.getTime(), end: e.end.getTime(), ll: p && !p.unknown && !p.online ? p.ll : null });
  }
  const gaps: number[] = [];
  placed.sort((a, b) => a.start - b.start);
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1];
    const b = placed[i];
    if (ukDate(a.start) !== ukDate(b.start) || !a.ll || !b.ll || haversineKm(a.ll, b.ll) < 1) continue;
    const gap = (b.start - a.end) / 60_000;
    if (gap >= 0 && gap <= 240) gaps.push(gap);
  }
  if (gaps.length >= 3) {
    const lo = round15(quantile(gaps, 0.25));
    const hi = round15(quantile(gaps, 0.75));
    facts.push(
      `Between appointments in different places you usually leave ${lo === hi ? `about ${lo}` : `${lo}–${hi}`} minutes. The app would leave the drive plus ${s.bufferMins + s.coffeeMins} minutes.`
    );
  }
  if (noPlace) {
    facts.push(
      `${noPlace} of your ${timed.length} appointments have no postcode, so the app guesses they’re at home and adds ${s.advanced.unknownPadMins} minutes each side. Adding a postcode in Outlook helps.`
    );
  }
  if (freeAllDay) facts.push(`${freeAllDay} all-day ${freeAllDay === 1 ? 'entry is' : 'entries are'} marked Free (holidays?). They won’t stop bookings. Mark days off as Away.`);
  const saturdays = timed.filter((e) => weekday(ukDate(e.start.getTime())) === '6').length;
  facts.push(saturdays ? `Saturdays: ${saturdays} appointment${saturdays === 1 ? '' : 's'} in 10 weeks.` : 'Saturdays: none in 10 weeks.');
  return { connected: true, mailbox, facts, suggestions: [], firstMedian, lastMedian };
}
