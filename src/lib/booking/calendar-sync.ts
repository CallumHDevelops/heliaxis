import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { dayRuns, installDayList, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import {
  CalendarNotFound,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  mailbox as msMailbox,
  msConfigured,
  updateCalendarEvent,
  type CalWrite,
} from '@/lib/ms365';
import { logActivity, siteUrl } from '@/lib/crm/server';
import { isSurveyType, productLabel, surveyTypeFor, surveyTypeLabel } from '@/lib/crm/stages';
import { addDays, londonSlot } from './engine';
import { ENTRY_KIND_LABEL, surveyMinutesFor, type EntryRow, type ProjectRow } from './diary';
import { getBookingSettings } from './settings-server';
import type { BookingSettings } from './settings';

/**
 * The Outlook copy. The database is the source of truth: survey dates, installs and his own diary
 * entries are written to Outlook by this sync (for dates set or changed after Microsoft 365 is
 * connected: the triggers mark them dirty), never read back as extra appointments. Anything marked
 * before then goes in the one-off "Copy these dates into Outlook" list instead, and is copied only
 * when ticked. Past events are history: never edited or deleted. A 2-minute claim stops two runs
 * writing the same job.
 */

const MIN = 60_000;
const CLAIM_MS = 2 * MIN;
const RETRY_MS = 15 * MIN;
const PAST_MS = 12 * 60 * MIN;
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso = (ms: number) => new Date(ms).toISOString();

type Ctx = { s: BookingSettings; hols: Set<string>; now: number };
type Customer = { name: string; email: string | null; phone: string | null };

async function customerOf(enquiryId: string): Promise<Customer> {
  const { data } = await createAdminClient().from('enquiries').select('name, email, phone').eq('id', enquiryId).maybeSingle();
  return { name: (data?.name as string) || 'Customer', email: (data?.email as string | null) ?? null, phone: (data?.phone as string | null) ?? null };
}

const where = (p: Pick<ProjectRow, 'address' | 'postcode'>): CalWrite['location'] => {
  const text = [p.address, p.postcode].filter(Boolean).join(', ');
  return text ? { displayName: text, street: p.address || undefined, postalCode: p.postcode || undefined } : undefined;
};

/**
 * "Leave it out of Outlook" (unticked in the Copy these dates list), kept in the copy's empty hash
 * column. The sync makes no copy while it matches, so editing the job's title or address doesn't copy
 * it after all; a change to the date itself does.
 */
const SKIP = 'skip:';
const skipSurvey = (p: Pick<ProjectRow, 'survey_at'>) => (p.survey_at ? `${SKIP}${Date.parse(p.survey_at)}` : null);
const skipInstall = (p: Pick<ProjectRow, 'install_at' | 'install_days'>) => (p.install_at ? `${SKIP}${Date.parse(p.install_at)}|${p.install_days ?? 1}` : null);
const skipEntry = (e: Pick<EntryRow, 'all_day' | 'starts_at' | 'ends_at' | 'day_from' | 'day_to'>) =>
  `${SKIP}${e.all_day ? `${e.day_from}|${e.day_to}` : `${Date.parse(e.starts_at || '')}|${Date.parse(e.ends_at || '')}`}`;
const surveySkipped = (p: ProjectRow) => !p.survey_event_id && !!p.survey_event_hash && p.survey_event_hash === skipSurvey(p);
const installSkipped = (p: ProjectRow) => !(p.install_event_ids ?? []).length && !!p.install_event_hash && p.install_event_hash === skipInstall(p);
const entrySkipped = (e: EntryRow) => !e.outlook_event_id && !!e.outlook_hash && e.outlook_hash === skipEntry(e);

/** A transaction id per change, so a retry after a timeout can't make a second copy. */
const txn = (kind: 's' | 'i' | 'd', id: string, h: string, stamp: string | null | undefined, k?: number) =>
  `hx-${kind}-${id}-${h.slice(0, 10)}-${(Date.parse(stamp || '') || 0).toString(36)}${k === undefined ? '' : `-${k}`}`;

/* ── Jobs ────────────────────────────────────────────────────────────────────── */

async function syncSurvey(p: ProjectRow, c: Customer, ctx: Ctx): Promise<Partial<ProjectRow>> {
  const { s, now } = ctx;
  const patch: Partial<ProjectRow> = {};
  let eventId = p.survey_event_id ?? null;
  const evMailbox = p.survey_event_mailbox || '';
  const evAt = p.survey_event_at ? Date.parse(p.survey_event_at) : null;
  const clear = () => Object.assign(patch, { survey_event_id: null, survey_event_mailbox: null, survey_event_hash: null, survey_event_at: null });
  // An event for a survey that's over is history: forget it (it stays in Outlook).
  if (eventId && evAt != null && evAt < now - PAST_MS) {
    eventId = null;
    clear();
  }
  const future = eventId && (evAt == null || evAt > now);

  const start = p.survey_at && p.stage !== 'lost' ? Date.parse(p.survey_at) : null;
  if (start == null || start < now - PAST_MS) {
    // No survey (or it was moved into the past): remove our future copy; never copy past dates.
    if (eventId && future) await deleteCalendarEvent(evMailbox, eventId);
    if (eventId) clear();
    return patch;
  }
  if (!eventId && surveySkipped(p)) return patch; // left out of Outlook in the list
  const type = isSurveyType(p.survey_type) ? p.survey_type : (surveyTypeFor(p.products ?? []) ?? 'solar');
  const minutes = surveyMinutesFor(p, s);
  let how = 'Booked by staff';
  if (p.survey_booking_id) {
    const { data: b } = await createAdminClient().from('survey_bookings').select('source, overridden').eq('id', p.survey_booking_id).maybeSingle();
    if (b) how = b.source === 'staff' ? (b.overridden ? 'Booked by staff (outside the usual rules)' : 'Booked by staff') : 'Booked online';
  }
  const mailbox = (p.survey_mailbox || s.surveyors[0]?.key || msMailbox()).toLowerCase();
  const want: CalWrite = {
    subject: `Survey: ${c.name}${p.postcode ? ` (${p.postcode})` : ''} · ${surveyTypeLabel(type)}`,
    start: new Date(start),
    end: new Date(start + minutes * MIN),
    location: where(p),
    body: [
      c.phone ? `Phone: ${c.phone}` : '',
      c.email ? `Email: ${c.email}` : '',
      (p.products ?? []).length ? `Interested in: ${(p.products ?? []).map(productLabel).join(', ')}` : '',
      `${how}.`,
      `In the CRM: ${siteUrl()}/admin/crm/${p.id}`,
    ]
      .filter(Boolean)
      .join('\n'),
    categories: ['Heliaxis survey'],
    showAs: 'busy',
  };
  const h = hash({ mailbox, ...want });
  if (eventId && h === p.survey_event_hash && evMailbox === mailbox) return patch;

  // Only an event still to come is moved or replaced; one that has started stays as it is.
  let id: string | null = null;
  if (eventId && future && evMailbox === mailbox) {
    try {
      await updateCalendarEvent(mailbox, eventId, want);
      id = eventId;
    } catch (e) {
      if (!(e instanceof CalendarNotFound)) throw e; // deleted in Outlook: make it again
    }
  } else if (eventId && future) {
    await deleteCalendarEvent(evMailbox, eventId);
  }
  id ??= (await createCalendarEvent(mailbox, { ...want, transactionId: txn('s', p.id, h, p.calendar_dirty_at) })).id;
  return { ...patch, survey_event_id: id, survey_event_mailbox: mailbox, survey_event_hash: h, survey_event_at: iso(start) };
}

async function syncInstall(p: ProjectRow, c: Customer, ctx: Ctx): Promise<Partial<ProjectRow>> {
  const { s, hols, now } = ctx;
  const today = ukDay(now);
  const oldIds = p.install_event_ids ?? [];
  if (installSkipped(p)) return {}; // left out of Outlook in the list
  const oldMailbox = p.install_event_mailbox || '';
  const mailbox = (s.advanced.installMailbox || msMailbox()).toLowerCase();
  const days = p.install_at && p.stage !== 'lost' ? installDayList(ukDay(p.install_at), p.install_days ?? 1, hols) : [];
  const runs = dayRuns(days);
  const futureRuns = runs.filter((r) => r.toExclusive > today);

  let want: Omit<CalWrite, 'allDay'> | null = null;
  if (futureRuns.length) {
    const db = createAdminClient();
    const team = p.install_team ?? [];
    const { data: people } = team.length ? await db.from('profiles').select('id, full_name, email').in('id', team) : { data: [] };
    const names = (people ?? []).map((x) => (x.full_name as string) || (x.email as string)).filter(Boolean);
    const n = days.length;
    want = {
      subject: `Install: ${c.name}${p.postcode ? ` (${p.postcode})` : ''} · ${(p.products ?? []).map(productLabel).join(', ') || 'Install'}${n > 1 ? ` · ${n} working days` : ''}`,
      location: where(p),
      body: [
        names.length ? `Team: ${names.join(', ')}` : 'Team: not chosen yet',
        p.scaffold_up_on ? `Scaffold up: ${p.scaffold_up_on}` : '',
        p.scaffold_down_on ? `Scaffold down: ${p.scaffold_down_on}` : '',
        c.phone ? `Customer: ${c.phone}` : '',
        `In the CRM: ${siteUrl()}/admin/crm/${p.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
      categories: ['Heliaxis install'],
      showAs: 'busy',
    };
  }
  const h = want ? hash({ mailbox, runs: futureRuns, ...want }) : null;
  if (h && h === p.install_event_hash && oldMailbox === mailbox && oldIds.length === futureRuns.length) return {};
  if (!want && !oldIds.length) return {};

  // Which of our old events are still to come (past ones are history and are left alone).
  const futureOld: string[] = [];
  for (const id of oldIds) {
    if (!oldMailbox) break;
    const ev = await getCalendarEvent(oldMailbox, id);
    if (ev && (ev.allDayTo ?? ukDay(ev.end.getTime())) > today) futureOld.push(id);
  }
  const reuse = oldMailbox === mailbox ? [...futureOld] : [];
  for (const id of oldMailbox === mailbox ? futureOld.slice(futureRuns.length) : futureOld) await deleteCalendarEvent(oldMailbox, id);

  const ids: string[] = [];
  for (const [k, run] of futureRuns.entries()) {
    const body = { ...(want as CalWrite), allDay: run };
    const old = reuse[k];
    let id: string | null = null;
    if (old) {
      try {
        await updateCalendarEvent(mailbox, old, body);
        id = old;
      } catch (e) {
        if (!(e instanceof CalendarNotFound)) throw e;
      }
    }
    id ??= (await createCalendarEvent(mailbox, { ...body, transactionId: txn('i', p.id, h || '', p.calendar_dirty_at, k) })).id;
    ids.push(id);
  }
  const last = futureRuns[futureRuns.length - 1];
  return {
    install_event_ids: ids,
    install_event_mailbox: ids.length ? mailbox : null,
    install_event_hash: ids.length ? h : null,
    install_event_until: last ? addDays(last.toExclusive, -1) : null,
  };
}

async function syncProject(p: ProjectRow, ctx: Ctx): Promise<void> {
  const db = createAdminClient();
  const c = await customerOf(p.enquiry_id);
  try {
    const patch = { ...(await syncSurvey(p, c, ctx)), ...(await syncInstall(p, c, ctx)) };
    await db
      .from('crm_projects')
      .update({ ...patch, calendar_error: null, calendar_error_at: null })
      .eq('id', p.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Outlook error';
    await db.from('crm_projects').update({ calendar_error: message, calendar_error_at: iso(ctx.now) }).eq('id', p.id);
    if (message !== p.calendar_error) {
      await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'system', body: `Couldn’t update Outlook: ${message}` }).catch(() => null);
    }
    throw e;
  }
}

/* ── Diary entries ───────────────────────────────────────────────────────────── */

async function syncEntry(e: EntryRow, ctx: Ctx): Promise<void> {
  const db = createAdminClient();
  const { now } = ctx;
  const endMs = e.all_day ? Date.parse(`${e.day_to}T23:59:59Z`) : Date.parse(e.ends_at || '');
  const past = Number.isFinite(endMs) && endMs < now - PAST_MS;
  // Like surveys: a copy that has started is history, never edited or deleted.
  const startMs = e.all_day ? (e.day_from ? londonSlot(e.day_from, '00:00') : NaN) : Date.parse(e.starts_at || '');
  const started = Number.isFinite(startMs) && startMs <= now;
  if (e.deleted_at) {
    // Remove the Outlook copy first (unless it has started), then the row itself (with no copy, so no tombstone).
    if (e.outlook_event_id && e.outlook_mailbox && !started) await deleteCalendarEvent(e.outlook_mailbox, e.outlook_event_id);
    await db.from('diary_entries').update({ outlook_event_id: null }).eq('id', e.id);
    await db.from('diary_entries').delete().eq('id', e.id);
    return;
  }
  if (past || (started && e.outlook_event_id)) return; // past dates aren't copied, and a copy that has started isn't touched
  if (entrySkipped(e)) return; // left out of Outlook in the list
  const mailbox = e.surveyor_key.toLowerCase();
  const kind = ENTRY_KIND_LABEL[e.kind] ?? 'Busy';
  const want: CalWrite = {
    subject: `${kind}: ${e.title || kind}`,
    ...(e.all_day && e.day_from && e.day_to
      ? { allDay: { from: e.day_from, toExclusive: addDays(e.day_to, 1) } }
      : { start: new Date(e.starts_at || ''), end: new Date(e.ends_at || '') }),
    location:
      e.where_kind === 'address'
        ? { displayName: [e.address, e.postcode].filter(Boolean).join(', '), street: e.address || undefined, postalCode: e.postcode || undefined }
        : { displayName: e.where_kind === 'home' ? 'Home' : 'Online / phone' },
    body: `Added in the Heliaxis app${e.project_id ? `: ${siteUrl()}/admin/crm/${e.project_id}` : ''}.`,
    categories: ['Heliaxis diary'],
    showAs: 'busy',
  };
  const h = hash({ mailbox, ...want });
  if (e.outlook_event_id && h === e.outlook_hash && e.outlook_mailbox === mailbox) return;
  let id: string | null = null;
  if (e.outlook_event_id && e.outlook_mailbox === mailbox) {
    try {
      await updateCalendarEvent(mailbox, e.outlook_event_id, want);
      id = e.outlook_event_id;
    } catch (err) {
      if (!(err instanceof CalendarNotFound)) throw err;
    }
  } else if (e.outlook_event_id && e.outlook_mailbox) {
    await deleteCalendarEvent(e.outlook_mailbox, e.outlook_event_id);
  }
  id ??= (await createCalendarEvent(mailbox, { ...want, transactionId: txn('d', e.id, h, e.calendar_dirty_at) })).id;
  await db.from('diary_entries').update({ outlook_event_id: id, outlook_mailbox: mailbox, outlook_hash: h }).eq('id', e.id);
}

/* ── Claiming and running ────────────────────────────────────────────────────── */

type Table = 'crm_projects' | 'diary_entries';

/** Take the 2-minute lease on a row. False if another run has it. */
async function claim(table: Table, id: string, now: number): Promise<boolean> {
  const { data } = await createAdminClient()
    .from(table)
    .update({ calendar_claim_at: iso(now) })
    .eq('id', id)
    .or(`calendar_claim_at.is.null,calendar_claim_at.lt."${iso(now - CLAIM_MS)}"`)
    .select('id');
  return !!data?.length;
}

/** Let go, and mark it done only if nothing changed while we were writing. */
async function release(table: Table, id: string, dirtyAt: string | null | undefined, ok: boolean) {
  const db = createAdminClient();
  if (ok && dirtyAt) {
    const { data } = await db.from(table).update({ calendar_claim_at: null, calendar_dirty_at: null }).eq('id', id).eq('calendar_dirty_at', dirtyAt).select('id');
    if (data?.length) return;
  }
  await db.from(table).update({ calendar_claim_at: null }).eq('id', id);
}

/**
 * When the sync first ran with Microsoft 365 connected. Anything marked before then (dated after the
 * SQL ran but before Outlook was connected, much of it maybe already in Outlook by hand) isn't copied
 * by itself: it goes in the "Copy these dates into Outlook" list, so those can be unticked.
 */
const SINCE_KEY = 'calendar-sync-since';
async function connectedSince(): Promise<string> {
  const db = createAdminClient();
  const at = iso(Date.now());
  try {
    const { data } = await db.from('cms_kv').select('value').eq('key', SINCE_KEY).maybeSingle();
    if (data?.value) return data.value as string;
    if (!msConfigured()) return at;
    await db.from('cms_kv').insert({ key: SINCE_KEY, value: at, updated_at: at }); // a run racing us loses on the key: fine
    const again = await db.from('cms_kv').select('value').eq('key', SINCE_KEY).maybeSingle();
    return (again.data?.value as string) || at;
  } catch {
    return at;
  }
}

/** Marked before Outlook was connected and never copied: leave it for the list (unless it changes again). */
async function holdForList(table: Table, id: string, dirtyAt: string) {
  await createAdminClient().from(table).update({ calendar_dirty_at: null }).eq('id', id).eq('calendar_dirty_at', dirtyAt);
}

async function context(): Promise<Ctx> {
  const [s, hols] = await Promise.all([getBookingSettings(), ukBankHolidays()]);
  return { s, hols, now: Date.now() };
}

type Dirty = { id: string; calendar_claim_at?: string | null; calendar_error_at?: string | null };

/** The oldest 20 changes not claimed by another run, and not failed in the last 15 minutes. */
async function dueRows<T extends Dirty>(table: Table, now: number): Promise<T[]> {
  const { data, error } = await createAdminClient()
    .from(table)
    .select('*')
    .not('calendar_dirty_at', 'is', null)
    .order('calendar_dirty_at', { ascending: true })
    .limit(100);
  if (error) return [];
  const free = (at: string | null | undefined, ms: number) => !at || Date.parse(at) < now - ms;
  return ((data ?? []) as T[]).filter((r) => free(r.calendar_claim_at, CLAIM_MS) && free(r.calendar_error_at, RETRY_MS)).slice(0, 20);
}

/** Every minute (from runBookingJobs): write what changed to Outlook, until `until`. */
export async function runCalendarSync({ until }: { until: number }): Promise<{ synced: number; errors: number; tombstones: number }> {
  const out = { synced: 0, errors: 0, tombstones: 0 };
  if (!msConfigured()) return out;
  const ctx = await context();
  const db = createAdminClient();
  const since = Date.parse(await connectedSince());
  const before = (at: string | null | undefined) => !!at && Date.parse(at) < since;

  for (const p of await dueRows<ProjectRow>('crm_projects', ctx.now)) {
    if (Date.now() >= until) return out;
    if (before(p.calendar_dirty_at) && !p.survey_event_id && !(p.install_event_ids ?? []).length) {
      await holdForList('crm_projects', p.id, p.calendar_dirty_at as string);
      continue;
    }
    if (!(await claim('crm_projects', p.id, Date.now()))) continue;
    let ok = false;
    try {
      await syncProject(p, { ...ctx, now: Date.now() });
      ok = true;
      out.synced++;
    } catch {
      out.errors++;
    }
    await release('crm_projects', p.id, p.calendar_dirty_at, ok);
  }

  for (const e of await dueRows<EntryRow>('diary_entries', ctx.now)) {
    if (Date.now() >= until) return out;
    if (before(e.calendar_dirty_at) && !e.deleted_at && !e.outlook_event_id) {
      await holdForList('diary_entries', e.id, e.calendar_dirty_at as string);
      continue;
    }
    if (!(await claim('diary_entries', e.id, Date.now()))) continue;
    let ok = false;
    try {
      await syncEntry(e, { ...ctx, now: Date.now() });
      ok = true;
      out.synced++;
    } catch (err) {
      out.errors++;
      await db
        .from('diary_entries')
        .update({ calendar_error: err instanceof Error ? err.message : 'Outlook error', calendar_error_at: iso(Date.now()) })
        .eq('id', e.id);
    }
    if (ok) await db.from('diary_entries').update({ calendar_error: null, calendar_error_at: null }).eq('id', e.id).not('calendar_error', 'is', null);
    if (!e.deleted_at || !ok) await release('diary_entries', e.id, e.calendar_dirty_at, ok);
  }

  // Events whose job or diary entry was deleted.
  const { data: graves } = await db.from('calendar_tombstones').select('*').order('id', { ascending: true }).limit(30);
  for (const t of graves ?? []) {
    if (Date.now() >= until) break;
    try {
      await deleteCalendarEvent(t.mailbox as string, t.event_id as string);
      await db.from('calendar_tombstones').delete().eq('id', t.id);
      out.tombstones++;
    } catch {
      // Try again next time; give up after a week.
      if (Date.parse(t.created_at as string) < Date.now() - 7 * 24 * 60 * MIN) await db.from('calendar_tombstones').delete().eq('id', t.id);
    }
  }
  return out;
}

/** Straight after a booking: copy this job to Outlook now rather than in a minute. Never throws. */
export async function syncProjectCalendar(projectId: string): Promise<void> {
  try {
    if (!msConfigured()) return;
    const db = createAdminClient();
    const { data } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
    const p = data as ProjectRow | null;
    if (!p || !p.calendar_dirty_at) return;
    const now = Date.now();
    if (!(await claim('crm_projects', p.id, now))) return;
    let ok = false;
    try {
      await syncProject(p, await context());
      ok = true;
    } catch {
      // Recorded on the job; the every-minute sync tries again after 15 minutes.
    }
    await release('crm_projects', p.id, p.calendar_dirty_at, ok);
  } catch {
    // Columns not there yet.
  }
}

/* ── Connection day: the one-off "Copy these dates into Outlook" list ────────── */

export type BackfillItem = { kind: 'survey' | 'install' | 'entry'; id: string; label: string; when: string };

/**
 * Upcoming survey and install dates and diary entries that have no Outlook copy, aren't waiting to be
 * copied (never marked, or marked before Outlook was connected) and weren't left out in this list.
 */
export async function backfillList(): Promise<BackfillItem[]> {
  const db = createAdminClient();
  const now = Date.now();
  const today = ukDay(now);
  const out: BackfillItem[] = [];
  const waiting = `calendar_dirty_at.is.null,calendar_dirty_at.lt."${await connectedSince()}"`;
  const [{ data: surveys }, { data: installs }, { data: entries }] = await Promise.all([
    db.from('crm_projects').select('*').gt('survey_at', iso(now)).neq('stage', 'lost').or(waiting).is('survey_event_id', null).limit(200),
    db
      .from('crm_projects')
      .select('*')
      .gte('install_at', iso(now - 45 * 24 * 60 * MIN))
      .neq('stage', 'lost')
      .or(waiting)
      .limit(200),
    db.from('diary_entries').select('*').is('deleted_at', null).is('outlook_event_id', null).or(waiting).limit(200),
  ]);
  const hols = await ukBankHolidays();
  const ids = [...new Set([...(surveys ?? []), ...(installs ?? [])].map((p) => p.enquiry_id as string))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('enquiries').select('id, name').in('id', ids.slice(i, i + 100));
    for (const e of data ?? []) names.set(e.id as string, e.name as string);
  }
  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  for (const p of (surveys ?? []) as ProjectRow[]) {
    if (surveySkipped(p)) continue;
    out.push({ kind: 'survey', id: p.id, label: `Survey: ${names.get(p.enquiry_id) || p.title}`, when: fmt(Date.parse(p.survey_at as string)) });
  }
  for (const p of (installs ?? []) as ProjectRow[]) {
    if (!p.install_at || (p.install_event_ids ?? []).length || installSkipped(p)) continue;
    const days = installDayList(ukDay(p.install_at), p.install_days ?? 1, hols);
    if (days[days.length - 1] < today) continue;
    out.push({ kind: 'install', id: p.id, label: `Install: ${names.get(p.enquiry_id) || p.title}`, when: `${days[0]}${days.length > 1 ? ` (${days.length} days)` : ''}` });
  }
  for (const e of (entries ?? []) as EntryRow[]) {
    const end = e.all_day ? `${e.day_to}T23:59:59Z` : e.ends_at;
    if (!end || Date.parse(end) < now || entrySkipped(e)) continue;
    out.push({
      kind: 'entry',
      id: e.id,
      label: `${ENTRY_KIND_LABEL[e.kind] ?? 'Busy'}: ${e.title}`,
      when: e.all_day ? `${e.day_from}${e.day_to !== e.day_from ? ` to ${e.day_to}` : ''}` : fmt(Date.parse(e.starts_at as string)),
    });
  }
  return out;
}

/**
 * The ones left unticked in the list: never copied, unless their date changes. Done before the ticked
 * ones are marked, so ticking a job's survey doesn't also copy its unticked install. Returns how many.
 */
export async function skipBackfill(items: { kind: 'survey' | 'install' | 'entry'; id: string }[]): Promise<number> {
  const db = createAdminClient();
  let n = 0;
  const ids = (k: string) => [...new Set(items.filter((x) => x.kind === k).map((x) => x.id))];
  const read = async <T,>(table: 'crm_projects' | 'diary_entries', list: string[]): Promise<T[]> => {
    const rows: T[] = [];
    for (let i = 0; i < list.length; i += 100) {
      const { data } = await db.from(table).select('*').in('id', list.slice(i, i + 100));
      rows.push(...((data ?? []) as T[]));
    }
    return rows;
  };
  for (const p of await read<ProjectRow>('crm_projects', ids('survey'))) {
    const mark = skipSurvey(p);
    if (!mark || p.survey_event_id) continue;
    const { data } = await db.from('crm_projects').update({ survey_event_hash: mark }).eq('id', p.id).is('survey_event_id', null).select('id');
    n += data?.length ?? 0;
  }
  for (const p of await read<ProjectRow>('crm_projects', ids('install'))) {
    const mark = skipInstall(p);
    if (!mark || (p.install_event_ids ?? []).length) continue;
    const { data } = await db.from('crm_projects').update({ install_event_hash: mark }).eq('id', p.id).select('id');
    n += data?.length ?? 0;
  }
  for (const e of await read<EntryRow>('diary_entries', ids('entry'))) {
    if (e.outlook_event_id) continue;
    const { data } = await db.from('diary_entries').update({ outlook_hash: skipEntry(e) }).eq('id', e.id).is('outlook_event_id', null).select('id');
    n += data?.length ?? 0;
  }
  return n;
}

/**
 * Mark the ticked jobs and entries for the sync. Returns how many were marked. `rewrite` ("Put it
 * back" after a copy was moved in Outlook) also forgets what was last written, so the sync writes
 * the CRM's time over Outlook's even though nothing changed in the CRM.
 */
export async function markForBackfill(projectIds: string[], entryIds: string[], o: { rewrite?: boolean } = {}): Promise<number> {
  const db = createAdminClient();
  const now = iso(Date.now());
  let n = 0;
  for (let i = 0; i < projectIds.length; i += 100) {
    const { data } = await db
      .from('crm_projects')
      .update({ calendar_dirty_at: now, ...(o.rewrite ? { survey_event_hash: null } : {}) })
      .in('id', projectIds.slice(i, i + 100))
      .select('id');
    n += data?.length ?? 0;
  }
  for (let i = 0; i < entryIds.length; i += 100) {
    const { data } = await db
      .from('diary_entries')
      .update({ calendar_dirty_at: now, ...(o.rewrite ? { outlook_hash: null } : {}) })
      .in('id', entryIds.slice(i, i + 100))
      .select('id');
    n += data?.length ?? 0;
  }
  return n;
}
