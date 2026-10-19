import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { installDayList } from '@/lib/bank-holidays';
import { calendarView, msConfigured, type CalEvent } from '@/lib/ms365';
import { surveyTypeFor, isSurveyType } from '@/lib/crm/stages';
import { addDays, dayRange, londonSlot, ukDate, type Item, type Place } from './engine';
import { isHit, lookupPostcode, normPostcode, placeFromHit, placeFromStored, prefetchPostcodes, resolvePlace, POSTCODE_IN_TEXT } from './geo';
import type { BookingSettings, Surveyor } from './settings';

/**
 * What's in a surveyor's day: Outlook (once Microsoft 365 is connected), live bookings and holds,
 * survey dates in the CRM, installs, his own diary entries, bank holidays and closed days. Each with
 * a place, so drive times can be worked out. Read-only.
 */

export type DiaryKind = 'outlook' | 'booking' | 'crm_survey' | 'install' | 'entry' | 'closed';
export type DiaryItem = Item & {
  kind: DiaryKind;
  /** For staff only (never sent to customers). */
  label: string;
  private?: boolean;
  /** Our own Outlook copy, moved in Outlook: kept as busy at Outlook's time too. */
  movedInOutlook?: boolean;
  projectId?: string;
  bookingId?: string;
  entryId?: string;
  eventId?: string;
  /** Booking status: held | requested | confirmed. */
  status?: string;
  postcode?: string;
  /** No location on this Outlook appointment (treated as home, padded). */
  noLocation?: boolean;
  /** Postcode with no grid reference: placed at the area's centre. */
  approx?: boolean;
};
export type Diary = { items: DiaryItem[]; notBlocking: DiaryItem[]; outlookOk: boolean; outlookError?: string };

export const ENTRY_KINDS = ['site_visit', 'install', 'meeting', 'personal', 'other'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  site_visit: 'Site visit',
  install: 'Install',
  meeting: 'Meeting',
  personal: 'Personal',
  other: 'Other',
};

/* ── Rows (the booking tables are read with select('*'): columns may not exist yet) ── */

export type BookingRow = {
  id: string;
  project_id: string | null;
  enquiry_id: string | null;
  surveyor_key: string;
  surveyor_id: string | null;
  status: 'held' | 'requested' | 'confirmed' | 'cancelled' | 'expired';
  survey_type: 'solar' | 'ashp' | 'solar_ashp';
  minutes: number;
  onsite: string;
  day: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  source: 'link' | 'website' | 'staff';
  expires_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  booked_by: string | null;
  overridden: boolean;
  would_confirm: boolean | null;
  duplicate_of: string | null;
  reminded_at: string | null;
  client_ip: string | null;
  created_at: string;
};

export type EntryRow = {
  id: string;
  surveyor_key: string;
  kind: EntryKind;
  title: string;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  day_from: string | null;
  day_to: string | null;
  where_kind: 'address' | 'home' | 'online';
  address: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  project_id: string | null;
  outlook_event_id: string | null;
  outlook_mailbox: string | null;
  outlook_hash: string | null;
  calendar_dirty_at: string | null;
  calendar_claim_at: string | null;
  calendar_error: string | null;
  calendar_error_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The crm_projects columns booking uses (most added by survey-booking.sql / crm-v3.sql). */
export type ProjectRow = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  owner_id: string | null;
  products: string[] | null;
  address: string | null;
  postcode: string | null;
  survey_at: string | null;
  install_at: string | null;
  install_days?: number | null;
  install_team?: string[] | null;
  site_lat?: number | null;
  site_lng?: number | null;
  survey_type?: string | null;
  survey_minutes?: number | null;
  survey_mailbox?: string | null;
  survey_booking_id?: string | null;
  survey_event_id?: string | null;
  survey_event_mailbox?: string | null;
  survey_event_hash?: string | null;
  survey_event_at?: string | null;
  install_event_ids?: string[] | null;
  install_event_mailbox?: string | null;
  install_event_hash?: string | null;
  install_event_until?: string | null;
  calendar_dirty_at?: string | null;
  calendar_claim_at?: string | null;
  calendar_error?: string | null;
  calendar_error_at?: string | null;
  booking_token?: string | null;
  project_ref?: string | null;
  scaffold_up_on?: string | null;
  scaffold_down_on?: string | null;
  next_step?: string | null;
  next_step_at?: string | null;
};

/** PostgREST's tstzrange text, e.g. ["2026-10-21 09:00:00+00","2026-10-21 10:00:00+00") → epoch ms. */
export function parseRange(r: string | null | undefined): { start: number; end: number } | null {
  const m = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(String(r || '').trim());
  if (!m) return null;
  const ts = (x: string) => Date.parse(x.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
  const start = ts(m[1]);
  const end = ts(m[2]);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

export const LIVE = ['held', 'requested', 'confirmed'] as const;
/** A booking that takes time: requested, confirmed, or a hold that hasn't lapsed. */
export const isLive = (b: Pick<BookingRow, 'status' | 'expires_at'>, now = Date.now()) =>
  b.status === 'requested' || b.status === 'confirmed' || (b.status === 'held' && !!b.expires_at && Date.parse(b.expires_at) > now);

export const surname = (name: string | null | undefined) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Customer';
};
export const firstName = (name: string | null | undefined) => String(name || '').trim().split(/\s+/)[0] || '';

/** The survey length for a job: its own, else the settings' length for its type. */
export function surveyMinutesFor(p: Pick<ProjectRow, 'survey_minutes' | 'survey_type' | 'products'>, s: BookingSettings): number {
  if (p.survey_minutes && p.survey_minutes > 0) return p.survey_minutes;
  const t = isSurveyType(p.survey_type) ? p.survey_type : surveyTypeFor(p.products ?? []) ?? 'solar';
  return s.durations[t];
}

/* ── Outlook (cached 3 minutes per mailbox and range) ─────────────────────────── */

const outlookCache = new Map<string, { at: number; events: CalEvent[] }>();

async function outlookEvents(mailbox: string, from: number, to: number, o: { fresh?: boolean; signal?: AbortSignal }) {
  const key = `${mailbox}|${from}|${to}`;
  const hit = outlookCache.get(key);
  if (!o.fresh && hit && Date.now() - hit.at < 3 * 60_000) return hit.events;
  const events = await calendarView(mailbox, new Date(from), new Date(to), { signal: o.signal });
  if (outlookCache.size > 200) outlookCache.clear();
  outlookCache.set(key, { at: Date.now(), events });
  return events;
}

/** Postcodes the Outlook appointments mention, looked up together first. */
function outlookPostcodes(events: CalEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    for (const t of [e.location?.postalCode, e.location?.displayName, e.subject]) {
      const m = t ? POSTCODE_IN_TEXT.exec(t) : null;
      if (m) out.push(`${m[1]}${m[2]}`);
    }
  }
  return out;
}

const allDayItems = (days: string[], base: Place, make: (day: string) => Omit<DiaryItem, 'start' | 'end' | 'place' | 'isSurvey' | 'allDayBlock'>): DiaryItem[] =>
  days.map((day) => ({
    ...make(day),
    start: londonSlot(day, '00:00'),
    end: londonSlot(addDays(day, 1), '00:00'),
    place: base,
    isSurvey: false,
    allDayBlock: true,
  }));

/** The surveyor's profile id (profiles.email), for install teams and bookings. */
export async function surveyorProfileId(sv: Surveyor): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('profiles').select('id').ilike('email', sv.profileEmail).limit(1);
    return (data?.[0]?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything in the surveyor's diary from `fromDay` to `toDay` (UK dates, inclusive). `base` is
 * their home Place; `hols` the bank holidays to block (empty to skip them).
 */
export async function loadDiary(
  sv: Surveyor,
  fromDay: string,
  toDay: string,
  o: {
    s: BookingSettings;
    base: Place;
    hols: ReadonlySet<string>;
    fresh?: boolean;
    ignoreBookingId?: string | null;
    signal?: AbortSignal;
  }
): Promise<Diary> {
  const { s, base } = o;
  const db = createAdminClient();
  const rangeEnd = londonSlot(addDays(toDay, 1), '00:00');
  const wideStart = londonSlot(addDays(fromDay, -1), '00:00');
  const wideEnd = londonSlot(addDays(toDay, 2), '00:00');
  const days = dayRange(fromDay, toDay);
  const isFirst = s.surveyors[0]?.key === sv.key;
  const items: DiaryItem[] = [];
  const notBlocking: DiaryItem[] = [];
  const iso = (ms: number) => new Date(ms).toISOString();
  const safe = <T,>(p: PromiseLike<{ data: T[] | null }>) => Promise.resolve(p).then((r) => r.data ?? [], () => [] as T[]);

  const outlook: Promise<{ events: CalEvent[]; ok: boolean; error?: string }> = msConfigured()
    ? outlookEvents(sv.key, wideStart, wideEnd, o).then(
        (events) => ({ events, ok: true }),
        (e: unknown) => ({ events: [], ok: false, error: e instanceof Error ? e.message : 'Outlook couldn’t be read' })
      )
    : Promise.resolve({ events: [], ok: false, error: 'Microsoft 365 isn’t connected' });

  const [bookings, surveys, installs, timedEntries, allDayEntries, profileId, cal] = await Promise.all([
    safe<BookingRow>(
      db
        .from('survey_bookings')
        .select('*')
        .eq('surveyor_key', sv.key)
        .in('status', [...LIVE])
        .gte('day', addDays(fromDay, -1))
        .lte('day', addDays(toDay, 1))
    ),
    safe<ProjectRow>(
      db.from('crm_projects').select('*').gte('survey_at', iso(wideStart)).lt('survey_at', iso(wideEnd)).neq('stage', 'lost').limit(500)
    ),
    s.advanced.installBlocks === 'never'
      ? Promise.resolve([] as ProjectRow[])
      : safe<ProjectRow>(
          db
            .from('crm_projects')
            .select('*')
            .gte('install_at', iso(londonSlot(addDays(fromDay, -50), '00:00')))
            .lt('install_at', iso(rangeEnd))
            .neq('stage', 'lost')
            .limit(500)
        ),
    safe<EntryRow>(
      db
        .from('diary_entries')
        .select('*')
        .eq('surveyor_key', sv.key)
        .is('deleted_at', null)
        .eq('all_day', false)
        .lt('starts_at', iso(wideEnd))
        .gt('ends_at', iso(wideStart))
        .limit(500)
    ),
    safe<EntryRow>(
      db
        .from('diary_entries')
        .select('*')
        .eq('surveyor_key', sv.key)
        .is('deleted_at', null)
        .eq('all_day', true)
        .lte('day_from', toDay)
        .gte('day_to', fromDay)
        .limit(500)
    ),
    surveyorProfileId(sv),
    outlook,
  ]);

  // Customer names for labels (staff only).
  const enquiryIds = [...new Set([...bookings.map((b) => b.enquiry_id), ...surveys.map((p) => p.enquiry_id), ...installs.map((p) => p.enquiry_id)])].filter(
    (x): x is string => !!x
  );
  const names = new Map<string, string>();
  for (let i = 0; i < enquiryIds.length; i += 100) {
    const { data } = await db.from('enquiries').select('id, name').in('id', enquiryIds.slice(i, i + 100));
    for (const e of data ?? []) names.set(e.id as string, (e.name as string) || '');
  }

  await prefetchPostcodes([
    ...bookings.filter((b) => b.lat == null).map((b) => b.postcode),
    ...surveys.filter((p) => p.site_lat == null).map((p) => p.postcode),
    ...timedEntries.filter((e) => e.lat == null).map((e) => e.postcode),
    ...outlookPostcodes(cal.events),
  ]);

  /* 2. Bookings and live holds. */
  const now = Date.now();
  const liveBookings = new Map<string, number>(); // id → start
  for (const b of bookings) {
    if (b.id === o.ignoreBookingId || !isLive(b, now)) continue;
    const r = parseRange(b.onsite);
    if (!r || r.end <= wideStart || r.start >= wideEnd) continue;
    liveBookings.set(b.id, r.start);
    const place = (await placeFromStored({ lat: b.lat, lng: b.lng, postcode: b.postcode })) ?? { ...base, label: 'No location', unknown: true, home: false };
    const who = b.enquiry_id ? surname(names.get(b.enquiry_id)) : '';
    items.push({
      id: `booking:${b.id}`,
      kind: 'booking',
      start: r.start,
      end: r.end,
      place,
      isSurvey: true,
      label: b.status === 'held' ? 'Held online (not booked yet)' : b.status === 'requested' ? `Survey request: ${who}` : `Survey: ${who}`,
      bookingId: b.id,
      projectId: b.project_id ?? undefined,
      status: b.status,
      postcode: b.postcode,
    });
  }

  /* 3. Survey dates in the CRM without a live booking at that time. */
  for (const p of surveys) {
    if (!p.survey_at) continue;
    const mailbox = (p.survey_mailbox || '').toLowerCase();
    if (mailbox ? mailbox !== sv.key : !isFirst) continue;
    const start = Date.parse(p.survey_at);
    if (p.survey_booking_id && (p.survey_booking_id === o.ignoreBookingId || liveBookings.get(p.survey_booking_id) === start)) continue;
    const end = start + surveyMinutesFor(p, s) * 60_000;
    const place = (await placeFromStored({ lat: p.site_lat, lng: p.site_lng, postcode: p.postcode })) ?? { ...base, label: 'No location', unknown: true, home: false };
    items.push({
      id: `survey:${p.id}`,
      kind: 'crm_survey',
      start,
      end,
      place,
      isSurvey: true,
      label: `Survey: ${surname(names.get(p.enquiry_id))}`,
      projectId: p.id,
      postcode: p.postcode ?? undefined,
      noLocation: !!place.unknown,
    });
  }

  /* 4. Installs: each working day blocks the day (when he's on the team, or it has no team). */
  for (const p of installs) {
    if (!p.install_at) continue;
    const team = Array.isArray(p.install_team) ? p.install_team : [];
    const blocks = s.advanced.installBlocks === 'always' || (s.advanced.installBlocks === 'if_on_team_or_empty' && (!team.length || (!!profileId && team.includes(profileId))));
    const list = installDayList(ukDate(Date.parse(p.install_at)), p.install_days ?? 1, o.hols).filter((d) => d >= fromDay && d <= toDay);
    const made = allDayItems(list, base, (day) => ({
      id: `install:${p.id}:${day}`,
      kind: 'install',
      label: `Install: ${surname(names.get(p.enquiry_id))}`,
      projectId: p.id,
      postcode: p.postcode ?? undefined,
    }));
    (blocks ? items : notBlocking).push(...made);
  }

  /* 5. His own diary entries. */
  for (const e of timedEntries) {
    if (!e.starts_at || !e.ends_at) continue;
    let place: Place;
    if (e.where_kind === 'home') place = base;
    else if (e.where_kind === 'online') place = { ll: null, label: 'Online', online: true };
    else place = (await placeFromStored({ lat: e.lat, lng: e.lng, postcode: e.postcode })) ?? { ...base, label: 'No location', unknown: true, home: false };
    items.push({
      id: `entry:${e.id}`,
      kind: 'entry',
      start: Date.parse(e.starts_at),
      end: Date.parse(e.ends_at),
      place,
      isSurvey: false,
      label: `${ENTRY_KIND_LABEL[e.kind] ?? 'Busy'}${e.title ? `: ${e.title}` : ''}`,
      entryId: e.id,
      projectId: e.project_id ?? undefined,
      postcode: e.postcode ?? undefined,
    });
  }
  for (const e of allDayEntries) {
    if (!e.day_from || !e.day_to) continue;
    const list = dayRange(e.day_from < fromDay ? fromDay : e.day_from, e.day_to > toDay ? toDay : e.day_to);
    items.push(
      ...allDayItems(list, base, (day) => ({
        id: `entry:${e.id}:${day}`,
        kind: 'entry',
        label: `${ENTRY_KIND_LABEL[e.kind] ?? 'Busy'}${e.title ? `: ${e.title}` : ''} (all day)`,
        entryId: e.id,
        projectId: e.project_id ?? undefined,
      }))
    );
  }

  /* 6. Bank holidays and closed days. */
  const closed = new Set(s.closedDates);
  items.push(
    ...allDayItems(
      days.filter((d) => o.hols.has(d) || closed.has(d)),
      base,
      (day) => ({ id: `closed:${day}`, kind: 'closed', label: o.hols.has(day) ? 'Bank holiday' : 'Closed' })
    )
  );

  /* 1. Outlook. */
  if (cal.ok && cal.events.length) {
    const ids = cal.events.map((e) => e.id);
    // Our own copies stand for CRM items: find which events are ours and what time the CRM says.
    const ours = new Map<string, { crmStart: number | null; written: number | null; dirty: boolean; projectId?: string; entryId?: string }>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const [byS, byI, byE] = await Promise.all([
        safe<ProjectRow>(db.from('crm_projects').select('*').in('survey_event_id', chunk)),
        safe<ProjectRow>(
          db.from('crm_projects').select('*').overlaps('install_event_ids', chunk)
        ),
        safe<EntryRow>(db.from('diary_entries').select('*').in('outlook_event_id', chunk)),
      ]);
      for (const p of byS)
        if (p.survey_event_id)
          ours.set(p.survey_event_id, {
            crmStart: p.survey_at && p.stage !== 'lost' ? Date.parse(p.survey_at) : null,
            written: p.survey_event_at ? Date.parse(p.survey_event_at) : null,
            dirty: !!p.calendar_dirty_at,
            projectId: p.id,
          });
      for (const p of byI) for (const id of p.install_event_ids ?? []) ours.set(id, { crmStart: null, written: null, dirty: true, projectId: p.id });
      for (const e of byE)
        if (e.outlook_event_id)
          ours.set(e.outlook_event_id, {
            crmStart: e.deleted_at || e.all_day || !e.starts_at ? null : Date.parse(e.starts_at),
            written: null,
            dirty: !!e.calendar_dirty_at,
            entryId: e.id,
          });
    }

    for (const ev of cal.events) {
      if (ev.isCancelled || ev.response === 'declined') continue;
      const priv = ev.sensitivity === 'private' || ev.sensitivity === 'confidential';
      const label = priv ? 'Private' : s.advanced.showSubjects ? ev.subject || 'Busy' : 'Busy';
      const mine = ours.get(ev.id);
      if (mine || ev.transactionId?.startsWith('hx-')) {
        // Moved in Outlook: our copy's time isn't the time we wrote (or, in sync, the CRM's time).
        const ref = mine?.written ?? (mine && !mine.dirty ? mine.crmStart : null);
        if (!mine || ev.isAllDay || ref == null || Math.abs(ev.start.getTime() - ref) <= 60_000) continue;
        if (ev.end.getTime() <= wideStart || ev.start.getTime() >= wideEnd) continue;
        items.push({
          id: `outlook:${ev.id}`,
          kind: 'outlook',
          start: ev.start.getTime(),
          end: ev.end.getTime(),
          place: await resolvePlace(ev, base),
          isSurvey: false, // the CRM item already counts as the survey
          label: `Moved in Outlook: ${label}`,
          movedInOutlook: true,
          eventId: ev.id,
          projectId: mine.projectId,
          entryId: mine.entryId,
        });
        continue;
      }
      if (ev.isAllDay) {
        const list = ev.allDayFrom && ev.allDayTo ? dayRange(ev.allDayFrom, addDays(ev.allDayTo, -1)).filter((d) => d >= fromDay && d <= toDay) : [];
        const make = (day: string) => ({ id: `outlook:${ev.id}:${day}`, kind: 'outlook' as const, label: `${label} (Outlook, all day)`, private: priv, eventId: ev.id });
        if (ev.showAs === 'free') notBlocking.push(...allDayItems(list, base, make));
        else if (ev.showAs === 'workingElsewhere' || (ev.showAs === 'tentative' && !s.advanced.tentativeBlocks)) continue;
        else items.push(...allDayItems(list, base, make));
        continue;
      }
      if (ev.showAs === 'free' || ev.showAs === 'workingElsewhere' || (ev.showAs === 'tentative' && !s.advanced.tentativeBlocks)) continue;
      if (ev.end.getTime() <= wideStart || ev.start.getTime() >= wideEnd) continue;
      const place = await resolvePlace(ev, base);
      items.push({
        id: `outlook:${ev.id}`,
        kind: 'outlook',
        start: ev.start.getTime(),
        end: ev.end.getTime(),
        place,
        isSurvey: ev.categories.some((c) => c.toLowerCase() === 'heliaxis survey'),
        label,
        private: priv,
        eventId: ev.id,
        noLocation: !!place.unknown,
      });
    }
  }

  const inRange = (i: DiaryItem) => i.end > wideStart && i.start < wideEnd;
  return {
    items: items.filter(inRange).sort((a, b) => a.start - b.start || a.end - b.end),
    notBlocking: notBlocking.sort((a, b) => a.start - b.start),
    outlookOk: cal.ok,
    ...(cal.error ? { outlookError: cal.error } : {}),
  };
}

/** The items on one UK day (anything overlapping it). */
export function itemsOnDay(items: DiaryItem[], day: string): DiaryItem[] {
  const a = londonSlot(day, '00:00');
  const b = londonSlot(addDays(day, 1), '00:00');
  return items.filter((i) => i.end > a && i.start < b);
}

/** A postcode as a Place (for the customer or a diary entry), or why not. */
export async function placeForPostcode(pc: string): Promise<{ place: Place; approx: boolean } | { error: 'not_found' | 'ni' | 'invalid' | 'unavailable' }> {
  const k = normPostcode(pc);
  const hit = await lookupPostcode(k);
  if (!isHit(hit)) return hit;
  return { place: placeFromHit(hit), approx: !!hit.approx };
}
