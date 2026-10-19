import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { msConfigured } from '@/lib/ms365';
import { schemaReady } from '@/lib/schema-ready';
import { ukBankHolidays } from '@/lib/bank-holidays';
import { surveyTypeLabel } from '@/lib/crm/stages';
import {
  addDays,
  dayRange,
  earliestBookableDay,
  inRush,
  londonSlot,
  makeDrive,
  mergeBlocks,
  ukDate,
  ukTime,
  weekday,
  type Place,
} from '@/lib/booking/engine';
import { itemsOnDay, loadDiary, parseRange, type BookingRow, type DiaryItem } from '@/lib/booking/diary';
import { basePlace, dayLabel, notifyChannel, whenText } from '@/lib/booking/book';
import { backfillList } from '@/lib/booking/calendar-sync';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { WEEKDAY_NAMES, type BookingSettings, type Surveyor } from '@/lib/booking/settings';
import { estimateBetween, pickProvider } from '@/lib/booking/travel';

export const dynamic = 'force-dynamic';

/**
 * The Diary (staff): ?from&to (UK dates, default the next 3 weeks; ?fresh=1 reads Outlook again).
 * Per surveyor per day: what's in it, the drives between (our estimate, with rush hour), free
 * windows, warnings, and why customers can't book that day; plus requests waiting to be confirmed,
 * all-day entries that don't block, and how many dates could be copied into Outlook.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

type ViewItem = {
  id: string;
  kind: DiaryItem['kind'];
  start: string;
  end: string;
  time: string;
  label: string;
  place: string;
  postcode: string | null;
  isSurvey: boolean;
  allDay: boolean;
  private: boolean;
  movedInOutlook: boolean;
  noLocation: boolean;
  approx: boolean;
  online: boolean;
  projectId: string | null;
  bookingId: string | null;
  entryId: string | null;
  status: string | null;
};

const view = (i: DiaryItem): ViewItem => ({
  id: i.id,
  kind: i.kind,
  start: iso(i.start),
  end: iso(i.end),
  time: i.allDayBlock ? 'All day' : `${ukTime(i.start)}–${ukTime(i.end)}`,
  label: i.label,
  place: i.private ? '' : i.place.online ? 'Online / phone' : i.place.unknown ? '' : i.place.label,
  postcode: i.postcode ?? null,
  isSurvey: i.isSurvey,
  allDay: !!i.allDayBlock,
  private: !!i.private,
  movedInOutlook: !!i.movedInOutlook,
  noLocation: !!i.noLocation,
  approx: !!i.approx,
  online: !!i.place.online,
  projectId: i.projectId ?? null,
  bookingId: i.bookingId ?? null,
  entryId: i.entryId ?? null,
  status: i.status ?? null,
});

function dayView(
  day: string,
  sv: Surveyor,
  base: Place,
  diaryItems: DiaryItem[],
  s: BookingSettings,
  x: { hols: Set<string>; closed: Set<string>; today: string; firstBookable: string; lastBookable: string; now: number }
) {
  const h = sv.hours[weekday(day)];
  const items = itemsOnDay(diaryItems, day);
  const allDay = items.filter((i) => i.allDayBlock);
  // Online / phone appointments are wherever he was before.
  let prev = base;
  const timed = items
    .filter((i) => !i.allDayBlock)
    .map((i) => {
      const place = i.place.online ? prev : i.place;
      prev = place;
      return { ...i, place };
    });
  const drive = makeDrive({
    customer: { ll: null, label: '' },
    estimate: (a, b) => estimateBetween(a, b, s),
    ratio: 1,
    rushFactor: s.advanced.rushFactor,
    rushWindows: s.advanced.rushWindows,
  });
  const rush = (at: number) => s.advanced.rushFactor > 1 && inRush(at, s.advanced.rushWindows);

  // The drives: from home, between appointments, and home again.
  const legs: { from: string; to: string; minutes: number; rush: boolean; afterId: string | null; beforeId: string | null }[] = [];
  if (timed.length) {
    const first = timed[0];
    const out = sv.leaveHomeFrom ? londonSlot(day, sv.leaveHomeFrom) : first.start - 60 * MIN;
    legs.push({ from: base.label, to: first.place.label, minutes: drive(base, first.place, out), rush: rush(out), afterId: null, beforeId: first.id });
    for (let k = 1; k < timed.length; k++) {
      const a = timed[k - 1];
      const b = timed[k];
      if (b.start < a.end) continue; // overlapping: no drive between
      const at = a.end + (s.bufferMins + s.coffeeMins) * MIN;
      legs.push({ from: a.place.label, to: b.place.label, minutes: drive(a.place, b.place, at), rush: rush(at), afterId: a.id, beforeId: b.id });
    }
    const last = timed.reduce((m, i) => (i.end > m.end ? i : m), timed[0]);
    const back = last.end + s.bufferMins * MIN;
    legs.push({ from: last.place.label, to: base.label, minutes: drive(last.place, base, back), rush: rush(back), afterId: last.id, beforeId: null });
  }

  // Free time inside the window, for jobs nearby.
  const free: { start: string; end: string; time: string }[] = [];
  if (h && !allDay.length) {
    const gap = (s.bufferMins + s.coffeeMins) * MIN;
    const shortest = Math.min(s.durations.solar, s.durations.ashp, s.durations.solar_ashp) * MIN;
    const winStart = Math.max(londonSlot(day, h.start), day === x.today ? x.now : 0);
    const winEnd = londonSlot(day, h.end);
    let from = winStart;
    for (const b of mergeBlocks(timed)) {
      const to = Math.min(winEnd, b.start - gap);
      if (to - from >= shortest) free.push({ start: iso(from), end: iso(to), time: `${ukTime(from)}–${ukTime(to)}` });
      from = Math.max(from, b.end + gap);
    }
    if (winEnd - from >= shortest) free.push({ start: iso(from), end: iso(winEnd), time: `${ukTime(from)}–${ukTime(winEnd)}` });
  }

  const surveys = mergeBlocks(timed).reduce((n, b) => n + b.surveys, 0);
  let reason: string | null = null;
  if (!h) reason = `${WEEKDAY_NAMES[weekday(day)]}: no surveys`;
  else if (x.hols.has(day) && s.advanced.skipBankHolidays) reason = 'Bank holiday';
  else if (x.closed.has(day)) reason = 'Closed';
  else if (allDay.length) reason = `Blocked all day: ${allDay[0].label}`;
  else if (day < x.firstBookable)
    reason = day === x.today ? 'Today: too late for customers to book' : ukTime(x.now) >= s.cutoffTime ? `Closed for ${dayLabel(day)} (after ${s.cutoffTime})` : 'Too soon for customers to book';
  else if (day > x.lastBookable) reason = 'Further ahead than customers can book';
  else if (surveys >= s.maxPerDay) reason = `${s.maxPerDay} surveys already`;
  const note = h?.maxFromBaseMins != null ? `${WEEKDAY_NAMES[weekday(day)]}: only for customers within ${h.maxFromBaseMins} min of home` : null;

  return {
    day,
    label: dayLabel(day),
    hours: h ?? null,
    items: timed.map(view),
    allDay: allDay.map(view),
    legs,
    free,
    surveys,
    reason,
    note,
  };
}

export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ ready: false });
  const q = new URL(req.url).searchParams;
  const now = Date.now();
  const today = ukDate(now);
  const from = YMD.test(q.get('from') || '') ? (q.get('from') as string) : today;
  let to = YMD.test(q.get('to') || '') ? (q.get('to') as string) : addDays(from, 20);
  if (to < from) to = from;
  if (to > addDays(from, 41)) to = addDays(from, 41);
  const fresh = q.get('fresh') === '1';

  const s = await getBookingSettings({ fresh: true });
  const hols = await ukBankHolidays();
  const closed = new Set(s.closedDates);
  const isWorkingDay = (d: string) => !(s.advanced.skipBankHolidays && hols.has(d)) && !closed.has(d) && s.surveyors.some((sv) => !!sv.hours[weekday(d)]);
  const ctx = {
    hols,
    closed,
    today,
    now,
    firstBookable: earliestBookableDay(now, s.cutoffTime, isWorkingDay),
    lastBookable: addDays(today, s.advanced.horizonDays),
  };
  const days = dayRange(from, to);

  const surveyors = [];
  for (const sv of s.surveyors) {
    const base = await basePlace(sv);
    if (!base) {
      surveyors.push({ key: sv.key, name: sv.name, base: { label: sv.baseLabel, postcode: sv.basePostcode }, outlookOk: false, outlookError: `Couldn’t find ${sv.basePostcode}`, days: [], notBlocking: [] });
      continue;
    }
    const diary = await loadDiary(sv, from, to, { s, base, hols: s.advanced.skipBankHolidays ? hols : new Set<string>(), fresh });
    surveyors.push({
      key: sv.key,
      name: sv.name,
      base: { label: sv.baseLabel, postcode: sv.basePostcode },
      outlookOk: diary.outlookOk,
      outlookError: diary.outlookError ?? null,
      days: days.map((d) => dayView(d, sv, base, diary.items, s, ctx)),
      notBlocking: diary.notBlocking.map(view),
    });
  }

  // Requests waiting for a tap.
  const db = createAdminClient();
  const { data: reqRows } = await db.from('survey_bookings').select('*').eq('status', 'requested').order('day', { ascending: true }).limit(100);
  const reqs = (reqRows ?? []) as BookingRow[];
  const enquiryIds = [...new Set(reqs.map((r) => r.enquiry_id).filter((x): x is string => !!x))];
  const people = new Map<string, { name: string; phone: string | null; email: string | null }>();
  if (enquiryIds.length) {
    const { data } = await db.from('enquiries').select('id, name, phone, email').in('id', enquiryIds.slice(0, 100));
    for (const e of data ?? []) people.set(e.id as string, { name: e.name as string, phone: (e.phone as string | null) ?? null, email: (e.email as string | null) ?? null });
  }
  const names = new Map(s.surveyors.map((sv) => [sv.key, sv.name]));
  const requests = [];
  for (const r of reqs) {
    const range = parseRange(r.onsite);
    const who = r.enquiry_id ? people.get(r.enquiry_id) : undefined;
    requests.push({
      id: r.id,
      projectId: r.project_id,
      enquiryId: r.enquiry_id,
      customer: who?.name ?? 'Customer',
      phone: who?.phone ?? null,
      email: who?.email ?? null,
      start: range ? iso(range.start) : null,
      end: range ? iso(range.end) : null,
      label: range ? whenText(range.start) : '',
      type: r.survey_type,
      typeLabel: surveyTypeLabel(r.survey_type),
      minutes: r.minutes,
      postcode: r.postcode,
      address: r.address,
      surveyorKey: r.surveyor_key,
      surveyorName: names.get(r.surveyor_key) ?? r.surveyor_key,
      wouldConfirm: r.would_confirm,
      notify: await notifyChannel(r.enquiry_id),
      duplicateOf: r.duplicate_of,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    });
  }

  return json({
    ready: true,
    from,
    to,
    enabled: s.enabled,
    mode: s.mode,
    cutoff: s.cutoffTime,
    bufferMins: s.bufferMins,
    coffeeMins: s.coffeeMins,
    connected: { outlook: msConfigured(), provider: pickProvider(s).name },
    surveyors,
    requests,
    backfill: msConfigured() ? (await backfillList().catch(() => [])).length : 0,
  });
}
