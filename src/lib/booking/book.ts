import 'server-only';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukBankHolidays } from '@/lib/bank-holidays';
import { msConfigured } from '@/lib/ms365';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { toWaId, windowOpen } from '@/lib/whatsapp/shared';
import { applyStageEvent } from '@/lib/crm/move-stage';
import { getCrmSettings } from '@/lib/crm/crm-settings';
import { bookingUrl, ensureBookingToken, projectByBookingToken, type BookingProject } from '@/lib/crm/booking-link';
import { ensureOpportunity, isUuid, logActivity } from '@/lib/crm/server';
import { isSurveyType, minutesWords, noSurveyNeeded, surveyTypeFor, surveyTypeLabel, type SurveyTypeKey } from '@/lib/crm/stages';
import {
  addDays,
  dayRange,
  earliestBookableDay,
  floorTo5,
  londonSlot,
  pickTimes,
  slotsForDay,
  ukDate,
  ukTime,
  weekday,
  type Candidate,
  type DayReason,
  type EngineSettings,
  type Place,
  type Window,
} from './engine';
import { sunsetMs } from './sun';
import { getBookingSettings } from './settings-server';
import { WEEKDAY_NAMES, type BookingSettings, type Surveyor } from './settings';
import { firstName, itemsOnDay, loadDiary, parseRange, surveyMinutesFor, surveyorProfileId, type BookingRow, type ProjectRow } from './diary';
import { isHit, lookupPostcode, normPostcode, outcodeOf, placeFromHit, spacedPostcode, type GeoHit } from './geo';
import { buildDrive, estimateBetween } from './travel';
import { syncProjectCalendar } from './calendar-sync';
import { autoNotifyAppointment, sendAppointmentNotices, type Notify } from './appointment-notify';

/**
 * Searching, holding and confirming survey times. The database is the source of truth: every time
 * is taken by a SQL function (survey_slot_take / _confirm / _cancel) that locks the UK day and
 * refuses if the day changed since it was checked, so two customers can't take neighbouring times.
 * The booking code sends customers nothing itself: the every-minute automation confirms once
 * survey_at is set.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
export const OFFICE_PHONE = '01633 965205';

/* ── Words ───────────────────────────────────────────────────────────────────── */

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymdDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
/** "Tue 3 Nov" */
export const dayLabel = (ymd: string) => {
  const d = ymdDate(ymd);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
/** "Tuesday 3 November" */
export const longDayLabel = (ymd: string) => {
  const d = ymdDate(ymd);
  return `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MON_LONG[d.getUTCMonth()]}`;
};
/** "Tue 3 Nov 11:45" */
export const whenText = (ms: number) => `${dayLabel(ukDate(ms))} ${ukTime(ms)}`;
/** "1 hr", "1½ hrs", "45 min" */
export const hrs = (m: number) => (m === 60 ? '1 hr' : m === 90 ? '1½ hrs' : m % 60 === 0 ? `${m / 60} hrs` : `${m} min`);
const typeShort = (t: string) => (t === 'solar_ashp' ? 'solar and heat pump' : t === 'ashp' ? 'heat pump' : 'solar');

const POSTCODE_ERRORS: Record<string, string> = {
  invalid: 'We couldn’t find that postcode. Check it and try again.',
  not_found: 'We couldn’t find that postcode. Check it and try again.',
  ni: 'Sorry, we don’t cover Northern Ireland.',
  unavailable: `We can’t look up postcodes right now. Please try again in a minute, or call us on ${OFFICE_PHONE}.`,
};

/* ── Types ───────────────────────────────────────────────────────────────────── */

export type SlotTime = { start: string; end: string; time: string; recommended: boolean };
/** Staff see who and how far; customers get SlotTime only (publicDays). */
export type StaffSlot = SlotTime & { surveyorKey: string; surveyorName: string; detour: number; driveIn: number; driveOut: number };
export type SlotDay<T extends SlotTime = StaffSlot> = { day: string; label: string; morning: T[]; afternoon: T[] };
export type RawCand = Candidate & { surveyorKey: string; day: string };

export type FindOpts = {
  postcode: string;
  type: SurveyTypeKey;
  ignoreBookingId?: string | null;
  /** Booking a time for this job: its own survey date in the CRM doesn't count as busy (the new time replaces it). */
  ignoreProjectId?: string | null;
  fresh?: boolean;
  onlyDay?: string;
  onlySurveyorKey?: string;
  staff?: boolean;
  /** Staff "Book anyway": 07:00–21:00, no distance, detour, driving or per-day limits (overlaps still count). */
  override?: boolean;
  /** When the customer's hold was made: the cut-off is judged at that moment (held at 14:58, confirmed at 15:02 is fine). */
  heldAt?: number;
  /** Staff "Preview": what a customer would see, even while online booking is switched off. */
  preview?: boolean;
  signal?: AbortSignal;
};
export type FindOk = {
  ok: true;
  mode: 'request' | 'instant';
  /** Would instant booking have accepted it (Outlook connected and read)? */
  wouldConfirm: boolean;
  minutes: number;
  minutesText: string;
  days: SlotDay[];
  tooFar: boolean;
  soonest: StaffSlot | null;
  /** Staff only: why a day has no times. */
  reasons: Record<string, string>;
  /** Every start that fits (not just the ones shown), for holds and confirms. */
  raw: RawCand[];
  customer: Place;
  geo: GeoHit;
  provider: 'google' | 'estimate';
  outlookOk: boolean;
  outlookError?: string;
};
export type FindFail = { ok: false; closed?: true; code?: string; error?: string };
export type FindResult = FindOk | FindFail;
/** A route's reply. */
export type Outcome = { status: number; body: Record<string, unknown> };
export type Staff = { id: string; name: string };
/** The signed-in staff member, by first name ("Booked by Esther"). */
export const staffFrom = (s: { user: { id: string }; profile: { full_name: string | null; email: string | null } }): Staff => ({
  id: s.user.id,
  name: firstName(s.profile.full_name) || (s.profile.email || 'staff').split('@')[0],
});

/** Customers never see who, how far, or anyone else's details. */
export function publicDays(days: SlotDay[]): SlotDay<SlotTime>[] {
  const strip = (x: StaffSlot): SlotTime => ({ start: x.start, end: x.end, time: x.time, recommended: x.recommended });
  return days.map((d) => ({ day: d.day, label: d.label, morning: d.morning.map(strip), afternoon: d.afternoon.map(strip) }));
}

/* ── Working days ────────────────────────────────────────────────────────────── */

async function calendarRules(s: BookingSettings) {
  const hols = s.advanced.skipBankHolidays ? await ukBankHolidays() : new Set<string>();
  const closed = new Set(s.closedDates);
  const isWorkingDay = (d: string) => !hols.has(d) && !closed.has(d) && s.surveyors.some((sv) => !!sv.hours[weekday(d)]);
  return { hols, closed, isWorkingDay };
}

const engineSettings = (s: BookingSettings, override: boolean): EngineSettings => ({
  bufferMins: s.bufferMins,
  coffeeMins: s.coffeeMins,
  arrivalMins: s.advanced.arrivalMins,
  unknownPadMins: s.advanced.unknownPadMins,
  stepMins: s.advanced.stepMins,
  maxPerDay: override ? Infinity : s.maxPerDay,
  maxDriveMinsPerDay: override ? Infinity : s.advanced.maxDriveMinsPerDay,
  maxOneWayMins: override ? Infinity : s.advanced.maxOneWayMins,
  maxDetourMins: override ? Infinity : s.advanced.maxDetourMins,
});

export async function basePlace(sv: Surveyor): Promise<Place | null> {
  const hit = await lookupPostcode(sv.basePostcode);
  return isHit(hit) ? { ...placeFromHit(hit, sv.baseLabel), home: true } : null;
}

/* ── Searching ───────────────────────────────────────────────────────────────── */

/**
 * The times a customer at `postcode` could have for a `type` survey: every surveyor's diary, the
 * drives either side, the window, the cut-off, sunset for solar. Customers start from the first
 * bookable day; staff from now.
 */
export async function findSlots(o: FindOpts): Promise<FindResult> {
  const s = await getBookingSettings();
  if (!s.enabled && !o.staff && !o.preview) return { ok: false, closed: true };
  const surveyors = s.surveyors.filter((sv) => !o.onlySurveyorKey || sv.key === o.onlySurveyorKey);
  if (!surveyors.length) return o.staff ? { ok: false, code: 'no_surveyors', error: 'No surveyors are set up in booking settings.' } : { ok: false, closed: true };
  if (!isSurveyType(o.type)) return { ok: false, code: 'type', error: 'Please choose what the survey is for.' };
  const minutes = s.durations[o.type];
  const geo = await lookupPostcode(o.postcode);
  if (!isHit(geo)) return { ok: false, code: geo.error === 'ni' ? 'ni' : geo.error === 'unavailable' ? 'unavailable' : 'postcode', error: POSTCODE_ERRORS[geo.error] };
  const C = placeFromHit(geo);
  const { hols, closed, isWorkingDay } = await calendarRules(s);
  const now = Date.now();
  const today = ukDate(now);
  const ref = o.heldAt && o.heldAt < now && now - o.heldAt < 30 * MIN ? o.heldAt : now;
  const firstDay = o.staff ? today : earliestBookableDay(ref, s.cutoffTime, isWorkingDay);
  const earliestAllowed = o.staff ? now : Math.max(now, londonSlot(firstDay, '00:00'));
  const lastDay = addDays(today, s.advanced.horizonDays);
  const daysList = o.onlyDay
    ? o.onlyDay >= firstDay && (o.staff || o.onlyDay <= lastDay)
      ? [o.onlyDay]
      : []
    : dayRange(firstDay, lastDay);
  const es = engineSettings(s, !!o.override);
  const reasons: Record<string, string> = {};
  const raw: RawCand[] = [];
  let provider: 'google' | 'estimate' = 'estimate';
  let outlookOk = true;
  let outlookError: string | undefined;
  let tooFarCount = 0;

  for (const [idx, sv] of surveyors.entries()) {
    if (!daysList.length) break;
    const base = await basePlace(sv);
    if (!base) {
      outlookOk = false;
      outlookError = `Couldn’t find ${sv.name}’s home postcode`;
      continue;
    }
    if (!o.override) {
      const e = estimateBetween(base, C, s);
      if (e != null && e > s.advanced.maxOneWayMins * 1.3) {
        tooFarCount++; // clearly too far: no Google call, no diary
        for (const d of daysList) reasons[d] ??= 'Too far from home';
        continue;
      }
    }
    const diary = await loadDiary(sv, daysList[0], daysList[daysList.length - 1], {
      s,
      base,
      hols: s.advanced.skipBankHolidays ? hols : new Set<string>(),
      fresh: o.fresh,
      ignoreBookingId: o.ignoreBookingId,
      ignoreProjectId: o.ignoreProjectId,
      signal: o.signal,
    });
    if (!diary.outlookOk) {
      outlookOk = false;
      outlookError ??= diary.outlookError;
    }
    const { drive, provider: used } = await buildDrive(s, C, [base, ...diary.items.map((i) => i.place)], { signal: o.signal });
    if (used === 'google') provider = 'google';
    let any = false;
    let far = false;
    for (const day of daysList) {
      const h = sv.hours[weekday(day)];
      if (!o.override && (!h || !isWorkingDay(day))) {
        reasons[day] ??= hols.has(day) ? 'Bank holiday' : closed.has(day) ? 'Closed' : `${WEEKDAY_NAMES[weekday(day)]}: no surveys`;
        continue;
      }
      const win: Window =
        o.override || !h
          ? { firstStart: londonSlot(day, '07:00'), lastFinish: londonSlot(day, '21:00') }
          : {
              firstStart: londonSlot(day, h.start),
              lastFinish: londonSlot(day, h.end),
              ...(sv.leaveHomeFrom ? { leaveFrom: londonSlot(day, sv.leaveHomeFrom) } : {}),
              ...(sv.homeBy ? { homeBy: londonSlot(day, sv.homeBy) } : {}),
              ...(h.maxFromBaseMins != null ? { maxFromBase: h.maxFromBaseMins } : {}),
            };
      if (!o.override && o.type !== 'ashp' && s.solarBeforeSunset && C.ll) {
        win.lastFinish = Math.min(win.lastFinish, floorTo5(sunsetMs(day, C.ll.lat, C.ll.lng)));
      }
      const items = itemsOnDay(diary.items, day);
      const r = slotsForDay({ C, minutes, base, items, win, s: es, earliestAllowed, drive });
      if (r.cands.length) {
        any = true;
        for (const c of r.cands) raw.push({ ...c, gap: idx * 1000 + c.gap, surveyorKey: sv.key, day });
      } else if (r.reason) {
        if (r.reason === 'too_far') far = true;
        reasons[day] ??= reasonText(r.reason, {
          day,
          maxPerDay: s.maxPerDay,
          oneWay: drive(base, C, win.firstStart),
          maxFromBase: win.maxFromBase,
          blockLabel: items.find((i) => i.allDayBlock)?.label,
        });
      }
    }
    if (!any && far) tooFarCount++;
  }

  // One list per day: the best surveyor for each start, then the few times to show.
  const names = new Map(s.surveyors.map((sv) => [sv.key, sv.name]));
  const byDay = new Map<string, Map<number, RawCand>>();
  for (const c of raw) {
    const m = byDay.get(c.day) ?? new Map<number, RawCand>();
    const prev = m.get(c.start);
    if (!prev || c.detour < prev.detour) m.set(c.start, c);
    byDay.set(c.day, m);
  }
  const days: SlotDay[] = [];
  for (const day of daysList) {
    const m = byDay.get(day);
    if (!m?.size) continue;
    delete reasons[day];
    const slots = pickTimes([...m.values()], s.advanced.timesPerDay).map(
      (c): StaffSlot => ({
        start: new Date(c.start).toISOString(),
        end: new Date(c.end).toISOString(),
        time: ukTime(c.start),
        recommended: c.recommended,
        surveyorKey: c.surveyorKey,
        surveyorName: names.get(c.surveyorKey) || '',
        detour: c.detour,
        driveIn: c.driveIn,
        driveOut: c.driveOut,
      })
    );
    days.push({ day, label: dayLabel(day), morning: slots.filter((x) => x.time < '12:00'), afternoon: slots.filter((x) => x.time >= '12:00') });
  }
  const wouldConfirm = msConfigured() && outlookOk;
  return {
    ok: true,
    mode: s.mode === 'instant' && wouldConfirm ? 'instant' : 'request', // never instant on an unread diary
    wouldConfirm,
    minutes,
    minutesText: minutesWords(minutes),
    days,
    tooFar: !days.length && tooFarCount > 0 && tooFarCount === surveyors.length,
    soonest: days[0] ? [...days[0].morning, ...days[0].afternoon][0] ?? null : null,
    reasons,
    raw,
    customer: C,
    geo,
    provider,
    outlookOk,
    ...(outlookError ? { outlookError } : {}),
  };
}

export function reasonText(r: DayReason, x: { day: string; maxPerDay: number; oneWay?: number; maxFromBase?: number; blockLabel?: string }): string {
  switch (r) {
    case 'blocked':
      return x.blockLabel ? `Blocked all day: ${x.blockLabel}` : 'Blocked all day';
    case 'full':
      return `${x.maxPerDay} surveys already`;
    case 'too_far':
      return `Too far from home${x.oneWay ? ` (about ${x.oneWay} min)` : ''}`;
    case 'too_far_today':
      return `${WEEKDAY_NAMES[weekday(x.day)]}: only for customers within ${x.maxFromBase ?? 30} min of home`;
    default:
      return 'No gap long enough';
  }
}

/** What the find failed with, as a reply. */
export function findFailOutcome(r: FindFail): Outcome {
  if (r.closed) return { status: 200, body: { closed: true } };
  return { status: r.code === 'unavailable' ? 503 : 400, body: { error: r.error || 'Please try again.', code: r.code } };
}

/* ── The database side ───────────────────────────────────────────────────────── */

/** The day's change counter, read BEFORE the diary so a later change is caught. */
export async function dayVersion(day: string): Promise<number | null> {
  const { data, error } = await createAdminClient().from('survey_booking_days').select('version').eq('day', day).maybeSingle();
  if (error) return null;
  return Number(data?.version) || 0;
}

type RpcOk = { ok: true; id: string; version: number; day?: string };
type RpcNo = { ok: false; reason: 'changed' | 'overlap' | 'already_booked' | 'bad_status' | 'missing' | 'not_open'; version?: number; status?: string };
export type RpcResult = RpcOk | RpcNo;

async function rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const r = await createAdminClient()
    .rpc(fn, args)
    .then(
      (x) => x,
      () => ({ data: null, error: { message: 'missing' } })
    );
  if (r.error || !r.data || typeof r.data !== 'object') return { ok: false, reason: 'missing' };
  return r.data as RpcResult;
}
export const slotTake = (p: Record<string, unknown>, v: number | null) => rpc('survey_slot_take', { p, p_expected_version: v });
export const slotConfirm = (id: string, v: number | null, p: Record<string, unknown>) => rpc('survey_slot_confirm', { p_id: id, p_expected_version: v, p });
export const slotCancel = (id: string, reason: string) =>
  rpc('survey_slot_cancel', { p_id: id, p_reason: reason }) as Promise<{ ok: true; project_id: string | null } | RpcNo>;

export async function bookingById(id: string): Promise<BookingRow | null> {
  if (!isUuid(id)) return null;
  const { data } = await createAdminClient().from('survey_bookings').select('*').eq('id', id).maybeSingle();
  return (data as BookingRow | null) ?? null;
}

/** The job's requested or confirmed booking (there's at most one). */
export async function liveBookingFor(projectId: string): Promise<BookingRow | null> {
  const { data } = await createAdminClient()
    .from('survey_bookings')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['requested', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as BookingRow | undefined) ?? null;
}

/**
 * A survey date on the job with no online booking behind it (set by staff in the CRM, or kept when its
 * booking was cancelled) that isn't over yet. On the customer's link that's their survey: they see it,
 * and changes go through us, so a second time can't be booked over it.
 */
export async function jobSurvey(p: BookingProject, s: BookingSettings): Promise<{ start: number; end: number; type: SurveyTypeKey; minutes: number } | null> {
  const start = p.survey_at ? Date.parse(p.survey_at) : NaN;
  if (!Number.isFinite(start)) return null;
  const { data } = await createAdminClient().from('crm_projects').select('*').eq('id', p.id).maybeSingle();
  const type: SurveyTypeKey = isSurveyType(p.survey_type) ? p.survey_type : (surveyTypeFor(p.products) ?? 'solar');
  const minutes = surveyMinutesFor({ survey_minutes: (data?.survey_minutes as number | null | undefined) ?? null, survey_type: type, products: p.products }, s);
  const end = start + minutes * MIN;
  return end > Date.now() ? { start, end, type, minutes } : null;
}
const callToChange = { status: 409, body: { error: `You already have a survey booked. To change it, please call us on ${OFFICE_PHONE}.` } };

const UNAVAILABLE: Outcome = { status: 503, body: { error: `Online booking isn’t available right now. Please call us on ${OFFICE_PHONE}.` } };
/** No solar, battery or heat pump on the job (noSurveyNeeded): no survey slot, online or from Find a time. */
const NO_SURVEY = 'This job has no solar, battery or heat pump on it, so it doesn’t need a survey. Use + Add to my diary for a home visit, or add Solar PV or Heat pump to the job if they want a survey too.';
const linkGone: Outcome = { status: 404, body: { error: 'This link has expired. Message us on WhatsApp.' } };

/** When an unconfirmed request lapses: 48 h, or the cut-off on the working day before, whichever is first (at least 2 h). */
export async function requestExpiry(day: string, s?: BookingSettings): Promise<string> {
  const set = s ?? (await getBookingSettings());
  const { isWorkingDay } = await calendarRules(set);
  let before = addDays(day, -1);
  for (let i = 0; i < 14 && !isWorkingDay(before); i++) before = addDays(before, -1);
  const now = Date.now();
  const at = Math.max(now + 2 * HOUR, Math.min(now + set.advanced.requestExpiryHours * HOUR, londonSlot(before, set.cutoffTime)));
  return new Date(at).toISOString();
}

type Offer = { sv: Surveyor; v: number | null; c: RawCand; r: FindOk };

/** Each surveyor who can do `start` (the day's version read before their diary), lowest detour first. */
async function offersFor(x: {
  postcode: string;
  type: SurveyTypeKey;
  start: number;
  ignoreBookingId?: string | null;
  ignoreProjectId?: string | null;
  staff?: boolean;
  surveyorKey?: string;
}): Promise<Offer[] | FindFail> {
  const s = await getBookingSettings();
  const day = ukDate(x.start);
  const out: Offer[] = [];
  for (const sv of s.surveyors) {
    if (x.surveyorKey && sv.key !== x.surveyorKey) continue;
    const v = await dayVersion(day);
    const r = await findSlots({
      postcode: x.postcode,
      type: x.type,
      fresh: true,
      onlyDay: day,
      onlySurveyorKey: sv.key,
      ignoreBookingId: x.ignoreBookingId,
      ignoreProjectId: x.ignoreProjectId,
      staff: x.staff,
    });
    if (!r.ok) return r;
    const c = r.raw.find((k) => k.start === x.start);
    if (c) out.push({ sv, v, c, r });
  }
  return out.sort((a, b) => a.c.detour - b.c.detour);
}

/** Fresh times for a "That time has just gone" reply (the job's own time not counted as busy, as in its search). */
async function freshDays(postcode: string, type: SurveyTypeKey, staff = false, ignore: { bookingId?: string | null; projectId?: string | null } = {}) {
  const r = await findSlots({ postcode, type, fresh: true, staff, ignoreBookingId: ignore.bookingId, ignoreProjectId: ignore.projectId });
  return r.ok ? (staff ? r.days : publicDays(r.days)) : [];
}

/* ── People ──────────────────────────────────────────────────────────────────── */

/** Push the surveyor and the job's owner (everyone on the CRM if neither is). */
export async function pushStaff(o: { projectId?: string | null; surveyorKey?: string | null; title: string; body?: string; href: string; tag?: string }) {
  try {
    const db = createAdminClient();
    const s = await getBookingSettings();
    const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
    const crm = (people ?? []).filter((p) => canAccess(p, 'crm'));
    const ids = new Set<string>();
    const sv = s.surveyors.find((x) => x.key === o.surveyorKey);
    const svp = sv && crm.find((p) => String(p.email || '').toLowerCase() === sv.profileEmail);
    if (svp) ids.add(svp.id as string);
    if (o.projectId) {
      const { data: p } = await db.from('crm_projects').select('owner_id').eq('id', o.projectId).maybeSingle();
      if (p?.owner_id && crm.some((x) => x.id === p.owner_id)) ids.add(p.owner_id as string);
    }
    if (!ids.size) for (const p of crm) ids.add(p.id as string);
    await Promise.all(
      [...ids].map((userId) => notify({ userId, kind: 'crm_booking', title: o.title, body: o.body ?? null, href: o.href, tag: o.tag }))
    );
  } catch {
    // Never block a booking on a push.
  }
}

/** A next step on the job, due now. `pushed` = we've just pushed about it (the reminder needn't). */
export async function setNextStep(projectId: string, text: string, pushed = true) {
  const now = new Date().toISOString();
  await createAdminClient()
    .from('crm_projects')
    .update({ next_step: text, next_step_at: now, next_step_notified_at: pushed ? now : null })
    .eq('id', projectId);
}

/** Clear the "Confirm …'s survey request" next step once it's dealt with. */
async function clearRequestStep(projectId: string) {
  await createAdminClient().from('crm_projects').update({ next_step: null, next_step_at: null }).eq('id', projectId).like('next_step', 'Confirm %survey request%');
}

/*
 * The WhatsApp permission rule, as the WhatsApp permission code has it (inlined: that file isn't
 * this unit's). Every enquiry with the number counts; the record columns come with crm-v3.sql.
 */
type PermRow = { id: string; wa_id?: string | null; phone?: string | null; whatsapp_opt_in?: boolean | null; whatsapp_opt_in_source?: string | null };
/** Replied STOP, or staff switched it off because they asked us to stop. */
const isStopped = (r: PermRow) =>
  r.whatsapp_opt_in === false && (r.whatsapp_opt_in_source === 'stop-reply' || !!r.whatsapp_opt_in_source?.startsWith('staff-stop:'));
/** A ticked public form only counts for that enquiry (anyone can type any number into one). */
const agreedFor = (r: PermRow, selfId: string) =>
  r.whatsapp_opt_in === true && (r.id === selfId || !['website-form', 'booking-form'].includes(r.whatsapp_opt_in_source ?? ''));

/**
 * How the customer will hear about it: WhatsApp if allowed (never after STOP; only with permission
 * once "Only send to customers who've agreed" is on) and the automation can send it (inside the
 * 24-hour window, or with the survey template set), else email once Microsoft 365 is connected, else
 * a call. `ownOnly` (website bookings) looks at this enquiry alone, so the reply never shows another
 * customer's STOP or permission.
 */
export async function notifyChannel(enquiryId: string | null, o: { ownOnly?: boolean } = {}): Promise<'whatsapp' | 'email' | 'call'> {
  if (!enquiryId) return 'call';
  try {
    const db = createAdminClient();
    const { data: e } = await db.from('enquiries').select('*').eq('id', enquiryId).maybeSingle();
    if (!e) return 'call';
    const me = e as PermRow;
    const wa = String(me.wa_id || toWaId(me.phone ?? null) || '').replace(/\D/g, '');
    const canSend = whatsappConfigured() && !!wa && (windowOpen(e.wa_last_inbound_at as string | null) || !!(await getCrmSettings()).surveyTemplate);
    if (canSend) {
      const rows: PermRow[] = [me];
      if (!o.ownOnly) {
        // The same number, including phones typed another way (07…, +44 …).
        const tail = wa.slice(-9);
        const { data: same } = await db
          .from('enquiries')
          .select('*')
          .or(`wa_id.eq.${wa},phone.ilike.%${tail.slice(0, 3)}%${tail.slice(3, 6)}%${tail.slice(6)}%`)
          .limit(50);
        for (const r of (same ?? []) as PermRow[]) if (r.id !== me.id && (r.wa_id === wa || (!r.wa_id && toWaId(r.phone ?? null) === wa))) rows.push(r);
      }
      const { data: kv } = await db.from('cms_kv').select('value').eq('key', 'wa-permission').maybeSingle();
      let requireOptIn = false;
      try {
        requireOptIn = !!(kv?.value && JSON.parse(kv.value)?.requireOptIn);
      } catch {
        requireOptIn = false;
      }
      if (!rows.some(isStopped) && (!requireOptIn || rows.some((r) => agreedFor(r, me.id)))) return 'whatsapp';
    }
    return msConfigured() && e.email ? 'email' : 'call';
  } catch {
    return 'call';
  }
}

/* ── Customers from the public website form (always new: never attached to an existing one) ── */

export type Details = {
  name: string;
  email: string;
  phone: string;
  address: string;
  town?: string;
  postcode: string;
  whatsappOptIn: boolean;
  notes?: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The details step, checked. Null = fine. */
export function checkDetails(d: Details): string | null {
  if (d.name.trim().length < 2) return 'Please enter your name.';
  if (!EMAIL.test(d.email.trim())) return 'Please check your email address.';
  if (!toWaId(d.phone)) return 'Please check your mobile number.';
  if (d.address.trim().length < 5) return 'Please enter your house number and street.';
  if (!normPostcode(d.postcode)) return 'Please check your postcode.';
  return null;
}

export function readDetails(b: Record<string, unknown>): Details {
  const t = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');
  return {
    name: t('name', 120),
    email: t('email', 200),
    phone: t('phone', 40),
    address: t('address', 200),
    town: t('town', 80) || undefined,
    postcode: t('postcode', 12),
    whatsappOptIn: b.whatsappOptIn === true,
    notes: t('notes', 1000) || undefined,
  };
}

/** Escape LIKE wildcards; the match is checked exactly afterwards anyway. */
const likeExact = (s: string) => s.replace(/[\\%_*]/g, (c) => `\\${c}`);

/**
 * A brand-new customer and opportunity for a website booking. A match on email or mobile is only
 * remembered (duplicate_of): it's never attached, changed, given permission or shown.
 */
export async function createWebsiteCustomer(
  d: { name: string; email: string; phone: string; address: string; town?: string; postcode: string; optIn: boolean; notes?: string },
  type: SurveyTypeKey,
  source: string | null
): Promise<{ enquiryId: string; projectId: string; duplicateOf: string | null } | null> {
  const db = createAdminClient();
  const wa = toWaId(d.phone);
  const email = d.email.trim();
  const matches: { id: string; created_at: string }[] = [];
  if (email) {
    const { data } = await db.from('enquiries').select('id, email, created_at').ilike('email', likeExact(email)).order('created_at', { ascending: false }).limit(5);
    for (const e of data ?? []) if (String(e.email || '').toLowerCase() === email.toLowerCase()) matches.push(e as { id: string; created_at: string });
  }
  if (wa) {
    const { data } = await db.from('enquiries').select('id, created_at').eq('wa_id', wa).order('created_at', { ascending: false }).limit(1);
    if (data?.[0]) matches.push(data[0] as { id: string; created_at: string });
  }
  const duplicateOf = matches.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null;
  const pc = normPostcode(d.postcode);
  const { data: row, error } = await db
    .from('enquiries')
    .insert({
      name: d.name.trim(),
      email,
      phone: d.phone.trim() || null,
      postcode: pc ? spacedPostcode(pc) : d.postcode.trim() || null,
      wa_id: wa,
      interest: surveyTypeLabel(type),
      source: source || 'website-booking',
      status: 'new',
    })
    .select('id')
    .single();
  if (error || !row) return null;
  const enquiryId = row.id as string;
  if (d.optIn) {
    await db.from('enquiries').update({ whatsapp_opt_in: true }).eq('id', enquiryId);
    // Columns from crm-v3.sql: a separate update, so a missing column never loses the booking.
    await db
      .from('enquiries')
      .update({ whatsapp_opt_in_at: new Date().toISOString(), whatsapp_opt_in_source: 'booking-form' })
      .eq('id', enquiryId)
      .then(
        () => null,
        () => null
      );
  }
  const projectId = await ensureOpportunity(enquiryId, 'online survey booking');
  if (!projectId) return null;
  const now = new Date().toISOString();
  const address = [d.address.trim(), d.town?.trim()].filter(Boolean).join(', ');
  // The booking is the first contact: no "not contacted" alert, no follow-up sequence.
  await db
    .from('crm_projects')
    .update({
      title: `${d.name.trim()}${pc ? ` · ${spacedPostcode(pc)}` : ''}`,
      address: address || null,
      postcode: pc ? spacedPostcode(pc) : null,
      sequence_stopped_at: now,
      first_response_alerted_at: now,
    })
    .eq('id', projectId);
  if (d.notes) await logActivity({ enquiryId, projectId, kind: 'note', body: `From the booking form: ${d.notes}` }).catch(() => null);
  return { enquiryId, projectId, duplicateOf };
}

/* ── After a time is taken ───────────────────────────────────────────────────── */

const productsFor = (t: string): string[] => (t === 'solar_ashp' ? ['solar', 'heatpump'] : t === 'ashp' ? ['heatpump'] : ['solar']);

/** One 'booked' survey record per type (solar + heat pump → both), linked to the booking. */
async function bookedSurveys(projectId: string, enquiryId: string, b: BookingRow, surveyorId: string | null, byId: string | null) {
  const db = createAdminClient();
  for (const type of b.survey_type === 'solar_ashp' ? ['solar', 'ashp'] : [b.survey_type]) {
    const ins = await db
      .from('crm_surveys')
      .insert({ project_id: projectId, enquiry_id: enquiryId, type, status: 'booked', surveyor_id: surveyorId, booking_id: b.id, created_by: byId });
    if (ins.error?.code === '23505') {
      await db
        .from('crm_surveys')
        .update({ booking_id: b.id, surveyor_id: surveyorId, updated_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('type', type)
        .in('status', ['booked', 'draft']);
    }
  }
}

type AfterConfirm = {
  b: BookingRow;
  status: 'requested' | 'confirmed';
  projectId: string;
  enquiryId: string;
  details?: Details | null;
  place?: GeoHit | null;
  /** 'online' (the customer), 'staff' (Find a time / Book anyway), 'confirmed' (staff confirming a request). */
  how: 'online' | 'staff' | 'confirmed';
  by?: Staff | null;
  duplicateOf?: string | null;
  /** Instead of the usual timeline line. */
  note?: string;
  /** Tell the customer (email, WhatsApp, text) automatically once confirmed. Default on; staff who tick their own ways pass false. */
  auto?: boolean;
};

/** Everything that follows a request or a confirmed booking, including telling the customer about a confirmed one (appointment-notify.ts). */
export async function afterConfirm(x: AfterConfirm) {
  const db = createAdminClient();
  const s = await getBookingSettings();
  const { b, projectId, enquiryId } = x;
  const r = parseRange(b.onsite);
  const start = r?.start ?? Date.now();
  const end = r?.end ?? start + b.minutes * MIN;
  const sv = s.surveyors.find((v) => v.key === b.surveyor_key);
  const { data: enq } = await db.from('enquiries').select('*').eq('id', enquiryId).maybeSingle();
  const name = (enq?.name as string) || (x.details?.name ?? 'Customer');

  // The customer's record: fill blanks only, never overwrite.
  if (x.details && enq) {
    const fill: Record<string, unknown> = {};
    if (!enq.name && x.details.name) fill.name = x.details.name;
    if (!enq.email && x.details.email) fill.email = x.details.email;
    if (!enq.phone && x.details.phone) fill.phone = x.details.phone;
    if (!enq.wa_id && toWaId(x.details.phone)) fill.wa_id = toWaId(x.details.phone);
    if (Object.keys(fill).length) await db.from('enquiries').update(fill).eq('id', enquiryId);
    // Their own link: the tick is their permission (website customers got it when they were created).
    // As the permission rule: it never undoes a STOP (only START or staff do), and the first agreement
    // recorded is kept. The record columns come with crm-v3.sql.
    const row = enq as PermRow;
    const hasRecord = 'whatsapp_opt_in_source' in row;
    const recorded = row.whatsapp_opt_in === true && (!hasRecord || !!row.whatsapp_opt_in_source);
    if (x.how === 'online' && b.source === 'link' && x.details.whatsappOptIn && !isStopped(row) && !recorded) {
      await db.from('enquiries').update({ whatsapp_opt_in: true }).eq('id', enquiryId);
      if (hasRecord) {
        await db
          .from('enquiries')
          .update({ whatsapp_opt_in_at: new Date().toISOString(), whatsapp_opt_in_source: 'booking-form' })
          .eq('id', enquiryId)
          .then(
            () => null,
            () => null
          );
      }
    }
  }

  // The job: where, and what for.
  const { data: proj } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  const p = proj as ProjectRow | null;
  if (x.details) {
    const pc = normPostcode(x.details.postcode);
    const address = [x.details.address, x.details.town].filter(Boolean).join(', ');
    const where = { address, postcode: pc ? spacedPostcode(pc) : x.details.postcode, updated_at: new Date().toISOString() };
    // Coordinates in the same update, so the trigger keeps them (columns from crm-v3.sql).
    const full = await db
      .from('crm_projects')
      .update({ ...where, ...(x.place ? { site_lat: x.place.ll.lat, site_lng: x.place.ll.lng } : {}) })
      .eq('id', projectId);
    if (full.error) await db.from('crm_projects').update(where).eq('id', projectId);
  }
  if (p && !(p.products ?? []).length) await db.from('crm_projects').update({ products: productsFor(b.survey_type) }).eq('id', projectId);
  await db
    .from('crm_projects')
    .update({ survey_type: b.survey_type })
    .eq('id', projectId)
    .then(
      () => null,
      () => null
    );

  const when = `${dayLabel(ukDate(start))}, ${ukTime(start)}`;
  const span = `${when}–${ukTime(end)}`;
  const what = `${typeShort(b.survey_type)}, ${hrs(b.minutes)}`;
  const area = outcodeOf(b.postcode);
  if (x.status === 'confirmed') {
    const note = x.how === 'online' ? 'booked online' : x.how === 'confirmed' ? 'request confirmed' : 'booked by staff';
    await applyStageEvent(projectId, 'survey_booked', { note, byId: x.by?.id ?? null });
    const surveyorId = b.surveyor_id ?? (sv ? await surveyorProfileId(sv) : null);
    await bookedSurveys(projectId, enquiryId, b, surveyorId, x.by?.id ?? null).catch(() => null);
    const body =
      x.note ??
      (x.how === 'online'
        ? `📅 Survey booked online: ${span} (${what})${sv ? ` with ${sv.name}` : ''}`
        : x.how === 'confirmed'
          ? `📅 Survey confirmed by ${x.by?.name ?? 'staff'}: ${span} (${what})${sv ? ` with ${sv.name}` : ''}`
          : `📅 Survey booked by ${x.by?.name ?? 'staff'}: ${span} (${what})${sv ? ` with ${sv.name}` : ''}`);
    await logActivity({ enquiryId, projectId, kind: 'system', body, byId: x.by?.id ?? null }).catch(() => null);
    await clearRequestStep(projectId).catch(() => null);
    after(() => syncProjectCalendar(projectId));
    // Tell them, once: email and WhatsApp, and a text if WhatsApp can't be delivered. If nothing can reach them, say so to staff.
    if (x.auto !== false) {
      const me = sv ? firstName(sv.name) : x.by?.name || 'Heliaxis';
      after(async () => {
        const r = await autoNotifyAppointment({ bookingId: b.id, enquiryId, projectId, surveyType: b.survey_type, startMs: start, endMs: end, who: sv?.name ?? null, me });
        if (!r.reached && !r.skipped) {
          await setNextStep(projectId, `Tell ${firstName(name) || name} about their appointment on ${whenText(start)} (nothing could be sent)`).catch(() => null);
          await pushStaff({ projectId, title: `Couldn’t tell ${firstName(name) || name} about their appointment`, body: r.lines.join('. ') || 'No email, WhatsApp or mobile worked', href: `/admin/crm/${projectId}` }).catch(() => null);
        }
      });
    }
    if (x.how === 'online') {
      await pushStaff({
        projectId,
        surveyorKey: b.surveyor_key,
        title: `📅 Survey booked: ${name}${area ? `, ${area}` : ''}`,
        body: whenText(start),
        href: `/admin/crm/${projectId}`,
        tag: `crm-${projectId}`,
      });
    }
  } else {
    await logActivity({
      enquiryId,
      projectId,
      kind: 'system',
      body: x.note ?? `Survey requested online: ${when} (${typeShort(b.survey_type)}). Confirm it in the Diary.`,
    }).catch(() => null);
    await setNextStep(projectId, `Confirm ${firstName(name) || name}’s survey request (${whenText(start)})`);
    await pushStaff({
      projectId,
      surveyorKey: b.surveyor_key,
      title: `Survey request: ${name}, ${whenText(start)}`,
      body: 'Tap to confirm',
      href: `/admin/surveys?job=${projectId}`, // the job id only so deleting the customer finds it
      tag: `crm-${projectId}`,
    });
  }

  if (x.duplicateOf) {
    const { data: dup } = await db.from('enquiries').select('name').eq('id', x.duplicateOf).maybeSingle();
    const { data: dupJob } = await db.from('crm_projects').select('*').eq('enquiry_id', x.duplicateOf).order('created_at', { ascending: false }).limit(1);
    const ref = (dupJob?.[0] as ProjectRow | undefined)?.project_ref;
    const text = `Possible duplicate of ${dup?.name || 'another customer'}${ref ? ` (${ref})` : ''}`;
    await logActivity({ enquiryId, projectId, kind: 'system', body: text, meta: { duplicate_of: x.duplicateOf } }).catch(() => null);
    await pushStaff({ projectId, title: `${text}: ${name}`, body: 'Check before you call them', href: `/admin/crm/${projectId}` });
  }
}

/* ── Holding (on Continue) ───────────────────────────────────────────────────── */

export async function hold(x: {
  postcode: string;
  type: SurveyTypeKey;
  start: number;
  token?: string | null;
  ipKey: string;
  releases?: string | null;
}): Promise<Outcome> {
  const s = await getBookingSettings();
  if (!s.enabled) return { status: 200, body: { closed: true } };
  let project: BookingProject | null = null;
  if (x.token) {
    project = await projectByBookingToken(x.token);
    if (!project) return { status: 404, body: { error: 'This link has expired. Message us on WhatsApp.' } };
    if (await liveBookingFor(project.id)) return { status: 409, body: { error: 'You already have a survey booked. Use “Change time” instead.' } };
    if (await jobSurvey(project, s)) return callToChange;
    if (noSurveyNeeded(project)) return linkGone;
  }
  const db = createAdminClient();
  const now = Date.now();

  // Let go of the time they held before (theirs only).
  if (x.releases && isUuid(x.releases)) {
    const old = await bookingById(x.releases);
    if (old?.status === 'held' && (old.client_ip === x.ipKey || (project && old.project_id === project.id))) await slotCancel(old.id, 'released');
  }
  const { count: mine, error } = await db
    .from('survey_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('client_ip', x.ipKey)
    .eq('status', 'held')
    .gt('expires_at', new Date(now).toISOString());
  if (error) return UNAVAILABLE;
  if ((mine ?? 0) >= 2) return { status: 429, body: { error: 'You already have times held. Finish one booking first.' } };
  if (!x.token) {
    const { count: all } = await db
      .from('survey_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'website')
      .eq('status', 'held')
      .gt('expires_at', new Date(now).toISOString());
    if ((all ?? 0) >= 6) return { status: 429, body: { error: `Online booking is busy right now. Please try again in 10 minutes, or call us on ${OFFICE_PHONE}.` } };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const offers = await offersFor({ postcode: x.postcode, type: x.type, start: x.start });
    if (!Array.isArray(offers)) return findFailOutcome(offers);
    if (!offers.length) break;
    let changed = false;
    for (const { sv, v, c, r } of offers) {
      const expiresAt = new Date(Date.now() + s.advanced.holdMins * MIN).toISOString();
      const res = await slotTake(
        {
          surveyor_key: sv.key,
          surveyor_id: await surveyorProfileId(sv),
          status: 'held',
          survey_type: x.type,
          minutes: r.minutes,
          start: new Date(c.start).toISOString(),
          end: new Date(c.end).toISOString(),
          postcode: r.geo.postcode,
          lat: r.geo.ll.lat,
          lng: r.geo.ll.lng,
          source: project ? 'link' : 'website',
          expires_at: expiresAt,
          client_ip: x.ipKey,
          project_id: project?.id ?? null,
          enquiry_id: project?.enquiry_id ?? null,
        },
        v
      );
      if (res.ok) {
        return {
          status: 200,
          body: { holdId: res.id, expiresAt, start: new Date(c.start).toISOString(), end: new Date(c.end).toISOString(), label: `${longDayLabel(c.day)}, around ${ukTime(c.start)}` },
        };
      }
      if (res.reason === 'missing') return UNAVAILABLE;
      if (res.reason === 'changed') {
        changed = true;
        break;
      }
      // Overlap: someone else got there first with this surveyor; try the next.
    }
    if (!changed) break;
  }
  return { status: 409, body: { error: 'That time has just gone. Here are the latest times.', days: await freshDays(x.postcode, x.type) } };
}

/* ── Confirming (the details step) ───────────────────────────────────────────── */

/**
 * A hold a confirm is working on: cancel_reason 'confirming' (unused on a hold; survey_slot_confirm
 * clears it, a cancel replaces it). A second tap while the first is still going waits for it rather
 * than making a second customer or cancelling the booking the first one made. Lapses after 2 minutes,
 * in case that first request never finished.
 */
const CONFIRMING = 'confirming';
const CLAIM_MS = 2 * MIN;

export async function confirm(x: { holdId: string; token?: string | null; details: Details; source: string | null }): Promise<Outcome> {
  const s = await getBookingSettings();
  const bad = checkDetails(x.details);
  if (bad) return { status: 400, body: { error: bad } };
  const b = await bookingById(x.holdId);
  if (!b) return { status: 409, body: { error: 'Your held time has gone. Please pick again.' } };

  let project: BookingProject | null = null;
  if (x.token) {
    project = await projectByBookingToken(x.token);
    if (!project) return { status: 404, body: { error: 'This link has expired. Message us on WhatsApp.' } };
    if (b.source !== 'link' || b.project_id !== project.id) return { status: 409, body: { error: 'Your held time has gone. Please pick again.' } };
  } else if (b.source !== 'website') {
    return { status: 409, body: { error: 'Your held time has gone. Please pick again.' } };
  }
  const range = parseRange(b.onsite);
  if (!range) return UNAVAILABLE;
  const sv = s.surveyors.find((v) => v.key === b.surveyor_key);
  const reply = async (status: 'requested' | 'confirmed', projectId: string, enquiryId: string | null) => ({
    status: 200,
    body: {
      ok: true,
      status,
      start: new Date(range.start).toISOString(),
      end: new Date(range.end).toISOString(),
      label: `${longDayLabel(ukDate(range.start))}, around ${ukTime(range.start)}`,
      firstName: sv?.name ?? '',
      // A website booking's reply only ever looks at the new customer (another one may share the number).
      notify: await notifyChannel(enquiryId, { ownOnly: !project }),
      changeUrl: await ensureBookingToken(projectId).then((t) => (t ? bookingUrl(t) : null)),
    },
  });
  // A second tap on Confirm: say it's done again, rather than "gone".
  if ((b.status === 'requested' || b.status === 'confirmed') && b.project_id && (!project || b.project_id === project.id) && Date.now() - Date.parse(b.created_at) < HOUR) {
    return reply(b.status, b.project_id, b.enquiry_id);
  }
  if (b.status !== 'held' && b.status !== 'expired') return { status: 409, body: { error: 'Your held time has gone. Please pick again.' } };
  // Staff set a survey date on the job while they were filling in their details.
  if (project && project.survey_booking_id !== b.id && (await jobSurvey(project, s))) {
    await slotCancel(b.id, 'the job already has a survey date');
    return callToChange;
  }
  if (outcodeOf(x.details.postcode) !== outcodeOf(b.postcode)) return { status: 409, body: { error: 'Postcode changed: please search again.', code: 'postcode_changed' } };
  const geo = await lookupPostcode(x.details.postcode);
  if (!isHit(geo)) return { status: 400, body: { error: POSTCODE_ERRORS[geo.error] } };

  // Claim the hold before making the customer: only one request books it.
  const db = createAdminClient();
  const taken = b.cancel_reason === CONFIRMING && Date.now() - Date.parse(b.updated_at) < CLAIM_MS;
  const claim = taken
    ? { data: [] as { id: string }[], error: null }
    : await db
        .from('survey_bookings')
        .update({ cancel_reason: CONFIRMING, updated_at: new Date().toISOString() })
        .eq('id', b.id)
        .in('status', ['held', 'expired'])
        .eq('updated_at', b.updated_at)
        .select('id');
  if (claim.error) return UNAVAILABLE;
  if (!claim.data?.length) {
    const cur = await bookingById(b.id);
    if (cur && (cur.status === 'requested' || cur.status === 'confirmed') && cur.project_id && (!project || cur.project_id === project.id)) {
      return reply(cur.status, cur.project_id, cur.enquiry_id);
    }
    if (cur && (cur.status === 'held' || cur.status === 'expired')) {
      return { status: 503, body: { error: 'We’re still booking that time. Wait a few seconds, then tap the button again.' } };
    }
    return { status: 409, body: { error: 'Your held time has gone. Please pick again.' } };
  }
  /** Let go of the claim (an early way out), so the customer can try again straight away. */
  const unclaim = async <T,>(out: T): Promise<T> => {
    await db
      .from('survey_bookings')
      .update({ cancel_reason: null })
      .eq('id', b.id)
      .eq('cancel_reason', CONFIRMING)
      .in('status', ['held', 'expired'])
      .then(
        () => null,
        () => null
      );
    return out;
  };

  let target: { projectId: string; enquiryId: string; duplicateOf: string | null; isNew: boolean } | null = project
    ? { projectId: project.id, enquiryId: project.enquiry_id, duplicateOf: null, isNew: false }
    : null;
  let done: { status: 'requested' | 'confirmed'; wouldConfirm: boolean } | null = null;
  let failure: string = 'gone';

  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await dayVersion(b.day);
    const r = await findSlots({
      postcode: geo.postcode,
      type: b.survey_type,
      fresh: true,
      onlyDay: b.day,
      onlySurveyorKey: b.surveyor_key,
      ignoreBookingId: b.id,
      heldAt: Date.parse(b.created_at),
    });
    if (!r.ok) {
      if (r.closed) return unclaim({ status: 409, body: { error: `Online booking has just been switched off. Please call us on ${OFFICE_PHONE}.` } });
      return unclaim(findFailOutcome(r));
    }
    if (!r.raw.some((c) => c.start === range.start)) break;
    if (!target) {
      const made = await createWebsiteCustomer(
        { name: x.details.name, email: x.details.email, phone: x.details.phone, address: x.details.address, town: x.details.town, postcode: geo.postcode, optIn: x.details.whatsappOptIn, notes: x.details.notes },
        b.survey_type,
        x.source
      );
      if (!made) return unclaim(UNAVAILABLE);
      target = { ...made, isNew: true };
    }
    const status = r.mode === 'instant' ? 'confirmed' : 'requested';
    const res = await slotConfirm(b.id, v, {
      status,
      project_id: target.projectId,
      enquiry_id: target.enquiryId,
      address: [x.details.address, x.details.town].filter(Boolean).join(', '),
      postcode: geo.postcode,
      lat: geo.ll.lat,
      lng: geo.ll.lng,
      would_confirm: r.wouldConfirm,
      duplicate_of: target.duplicateOf,
      expires_at: status === 'requested' ? await requestExpiry(b.day, s) : null,
    });
    if (res.ok) {
      done = { status, wouldConfirm: r.wouldConfirm };
      break;
    }
    if (res.reason === 'missing') return unclaim(UNAVAILABLE);
    if (res.reason !== 'changed') {
      failure = res.reason;
      break;
    }
  }

  if (!done) {
    // Let the time go, unless something else has already moved this booking on (never cancel that).
    if (failure !== 'not_open') await slotCancel(b.id, 'no longer free');
    if (target?.isNew) {
      const first = firstName(x.details.name) || x.details.name;
      await setNextStep(target.projectId, `Call ${first}: their online booking didn’t go through`);
      await logActivity({ enquiryId: target.enquiryId, projectId: target.projectId, kind: 'system', body: `Online booking didn’t go through (${whenText(range.start)} had just gone)` }).catch(() => null);
      await pushStaff({ projectId: target.projectId, title: `Call ${x.details.name}: their online booking didn’t go through`, href: `/admin/crm/${target.projectId}` });
    }
    if (failure === 'already_booked') return { status: 409, body: { error: 'You already have a survey booked. Use “Change time” instead.' } };
    return { status: 409, body: { error: 'That time has just gone. Here are the latest times.', days: await freshDays(geo.postcode, b.survey_type) } };
  }

  const fresh = (await bookingById(b.id)) ?? b;
  await afterConfirm({
    b: fresh,
    status: done.status,
    projectId: target!.projectId,
    enquiryId: target!.enquiryId,
    details: x.details,
    place: geo,
    how: 'online',
    duplicateOf: target!.duplicateOf,
  });
  return reply(done.status, target!.projectId, target!.enquiryId);
}

/* ── Changing a booking ──────────────────────────────────────────────────────── */

/** Move a booking to another start. Customers (their link) end up requested or confirmed by mode; staff always confirmed. */
export async function moveBooking(b: BookingRow, start: number, o: { by?: Staff | null }): Promise<Outcome> {
  const s = await getBookingSettings();
  if (!o.by && !s.enabled) return { status: 200, body: { closed: true } };
  if (!b.project_id || !b.enquiry_id) return { status: 409, body: { error: 'This booking can’t be moved.' } };
  const old = parseRange(b.onsite);
  let moved: { id: string; status: 'requested' | 'confirmed'; c: RawCand } | null = null;
  for (let attempt = 0; attempt < 3 && !moved; attempt++) {
    const offers = await offersFor({ postcode: b.postcode, type: b.survey_type, start, ignoreBookingId: b.id, ignoreProjectId: b.project_id, staff: !!o.by });
    if (!Array.isArray(offers)) return findFailOutcome(offers);
    if (!offers.length) break;
    let changed = false;
    for (const { sv, v, c, r } of offers) {
      const status = o.by || r.mode === 'instant' ? 'confirmed' : 'requested';
      const res = await slotTake(
        {
          surveyor_key: sv.key,
          surveyor_id: await surveyorProfileId(sv),
          status,
          survey_type: b.survey_type,
          minutes: r.minutes,
          start: new Date(c.start).toISOString(),
          end: new Date(c.end).toISOString(),
          postcode: b.postcode,
          lat: b.lat,
          lng: b.lng,
          address: b.address,
          source: b.source,
          project_id: b.project_id,
          enquiry_id: b.enquiry_id,
          replaces: b.id,
          booked_by: o.by?.id ?? null,
          would_confirm: r.wouldConfirm,
          expires_at: status === 'requested' ? await requestExpiry(c.day, s) : null,
        },
        v
      );
      if (res.ok) {
        moved = { id: res.id, status, c };
        break;
      }
      if (res.reason === 'missing') return UNAVAILABLE;
      if (res.reason === 'changed') {
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  if (!moved) {
    const days = await freshDays(b.postcode, b.survey_type, !!o.by, { bookingId: b.id, projectId: b.project_id });
    return { status: 409, body: { error: 'That time has just gone. Here are the latest times.', days } };
  }

  const nb = (await bookingById(moved.id)) as BookingRow;
  const from = old ? whenText(old.start) : 'its old time';
  const to = whenText(moved.c.start);
  const note = o.by ? `Survey moved by ${o.by.name} from ${from} to ${to}` : `Customer moved their survey from ${from} to ${to}`;
  await afterConfirm({ b: nb, status: moved.status, projectId: b.project_id, enquiryId: b.enquiry_id, how: o.by ? 'staff' : 'online', by: o.by, note: moved.status === 'confirmed' ? `📅 ${note}` : `${note} (waiting for you to confirm)` });
  if (!o.by && moved.status === 'confirmed') {
    await pushStaff({ projectId: b.project_id, surveyorKey: nb.surveyor_key, title: `Survey moved: ${to}`, body: note, href: `/admin/crm/${b.project_id}`, tag: `crm-${b.project_id}` });
  }
  return {
    status: 200,
    body: {
      ok: true,
      status: moved.status,
      start: new Date(moved.c.start).toISOString(),
      end: new Date(moved.c.end).toISOString(),
      label: `${longDayLabel(moved.c.day)}, around ${ukTime(moved.c.start)}`,
    },
  };
}

/** Cancel a booking (the job keeps its stage; its date is cleared in the same step). */
export async function cancelBooking(b: BookingRow, o: { by?: Staff | null; reason?: string | null }): Promise<Outcome> {
  const reason = (o.reason || '').trim().slice(0, 300);
  const res = await slotCancel(b.id, o.by ? `cancelled by ${o.by.name}${reason ? `: ${reason}` : ''}` : `cancelled by the customer${reason ? `: ${reason}` : ''}`);
  if (!res.ok) return res.reason === 'missing' ? UNAVAILABLE : { status: 409, body: { error: 'This booking was already cancelled.' } };
  const r = parseRange(b.onsite);
  if (b.project_id && b.enquiry_id) {
    const db = createAdminClient();
    await db
      .from('crm_surveys')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('project_id', b.project_id)
      .eq('status', 'booked')
      .then(
        () => null,
        () => null
      );
    const when = r ? whenText(r.start) : '';
    await logActivity({
      enquiryId: b.enquiry_id,
      projectId: b.project_id,
      kind: 'system',
      body: o.by ? `Survey cancelled by ${o.by.name} (${when})${reason ? `: ${reason}` : ''}` : `Customer cancelled their survey (${when})${reason ? `: ${reason}` : ''}`,
      byId: o.by?.id ?? null,
    }).catch(() => null);
    await setNextStep(b.project_id, 'Call to rebook the survey', !o.by);
    if (!o.by) {
      const { data: e } = await db.from('enquiries').select('name').eq('id', b.enquiry_id).maybeSingle();
      await pushStaff({ projectId: b.project_id, surveyorKey: b.surveyor_key, title: `Survey cancelled: ${e?.name || 'customer'} (${when})`, body: reason || 'Call to rebook', href: `/admin/crm/${b.project_id}`, tag: `crm-${b.project_id}` });
    }
    const pid = b.project_id;
    after(() => syncProjectCalendar(pid));
  }
  return { status: 200, body: { ok: true } };
}

/* ── Staff ───────────────────────────────────────────────────────────────────── */

/** Confirm a customer's request. Unless forced, checks it still fits the diary (something may have been added since). */
export async function staffConfirm(id: string, by: Staff, force = false): Promise<Outcome> {
  const b = await bookingById(id);
  if (!b) return { status: 404, body: { error: 'Not found' } };
  if (b.status === 'confirmed') return { status: 200, body: { ok: true, status: 'confirmed' } };
  if (b.status !== 'requested' || !b.project_id || !b.enquiry_id) return { status: 409, body: { error: 'This request has already been dealt with.' } };
  const range = parseRange(b.onsite);
  if (!range) return UNAVAILABLE;
  if (!force) {
    const r = await findSlots({
      postcode: b.postcode,
      type: b.survey_type,
      fresh: true,
      onlyDay: b.day,
      onlySurveyorKey: b.surveyor_key,
      ignoreBookingId: b.id,
      ignoreProjectId: b.project_id,
      staff: true,
    });
    if (r.ok && !r.raw.some((c) => c.start === range.start)) {
      const s = await getBookingSettings();
      const who = s.surveyors.find((v) => v.key === b.surveyor_key)?.name ?? 'The surveyor';
      return { status: 409, body: { error: 'clash', message: `${whenText(range.start)} no longer fits ${who}’s diary (something was added since). Confirm anyway?` } };
    }
  }
  const res = await slotConfirm(b.id, null, { status: 'confirmed', booked_by: by.id });
  if (!res.ok) {
    if (res.reason === 'missing') return UNAVAILABLE;
    return { status: 409, body: { error: res.reason === 'already_booked' ? 'This job already has a survey booked.' : 'This request has already been dealt with.' } };
  }
  const fresh = (await bookingById(b.id)) ?? b;
  await afterConfirm({ b: fresh, status: 'confirmed', projectId: b.project_id, enquiryId: b.enquiry_id, how: 'confirmed', by });
  return { status: 200, body: { ok: true, status: 'confirmed' } };
}

/** "Offer another time": the request is turned down; staff send the customer the message (we send nothing). */
export async function staffDecline(id: string, by: Staff): Promise<Outcome> {
  const b = await bookingById(id);
  if (!b || !b.project_id || !b.enquiry_id) return { status: 404, body: { error: 'Not found' } };
  if (b.status !== 'requested') return { status: 409, body: { error: 'This request has already been dealt with.' } };
  const res = await slotCancel(b.id, 'declined');
  if (!res.ok) return res.reason === 'missing' ? UNAVAILABLE : { status: 409, body: { error: 'This request has already been dealt with.' } };
  const db = createAdminClient();
  const { data: e } = await db.from('enquiries').select('*').eq('id', b.enquiry_id).maybeSingle();
  const range = parseRange(b.onsite);
  const token = await ensureBookingToken(b.project_id);
  const url = token ? bookingUrl(token) : null;
  const day = range ? WD_LONG[ymdDate(ukDate(range.start)).getUTCDay()] : 'that day';
  const first = firstName(e?.name as string) || 'there';
  const text = `Sorry ${first}, ${day} at ${range ? ukTime(range.start) : ''} doesn’t work for us after all. ${url ? `Please pick another time here: ${url}` : 'We’ll call you to find another time.'}`;
  await logActivity({ enquiryId: b.enquiry_id, projectId: b.project_id, kind: 'system', body: `Survey request turned down by ${by.name} (${range ? whenText(range.start) : ''}): offered another time`, byId: by.id }).catch(() => null);
  await clearRequestStep(b.project_id).catch(() => null);
  return {
    status: 200,
    body: { ok: true, text, url, phone: (e?.phone as string | null) ?? null, channel: await notifyChannel(b.enquiry_id), enquiryId: b.enquiry_id, projectId: b.project_id },
  };
}

/**
 * Staff book a time for a job (confirmed straight away). With `override` ("Book anyway") any start
 * is allowed unless it overlaps something in the diary; an all-day block asks again (`allDayOk`).
 * `postcode` is the one Find a time searched with (typed there when the job had none, or the survey
 * is somewhere else); it becomes the job's postcode once the time is taken.
 */
export async function staffBook(x: {
  projectId: string;
  start: number;
  type?: SurveyTypeKey | null;
  postcode?: string | null;
  surveyorKey?: string | null;
  override?: boolean;
  allDayOk?: boolean;
  /** Tell the customer: email (with a calendar file), WhatsApp and/or a text, each with the check-the-pin link. */
  notify?: Notify;
  by: Staff;
}): Promise<Outcome> {
  const s = await getBookingSettings();
  const db = createAdminClient();
  const { data } = await db.from('crm_projects').select('*').eq('id', x.projectId).maybeSingle();
  const p = data as ProjectRow | null;
  if (!p) return { status: 404, body: { error: 'Not found' } };
  if (p.stage === 'lost') return { status: 409, body: { error: 'This job is Lost.' } };
  if (!isSurveyType(x.type) && noSurveyNeeded(p)) return { status: 409, body: { error: NO_SURVEY } };
  const pc = x.postcode?.trim() || p.postcode;
  if (!pc) return { status: 400, body: { error: 'Enter the customer’s postcode first.' } };
  const geo = await lookupPostcode(pc);
  if (!isHit(geo)) return { status: 400, body: { error: POSTCODE_ERRORS[geo.error] } };
  const type: SurveyTypeKey = x.type && isSurveyType(x.type) ? x.type : isSurveyType(p.survey_type) ? p.survey_type : (surveyTypeFor(p.products ?? []) ?? 'solar');
  const minutes = s.durations[type];
  const existing = await liveBookingFor(p.id);
  const day = ukDate(x.start);
  let made: { id: string; sv: Surveyor; end: number } | null = null;
  let note: string | undefined;

  const row = (sv: Surveyor, surveyorId: string | null, end: number, extra: Record<string, unknown>) => ({
    surveyor_key: sv.key,
    surveyor_id: surveyorId,
    status: 'confirmed',
    survey_type: type,
    minutes,
    start: new Date(x.start).toISOString(),
    end: new Date(end).toISOString(),
    postcode: geo.postcode,
    lat: geo.ll.lat,
    lng: geo.ll.lng,
    address: p.address,
    source: 'staff',
    project_id: p.id,
    enquiry_id: p.enquiry_id,
    booked_by: x.by.id,
    replaces: existing?.id ?? null,
    ...extra,
  });

  if (!x.override) {
    for (let attempt = 0; attempt < 3 && !made; attempt++) {
      const offers = await offersFor({
        postcode: geo.postcode,
        type,
        start: x.start,
        ignoreBookingId: existing?.id,
        ignoreProjectId: p.id,
        staff: true,
        surveyorKey: x.surveyorKey || undefined,
      });
      if (!Array.isArray(offers)) return findFailOutcome(offers);
      if (!offers.length) break;
      let changed = false;
      for (const { sv, v, c } of offers) {
        const res = await slotTake(row(sv, await surveyorProfileId(sv), c.end, { would_confirm: true }), v);
        if (res.ok) {
          made = { id: res.id, sv, end: c.end };
          break;
        }
        if (res.reason === 'missing') return UNAVAILABLE;
        if (res.reason === 'changed') {
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
    if (!made) {
      const days = await freshDays(geo.postcode, type, true, { bookingId: existing?.id, projectId: p.id });
      return { status: 409, body: { error: 'That time doesn’t fit any more. Here are the latest times.', days } };
    }
  } else {
    const sv = s.surveyors.find((v) => v.key === x.surveyorKey) ?? s.surveyors[0];
    if (!sv) return { status: 400, body: { error: 'No surveyors are set up in booking settings.' } };
    const base = await basePlace(sv);
    if (!base) return UNAVAILABLE;
    const { hols } = await calendarRules(s);
    const end = x.start + minutes * MIN;
    for (let attempt = 0; attempt < 3 && !made; attempt++) {
      const v = await dayVersion(day);
      const diary = await loadDiary(sv, day, day, { s, base, hols, fresh: true, ignoreBookingId: existing?.id, ignoreProjectId: p.id });
      const items = itemsOnDay(diary.items, day);
      const allDay = items.find((i) => i.allDayBlock);
      if (allDay && !x.allDayOk) return { status: 409, body: { error: 'all_day', message: `${sv.name}’s diary is blocked all day (${allDay.label}). Book anyway?` } };
      const clash = items.find((i) => !i.allDayBlock && i.start < end && i.end > x.start);
      if (clash) return { status: 409, body: { error: `That overlaps “${clash.label}” (${ukTime(clash.start)}–${ukTime(clash.end)}). Pick another time.` } };
      const res = await slotTake(row(sv, await surveyorProfileId(sv), end, { overridden: true }), v);
      if (res.ok) made = { id: res.id, sv, end };
      else if (res.reason === 'missing') return UNAVAILABLE;
      else if (res.reason === 'overlap') return { status: 409, body: { error: 'That overlaps another booking. Pick another time.' } };
      else if (res.reason === 'already_booked') return { status: 409, body: { error: 'This job already has a survey booked.' } };
    }
    if (!made) return { status: 409, body: { error: 'The diary keeps changing. Please try again.' } };
    // Why it's outside the usual rules, in a few words.
    const why: string[] = [];
    const wd = weekday(day);
    if (wd === '6' || wd === '7' || !sv.hours[wd]) why.push(WEEKDAY_NAMES[wd]);
    const h = sv.hours[wd];
    if (h && (ukTime(x.start) < h.start || ukTime(end) > h.end)) why.push(`${ukTime(x.start)}–${ukTime(end)}`);
    const far = estimateBetween(base, placeFromHit(geo), s);
    if (far != null) why.push(`about ${Math.ceil(far / 5) * 5} min from home`);
    note = `📅 Booked by ${x.by.name} outside the usual rules (${why.join(', ') || 'more driving than usual'}): ${whenText(x.start)}–${ukTime(end)} (${typeShort(type)}, ${hrs(minutes)}) with ${sv.name}`;
  }
  // A postcode typed in Find a time becomes the job's, with its coordinates in the same update (so
  // the trigger keeps them; they need crm-v3.sql). Before the Outlook copy is made, so it has the place.
  if (normPostcode(p.postcode) !== normPostcode(geo.postcode)) {
    const where = { postcode: geo.postcode, updated_at: new Date().toISOString() };
    const full = await db.from('crm_projects').update({ ...where, site_lat: geo.ll.lat, site_lng: geo.ll.lng }).eq('id', p.id);
    if (full.error) await db.from('crm_projects').update(where).eq('id', p.id);
  }
  const b = await bookingById(made.id);
  if (!b) return UNAVAILABLE;
  await afterConfirm({ b, status: 'confirmed', projectId: p.id, enquiryId: p.enquiry_id, how: 'staff', by: x.by, note, auto: !x.notify });
  const notices = p.enquiry_id && x.notify ? await sendAppointmentNotices({ enquiryId: p.enquiry_id, projectId: p.id, surveyType: type, startMs: x.start, endMs: made.end, who: made.sv.name, notify: x.notify, by: x.by }) : [];
  return { status: 200, body: { ok: true, id: made.id, start: new Date(x.start).toISOString(), end: new Date(made.end).toISOString(), surveyor: made.sv.name, ...(notices.length ? { notices } : {}) } };
}

/** The customer's booking link and a ready-made WhatsApp message. */
export async function bookingLinkFor(projectId: string, by: Staff): Promise<Outcome> {
  const db = createAdminClient();
  const { data } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  const p = data as ProjectRow | null;
  if (!p) return { status: 404, body: { error: 'Not found' } };
  if (noSurveyNeeded(p)) return { status: 409, body: { error: NO_SURVEY } };
  const token = await ensureBookingToken(projectId);
  if (!token) return { status: 409, body: { error: 'Booking links are for jobs at Lead, Contacted or Survey booked.' } };
  const s = await getBookingSettings();
  const { data: e } = await db.from('enquiries').select('name').eq('id', p.enquiry_id).maybeSingle();
  const type = isSurveyType(p.survey_type) ? p.survey_type : (surveyTypeFor(p.products ?? []) ?? 'solar');
  const url = bookingUrl(token);
  const first = firstName(e?.name as string) || 'there';
  await logActivity({ enquiryId: p.enquiry_id, projectId, kind: 'system', body: 'Booking link created', byId: by.id }).catch(() => null);
  return {
    status: 200,
    body: { url, whatsappText: `Hi ${first}, you can pick a time for your free survey here: ${url}. It takes ${minutesWords(s.durations[type])}.` },
  };
}

/* ── The customer's own link (/book/{token}) ─────────────────────────────────── */

export type TokenView = {
  projectId: string;
  enquiryId: string;
  firstName: string;
  /** The customer's own details, to pre-fill "Is this right?" (it's their own private link). */
  name: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  /** Pre-selected from the products; null = ask. */
  type: SurveyTypeKey | null;
  booking: {
    id: string;
    status: 'requested' | 'confirmed';
    start: string;
    end: string;
    label: string;
    type: SurveyTypeKey;
    postcode: string;
    minutes: number;
  } | null;
  /** Online changes are allowed until changeNoticeHours before. */
  canChange: boolean;
  enabled: boolean;
};

/** What /book/{token} needs. Null if the link has expired or the job isn't bookable. */
export async function tokenView(token: string): Promise<TokenView | null> {
  const p = await projectByBookingToken(token);
  if (!p) return null;
  const s = await getBookingSettings();
  const { data: e } = await createAdminClient().from('enquiries').select('name, email, phone').eq('id', p.enquiry_id).maybeSingle();
  const live = await liveBookingFor(p.id).catch(() => null);
  const r = live ? parseRange(live.onsite) : null;
  // No booking, but a date on the job (set by staff): that's their survey, changed by calling us.
  const own = live ? null : await jobSurvey(p, s).catch(() => null);
  // Infrared, EV or LED only: nothing to book online (a survey they already have still shows).
  if (!live && !own && noSurveyNeeded(p)) return null;
  return {
    projectId: p.id,
    enquiryId: p.enquiry_id,
    firstName: firstName(e?.name as string),
    name: (e?.name as string | null) ?? '',
    email: (e?.email as string | null) ?? '',
    phone: (e?.phone as string | null) ?? '',
    address: p.address ?? '',
    postcode: p.postcode ?? '',
    type: isSurveyType(p.survey_type) ? p.survey_type : surveyTypeFor(p.products),
    booking:
      live && r && (live.status === 'requested' || live.status === 'confirmed')
        ? {
            id: live.id,
            status: live.status,
            start: new Date(r.start).toISOString(),
            end: new Date(r.end).toISOString(),
            label: `${longDayLabel(ukDate(r.start))}, around ${ukTime(r.start)}`,
            type: live.survey_type,
            postcode: live.postcode,
            minutes: live.minutes,
          }
        : own
          ? {
              id: `job-${p.id}`,
              status: 'confirmed',
              start: new Date(own.start).toISOString(),
              end: new Date(own.end).toISOString(),
              label: `${longDayLabel(ukDate(own.start))}, around ${ukTime(own.start)}`,
              type: own.type,
              postcode: p.postcode ?? '',
              minutes: own.minutes,
            }
          : null,
    // A date on the job with no booking behind it is changed by calling us, never online.
    canChange: !!r && r.start - Date.now() > s.advanced.changeNoticeHours * HOUR,
    enabled: s.enabled && s.surveyors.length > 0,
  };
}

/** The live booking a customer's link may change, or why not. */
export async function bookingForToken(token: string): Promise<{ b: BookingRow } | Outcome> {
  const p = await projectByBookingToken(token);
  if (!p) return { status: 404, body: { error: 'This link has expired. Message us on WhatsApp.' } };
  const b = await liveBookingFor(p.id);
  if (!b) return { status: 409, body: { error: 'There’s no survey booked on this link.' } };
  const r = parseRange(b.onsite);
  const s = await getBookingSettings();
  if (!r || r.start - Date.now() <= s.advanced.changeNoticeHours * HOUR) {
    return { status: 409, body: { error: `It’s too close to your survey to change it online. Please call us on ${OFFICE_PHONE}.` } };
  }
  return { b };
}

/** "Too far for online booking: call me." A new customer and job with a next step to call them. */
/**
 * A callback request. With no `mode` it is the old "you're outside the online booking area, call me" request.
 * With mode 'phone' or 'video' it is a customer choosing to speak to us that way instead of a home survey (the
 * website form's "How would you like to speak to us?"): no time slots, the team arranges it.
 */
export async function requestCallback(x: {
  name: string;
  phone: string;
  email?: string;
  postcode: string;
  type: SurveyTypeKey;
  source: string | null;
  mode?: 'phone' | 'video';
  when?: 'morning' | 'afternoon' | 'evening';
  reason?: 'quote';
}): Promise<Outcome> {
  if (x.name.trim().length < 2) return { status: 400, body: { error: 'Please enter your name.' } };
  if (!toWaId(x.phone)) return { status: 400, body: { error: 'Please check your phone number.' } };
  if (x.email && !EMAIL.test(x.email)) return { status: 400, body: { error: 'Please check your email address.' } };
  if (x.mode === 'video' && !x.email) return { status: 400, body: { error: 'Please enter your email so we can send the video link.' } };
  if (!normPostcode(x.postcode)) return { status: 400, body: { error: 'Please check your postcode.' } };
  const made = await createWebsiteCustomer(
    { name: x.name, email: x.email || '', phone: x.phone, address: '', postcode: x.postcode, optIn: false },
    x.type,
    x.source
  );
  if (!made) return UNAVAILABLE;
  const pc = spacedPostcode(normPostcode(x.postcode) as string);
  if (x.mode) {
    const way = x.mode === 'video' ? 'a video call' : 'a phone call';
    const quote = x.reason === 'quote' ? ' (quote consultation)' : '';
    const best = x.when ? `, best in the ${x.when}` : '';
    await logActivity({ enquiryId: made.enquiryId, projectId: made.projectId, kind: 'system', body: `Asked for ${way}${quote} about ${typeShort(x.type)}${best}` }).catch(() => null);
    await setNextStep(made.projectId, x.mode === 'video' ? `Arrange video call and email them the link${best}` : `Call them${best}`);
    await pushStaff({
      projectId: made.projectId,
      title: x.mode === 'video' ? `Arrange a video call with ${x.name}` : `Call ${x.name}`,
      body: `${pc}: asked for ${way}${quote}${best}`,
      href: `/admin/crm/${made.projectId}`,
    });
  } else {
    await logActivity({ enquiryId: made.enquiryId, projectId: made.projectId, kind: 'system', body: `Asked us to call to arrange a ${typeShort(x.type)} survey (outside the online booking area)` }).catch(() => null);
    await setNextStep(made.projectId, 'Call to arrange survey (outside online booking area)');
    await pushStaff({ projectId: made.projectId, title: `Call ${x.name} to arrange a survey`, body: `${pc}: outside the online booking area`, href: `/admin/crm/${made.projectId}` });
  }
  if (made.duplicateOf) {
    const { data: dup } = await createAdminClient().from('enquiries').select('name').eq('id', made.duplicateOf).maybeSingle();
    await logActivity({ enquiryId: made.enquiryId, projectId: made.projectId, kind: 'system', body: `Possible duplicate of ${dup?.name || 'another customer'}`, meta: { duplicate_of: made.duplicateOf } }).catch(() => null);
  }
  return { status: 200, body: { ok: true } };
}
