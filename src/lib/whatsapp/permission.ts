import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { toWaId } from './shared';

/**
 * WhatsApp permission: who has agreed to automatic WhatsApp messages (reminders, follow-ups, smart
 * replies, chasers), and the STOP / START replies.
 *
 * Permission belongs to the person, so every enquiry with the same WhatsApp number counts: one STOP
 * (or staff switching it off because they asked us to stop) blocks them all, and one "agreed" covers
 * them all, except a ticked website or booking form, which only counts for that enquiry (anyone can
 * type any number into a public form). The rule "Only send automatic WhatsApps to customers who've
 * agreed" (cms_kv 'wa-permission') is off until Callum switches it on from the review list; until then
 * everyone who hasn't asked us to stop gets them, as before.
 *
 * When and how permission was given (whatsapp_opt_in_at / _source) need crm-v3.sql. Rows are read with
 * select('*') and those columns are only written once a row shows they exist, so leads are never lost
 * before it's run; permission then works on whatsapp_opt_in alone.
 */

type Db = ReturnType<typeof createAdminClient>;

/**
 * Sources: website-form | booking-form | meta-lead-form | inbound | import | staff:<name> (agreed, told
 * staff) | staff-stop:<name> (staff switched it off) | not-asked:<name> (review list) | stop-reply.
 */
export const STOP_SOURCE = 'stop-reply';
/** Staff switched permission off on the customer card (the customer asked us to stop): holds like a STOP. */
export const STAFF_STOP_PREFIX = 'staff-stop:';
/** Review list "Not asked": staff have looked and they haven't agreed. A later message from them still counts. */
export const NOT_ASKED_PREFIX = 'not-asked:';

export type PermissionRow = {
  id: string;
  name?: string | null;
  phone: string | null;
  email?: string | null;
  wa_id: string | null;
  whatsapp_opt_in: boolean | null;
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_in_source?: string | null;
};

/** crm-v3.sql has been run (select('*') returns the column, even when it's null). */
const hasRecordColumns = (r: object) => 'whatsapp_opt_in_source' in r;
const repliedStop = (r: PermissionRow) => r.whatsapp_opt_in === false && r.whatsapp_opt_in_source === STOP_SOURCE;
/** Replied STOP, or staff switched it off: no automatic WhatsApps, whatever the rule says. */
export const isStopped = (r: PermissionRow) =>
  repliedStop(r) || (r.whatsapp_opt_in === false && !!r.whatsapp_opt_in_source?.startsWith(STAFF_STOP_PREFIX));

/** Agreements typed into a public form (anyone can type any number) only count for that enquiry. */
const FORM_SOURCES = new Set(['website-form', 'booking-form']);
export const isFormSource = (source: string | null | undefined) => FORM_SOURCES.has(source ?? '');
/** Does r's "agreed" count for enquiry selfId? Its own always; another enquiry's only when a stranger couldn't have typed it in. */
export const agreedFor = (r: PermissionRow, selfId: string) =>
  r.whatsapp_opt_in === true && (r.id === selfId || !isFormSource(r.whatsapp_opt_in_source));

/** The STOP that blocks this person (their own STOP reply first), if any. */
const stopOf = (rows: PermissionRow[]) => rows.find(repliedStop) ?? rows.find(isStopped);

/* ── The rule ─────────────────────────────────────────────────────────────────────── */

export type PermissionSettings = { requireOptIn: boolean; changedAt: string | null; changedBy: string | null };
const KEY = 'wa-permission';
const DEFAULTS: PermissionSettings = { requireOptIn: false, changedAt: null, changedBy: null };
let cached: { at: number; value: PermissionSettings } | null = null;

/** Cached for 15 s (the outbox and automations check it for every message). Never throws. */
export async function getPermissionSettings(): Promise<PermissionSettings> {
  if (cached && Date.now() - cached.at < 15_000) return cached.value;
  try {
    const { data, error } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    if (error) return DEFAULTS;
    const v = data?.value ? (JSON.parse(data.value) as Partial<PermissionSettings>) : {};
    const value: PermissionSettings = {
      requireOptIn: v.requireOptIn === true,
      changedAt: typeof v.changedAt === 'string' ? v.changedAt : null,
      changedBy: typeof v.changedBy === 'string' ? v.changedBy : null,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return DEFAULTS;
  }
}

export async function savePermissionSettings(requireOptIn: boolean, changedBy: string): Promise<PermissionSettings> {
  const value: PermissionSettings = { requireOptIn, changedAt: new Date().toISOString(), changedBy };
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(value), updated_at: value.changedAt });
  if (error) throw new Error(error.message);
  cached = { at: Date.now(), value };
  return value;
}

/* ── Checking ─────────────────────────────────────────────────────────────────────── */

/** PostgREST filter for enquiries with this WhatsApp number, or a phone typed another way (07…, +44 …). */
function numberFilter(waId: string) {
  // Narrow by the last 9 digits; callers then compare properly with toWaId.
  const tail = waId.slice(-9);
  return `wa_id.eq.${waId},phone.ilike.%${tail.slice(0, 3)}%${tail.slice(3, 6)}%${tail.slice(6)}%`;
}

/** The enquiry and every other enquiry with the same WhatsApp number. */
async function personRows(db: Db, enquiryId: string): Promise<{ self: PermissionRow | null; rows: PermissionRow[]; number: string | null }> {
  const { data: self } = await db.from('enquiries').select('*').eq('id', enquiryId).maybeSingle();
  if (!self) return { self: null, rows: [], number: null };
  const me = self as PermissionRow;
  const number = me.wa_id || toWaId(me.phone);
  const rows: PermissionRow[] = [me];
  if (number) {
    const { data } = await db.from('enquiries').select('*').or(numberFilter(number)).limit(50);
    for (const r of (data ?? []) as PermissionRow[]) {
      if (r.id !== me.id && (r.wa_id === number || (!r.wa_id && toWaId(r.phone) === number))) rows.push(r);
    }
  }
  return { self: me, rows, number };
}

export type Permission = { allowed: boolean; reason?: string };

/**
 * May an automatic WhatsApp go to this customer? Not if anyone with their number replied STOP or staff
 * switched it off (whatever the rule says); with the rule on, only if they've agreed (agreedFor).
 */
export async function waPermission(enquiryId: string): Promise<Permission> {
  try {
    const { self, rows } = await personRows(createAdminClient(), enquiryId);
    if (!self) return { allowed: false, reason: 'Customer not found' };
    const stop = stopOf(rows);
    if (stop) {
      const by = repliedStop(stop) ? null : stop.whatsapp_opt_in_source!.slice(STAFF_STOP_PREFIX.length) || 'staff';
      return { allowed: false, reason: by ? `Automatic WhatsApps turned off by ${by}` : 'Replied STOP' };
    }
    const { requireOptIn } = await getPermissionSettings();
    if (requireOptIn && !rows.some((r) => agreedFor(r, self.id))) return { allowed: false, reason: 'No WhatsApp permission' };
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Couldn’t check WhatsApp permission' };
  }
}

/* ── Recording ────────────────────────────────────────────────────────────────────── */

/**
 * They agreed: a ticked box, a Meta form that asks, a message to us, an imported chat they started.
 * The first agreement is the record, so one already recorded is left alone; an older "agreed" with no
 * record (from before crm-v3.sql) gets one now. Never undoes a STOP or a staff switch-off (only START
 * or staff switching it back on do). Never throws. True if anything changed.
 */
export async function grantPermission(enquiryId: string, source: string, opts: { at?: string } = {}): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db.from('enquiries').select('*').eq('id', enquiryId).maybeSingle();
    const row = data as PermissionRow | null;
    if (!row || isStopped(row)) return false;
    const record = hasRecordColumns(row);
    if (row.whatsapp_opt_in === true && (!record || row.whatsapp_opt_in_source)) return false;
    const { error } = await db
      .from('enquiries')
      .update({
        whatsapp_opt_in: true,
        ...(record ? { whatsapp_opt_in_at: opts.at ?? new Date().toISOString(), whatsapp_opt_in_source: source } : {}),
      })
      .eq('id', enquiryId);
    return !error;
  } catch {
    return false;
  }
}

/** "STOP", "Stop.", "unsubscribe", "stop all", "opt out" → stop; "START" → start; anything else (even "Stop by tomorrow?") → null. */
export function stopWord(text: string | null | undefined): 'stop' | 'start' | null {
  const t = (text || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  if (t === 'stop' || t === 'unsubscribe' || t === 'stop all' || t === 'opt out' || t === 'opt-out') return 'stop';
  if (t === 'start') return 'start';
  return null;
}

export const STOP_REPLY = 'You won’t get any more automatic WhatsApp messages from us. Reply START to turn them back on.';
export const START_REPLY = 'Thanks, automatic WhatsApp messages from us are back on. Reply STOP at any time to turn them off.';

/**
 * A STOP or START reply from this number: every enquiry with it, including ones where the phone was
 * typed another way. STOP → not allowed, 'stop-reply' (also over a staff switch-off, so it's their own
 * record and they get the confirmation); START → allowed, 'inbound'. Returns the enquiries that
 * changed, and whether it could be recorded (before crm-v3.sql a STOP can't be told apart from "never
 * asked", so it isn't enforced yet).
 */
export async function applyStopReply(
  waId: string,
  word: 'stop' | 'start',
  at = new Date().toISOString()
): Promise<{ changed: string[]; all: string[]; recorded: boolean }> {
  const db = createAdminClient();
  const { data } = await db.from('enquiries').select('*').or(numberFilter(waId)).limit(200);
  const found = (data ?? []) as PermissionRow[];
  const byWa = found.filter((r) => r.wa_id === waId);
  const typed = found.filter((r) => !r.wa_id && toWaId(r.phone) === waId);
  const rows = [...byWa, ...typed];
  const target = rows.filter((r) => (word === 'stop' ? !repliedStop(r) : r.whatsapp_opt_in !== true));
  const record = rows.some(hasRecordColumns);
  if (target.length) {
    const { error } = await db
      .from('enquiries')
      .update({
        whatsapp_opt_in: word === 'start',
        ...(record ? { whatsapp_opt_in_at: at, whatsapp_opt_in_source: word === 'stop' ? STOP_SOURCE : 'inbound' } : {}),
      })
      .in('id', target.map((r) => r.id));
    if (error) return { changed: [], all: rows.map((r) => r.id), recorded: false };
  }
  return { changed: target.map((r) => r.id), all: rows.map((r) => r.id), recorded: record };
}

export type StopRecord = { source: string; at: string | null };
const stopRecord = (r: PermissionRow): StopRecord => ({ source: r.whatsapp_opt_in_source ?? STOP_SOURCE, at: r.whatsapp_opt_in_at ?? null });

/** Has anyone with this enquiry's number replied STOP, or had it switched off by staff? */
export async function permissionStop(enquiryId: string): Promise<StopRecord | null> {
  const { rows } = await personRows(createAdminClient(), enquiryId);
  const stop = stopOf(rows);
  return stop ? stopRecord(stop) : null;
}

/**
 * Staff, on the customer card: on = "they've agreed" ('staff:<name>'); off = they asked us to stop
 * ('staff-stop:<name>', which holds like a STOP whatever the rule says, until START or staff switch it
 * back on). Applies to every enquiry with their number, so one left on can't keep messages going. A
 * STOP stays a STOP when switching off. Switching on over a STOP or a staff switch-off needs liftStop
 * (staff confirm the customer asked); without it nothing changes and `stopped` says why.
 */
export async function setPermissionByStaff(
  enquiryId: string,
  on: boolean,
  staffName: string,
  opts: { liftStop?: boolean } = {}
): Promise<{ ok: boolean; recorded: boolean; liftedStop: boolean; liftedStaffStop: boolean; stopped?: StopRecord; error?: string }> {
  const db = createAdminClient();
  const none = { recorded: false, liftedStop: false, liftedStaffStop: false };
  const { self, rows } = await personRows(db, enquiryId);
  if (!self) return { ok: false, ...none, error: 'Not found' };
  const stop = on ? stopOf(rows) : undefined;
  if (stop && !opts.liftStop) return { ok: false, ...none, recorded: true, stopped: stopRecord(stop), error: 'stopped' };
  const ids = (on ? rows.filter((r) => r.id === self.id || r.whatsapp_opt_in !== true) : rows.filter((r) => !isStopped(r))).map((r) => r.id);
  const record = hasRecordColumns(self);
  if (ids.length) {
    const { error } = await db
      .from('enquiries')
      .update({
        whatsapp_opt_in: on,
        ...(record
          ? { whatsapp_opt_in_at: new Date().toISOString(), whatsapp_opt_in_source: on ? `staff:${staffName}` : `${STAFF_STOP_PREFIX}${staffName}` }
          : {}),
      })
      .in('id', ids);
    if (error) return { ok: false, ...none, error: error.message };
  }
  return {
    ok: true,
    recorded: record,
    liftedStop: on && rows.some(repliedStop),
    liftedStaffStop: on && rows.some((r) => isStopped(r) && !repliedStop(r)),
  };
}

/**
 * Review list "Not asked": they haven't agreed, and staff have looked, so they leave the list (they'd
 * still get no automatic WhatsApps with the rule on). Only when nothing is recorded yet. Recorded as
 * 'not-asked:<name>', so it isn't mistaken for staff switching it off. Needs crm-v3.sql.
 */
export async function markNotAsked(enquiryId: string, staffName: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from('enquiries').select('*').eq('id', enquiryId).maybeSingle();
  const row = data as PermissionRow | null;
  if (!row || !hasRecordColumns(row) || row.whatsapp_opt_in === true || row.whatsapp_opt_in_source) return false;
  const { error } = await db
    .from('enquiries')
    .update({ whatsapp_opt_in_at: new Date().toISOString(), whatsapp_opt_in_source: `${NOT_ASKED_PREFIX}${staffName}` })
    .eq('id', enquiryId)
    .is('whatsapp_opt_in_source', null);
  return !error;
}

/** Review list "Undo": back to nothing recorded, only for a record staff just made. */
export async function undoStaffRecord(enquiryId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from('enquiries').select('*').eq('id', enquiryId).maybeSingle();
  const row = data as PermissionRow | null;
  const src = row?.whatsapp_opt_in_source ?? '';
  if (!row || !(src.startsWith('staff:') || src.startsWith(NOT_ASKED_PREFIX))) return false;
  const { error } = await db
    .from('enquiries')
    .update({ whatsapp_opt_in: false, whatsapp_opt_in_at: null, whatsapp_opt_in_source: null })
    .eq('id', enquiryId);
  return !error;
}

/** "website form", "Meta lead form", "they messaged us", "Esther Smith", "turned off by Esther Smith"… for staff screens. */
export function permissionSourceLabel(source: string | null | undefined): string {
  if (!source) return '';
  if (source.startsWith(STAFF_STOP_PREFIX)) return `turned off by ${source.slice(STAFF_STOP_PREFIX.length) || 'staff'}`;
  if (source.startsWith(NOT_ASKED_PREFIX)) return `not asked yet (${source.slice(NOT_ASKED_PREFIX.length) || 'staff'})`;
  if (source.startsWith('staff:')) return source.slice(6) || 'staff';
  const labels: Record<string, string> = {
    'website-form': 'website form',
    'booking-form': 'booking form',
    'meta-lead-form': 'Meta lead form',
    inbound: 'they messaged us',
    import: 'imported chat or lead',
    [STOP_SOURCE]: 'replied STOP',
  };
  return labels[source] ?? source;
}
