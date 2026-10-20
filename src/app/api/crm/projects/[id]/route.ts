import { createAdminClient } from '@/lib/supabase/admin';
import { dayListWords, installDayList, ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, crmSession, isUuid, json, logActivity, portalUrl, thumbPath } from '@/lib/crm/server';
import { BOOKABLE_STAGES, bookingUrl } from '@/lib/crm/booking-link';
import { notifyChannel } from '@/lib/booking/book';
import { applyStageEvent, moveStage } from '@/lib/crm/move-stage';
import { buildTracker } from '@/lib/crm/tracker';
import { msConfigured } from '@/lib/ms365';
import { stripeConfigured } from '@/lib/stripe';
import { isStage, isSurveyType, portalMode, portalOpen, PRODUCT_KEYS } from '@/lib/crm/stages';
import { canAccess } from '@/lib/portals';
import { schemaReady } from '@/lib/schema-ready';
import { toWaId, windowOpen } from '@/lib/whatsapp/shared';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { getSettings } from '@/lib/whatsapp/settings';
import { shownBody } from '@/lib/whatsapp/describe';
import { withChatMedia } from '@/lib/whatsapp/media';
import type { MediaFields } from '@/lib/whatsapp/media-shared';
import { isStopped, NOT_ASKED_PREFIX, permissionSourceLabel, STOP_SOURCE } from '@/lib/whatsapp/permission';
import { checklistView, stageProgress } from '@/lib/projects/checklist';
import { addMonths, deadlinesFor, shortDay } from '@/lib/projects/deadlines';
import { deleteProject } from '@/lib/projects/delete';
import { possibleDuplicates } from '@/lib/projects/duplicates';
import { enaForJob } from '@/lib/projects/ena';
import { calendarNow, checkCtxFor, ensureDeadlineTasks, jobLookups, nextDate, projectRow, withFallback, type DocRow } from '@/lib/projects/server';
import { ordersSummary } from '@/lib/purchase-orders/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;
type PgError = { code?: string; message?: string } | null;

/** The customer fields the record page gets (the row is read with select('*'): newer columns may not exist yet). */
const CUSTOMER_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'postcode',
  'interest',
  'property_type',
  'source',
  'status',
  'created_at',
  'wa_id',
  'wa_unread',
  'whatsapp_opt_in',
  'whatsapp_opt_in_at',
  'whatsapp_opt_in_source',
  'customer_ref',
] as const;
const pick = (row: Row | null, keys: readonly string[]) => (row ? Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]])) : null);

/** How they agreed, after "Agreed on 3 Oct" (permissionSourceLabel's words are labels, not phrases). */
const AGREED_HOW: Record<string, string> = {
  'website-form': ' via the website form',
  'booking-form': ' via the booking form',
  'meta-lead-form': ' via a Meta lead form',
  inbound: ' when they messaged us',
  import: ' (from an imported chat or lead)',
};

/**
 * The Customer card's WhatsApp permission line, from this enquiry's own record (src/lib/whatsapp/permission.ts):
 * "Agreed on 3 Oct via the website form", "Replied STOP on 3 Oct: no automatic WhatsApps", "Not agreed yet".
 * Before crm-v3.sql there's no when or how, only on or off.
 */
function permissionWords(c: Row): string {
  const source = typeof c.whatsapp_opt_in_source === 'string' ? c.whatsapp_opt_in_source : null;
  const at = typeof c.whatsapp_opt_in_at === 'string' ? c.whatsapp_opt_in_at : null;
  const when = at ? ` on ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}` : '';
  const row = { id: String(c.id), phone: null, wa_id: null, whatsapp_opt_in: (c.whatsapp_opt_in as boolean | null) ?? null, whatsapp_opt_in_source: source };
  if (c.whatsapp_opt_in === true) {
    if (source?.startsWith('staff:')) return `Agreed${when} (recorded by ${permissionSourceLabel(source)})`;
    return source ? `Agreed${when}${AGREED_HOW[source] ?? ` (${permissionSourceLabel(source)})`}` : `Agreed${when}`;
  }
  if (isStopped(row)) {
    return source === STOP_SOURCE ? `Replied STOP${when}: no automatic WhatsApps` : `${permissionSourceLabel(source).replace(/^t/, 'T')}${when}: no automatic WhatsApps`;
  }
  return source?.startsWith(NOT_ASKED_PREFIX) ? `Not agreed yet (checked by ${source.slice(NOT_ASKED_PREFIX.length) || 'staff'})` : 'Not agreed yet';
}

/** survey_bookings.onsite as Postgres prints it: ["2026-11-03 11:45:00+00","2026-11-03 12:45:00+00"). */
function rangeOf(v: unknown): { start: string | null; end: string | null } {
  const m = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(String(v ?? ''));
  const iso = (s: string | undefined) => {
    if (!s) return null;
    const t = Date.parse(s.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  };
  return { start: iso(m?.[1]), end: iso(m?.[2]) };
}

/**
 * Everything for one job: customer, timeline (incl. WhatsApp and email), photos, documents, the team,
 * and the Projects parts (checklist, deadlines, surveys, booking, Outlook, other jobs and possible
 * duplicates). ?light=1&since={iso}: only what the page polls for (the job, customer, tasks, WhatsApp
 * summary, counts, the notes since then and the newest emails and WhatsApps), without signing photo links.
 */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const url = new URL(req.url);
  const light = url.searchParams.get('light') === '1';
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw && Number.isFinite(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null;
  const startedAt = Date.now();

  const db = createAdminClient();
  const { data: project } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  if (!project) return json({ error: 'Not found' }, 404);

  const { data: customerRow } = await db.from('enquiries').select('*').eq('id', project.enquiry_id).maybeSingle();
  const customer = pick(customerRow as Row | null, CUSTOMER_FIELDS) as
    | ({ id: string; name: string; email: string | null; phone: string | null; wa_id?: string | null; whatsapp_opt_in?: boolean } & Row)
    | null;
  if (customer && 'whatsapp_opt_in' in customer) customer.whatsapp_permission_words = permissionWords(customer);

  // WhatsApp is matched on the phone number, so a chat that started on another enquiry (a WhatsApp
  // message, a second web form) still shows here. Backfill the number's WhatsApp id if missing.
  const waId = customer?.wa_id || toWaId(customer?.phone);
  if (customer && waId && !customer.wa_id) await db.from('enquiries').update({ wa_id: waId }).eq('id', customer.id);
  type Linked = { id: string; wa_last_inbound_at: string | null; wa_last_message_at: string | null; wa_unread: number };
  let linked: Linked[] = [];
  if (waId) {
    const { data } = await db
      .from('enquiries')
      .select('id, wa_last_inbound_at, wa_last_message_at, wa_unread')
      .eq('wa_id', waId)
      .limit(20);
    linked = (data ?? []) as Linked[];
  }
  if (customer && !linked.some((l) => l.id === customer.id)) {
    linked.push({ id: customer.id, wa_last_inbound_at: null, wa_last_message_at: null, wa_unread: 0 });
  }
  const linkedIds = linked.map((l) => l.id);
  // The enquiry the live chat is on: the one with the latest WhatsApp activity (replies go there).
  const thread = [...linked].sort((a, b) => (b.wa_last_message_at || '').localeCompare(a.wa_last_message_at || ''))[0];
  const lastInbound = linked.map((l) => l.wa_last_inbound_at).filter(Boolean).sort().pop() ?? null;

  type Other = { id: string; title: string; stage: string; products: string[]; created_at: string; project_ref?: string | null };
  // The record page's other reads, started now so they run alongside the timeline's.
  const fullReads = light
    ? null
    : Promise.all([
        db.from('crm_photos').select('id, category, storage_path, caption, width, height, taken_at, created_at, uploaded_by').eq('project_id', id).order('created_at', { ascending: false }),
        db
          .from('crm_documents')
          .select('*')
          .eq('project_id', id)
          .order('created_at', { ascending: false })
          .then(
            (r) => r,
            () => ({ data: [] as DocRow[] })
          ),
        withFallback<Other>(
          (cols) =>
            db.from('crm_projects').select(cols).eq('enquiry_id', project.enquiry_id).neq('id', id).order('created_at', { ascending: false }) as unknown as PromiseLike<{
              data: Other[] | null;
              error: PgError;
            }>,
          'id, title, stage, products, created_at',
          'project_ref'
        ),
        possibleDuplicates([project.enquiry_id]),
        calendarNow(),
        schemaReady(),
        // The job's latest live booking (survey-booking.sql; nothing before it's run).
        db
          .from('survey_bookings')
          .select('*')
          .eq('project_id', id)
          .in('status', ['held', 'requested', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .then(
            (r) => (r.error ? null : ((r.data?.[0] as Row | undefined) ?? null)),
            () => null
          ),
        // How the customer will hear about a booking: the Diary's rule, so the two always agree. Never throws.
        notifyChannel(project.enquiry_id ? String(project.enquiry_id) : null),
        // The Overview's "Kit ordered" and the Orders tab (null before purchase-orders.sql). Never throws.
        ordersSummary(db, id),
      ]);

  type Wa = { id: string; direction: string; kind: string; body: string | null; status: string; created_at: string; sent_by: string | null; via: string | null; rule_id: string | null } & MediaFields;
  type Email = { id: string; direction: string; subject: string | null; body: string | null; sent_by: string | null; attachments: string[]; at: string };
  // Polling (?since=): only the notes and calls newer than the last look. Emails carry the time they
  // arrived (the mailbox sync saves them up to a few minutes later), and WhatsApp ticks change on
  // messages already shown, so a poll reads the newest few of those again (ids weed out repeats).
  let actsQ = db.from('crm_activities').select('id, project_id, kind, body, meta, by_id, at').eq('enquiry_id', project.enquiry_id);
  if (since) actsQ = actsQ.gt('at', since);
  // With whatsapp-media.sql, each message's photo, voice note or file too (the Activity tab shows it as in the chat).
  const waCols = await withChatMedia('id, direction, kind, body, status, created_at, sent_by, via, rule_id');
  const waQ = db.from('whatsapp_messages').select(waCols).in('enquiry_id', linkedIds);
  const emailQ = db
    .from('crm_emails')
    .select('id, direction, subject, body, sent_by, attachments, at, from_address')
    .in('enquiry_id', linkedIds.length ? linkedIds : [project.enquiry_id]);
  // A poll reads only the newest few messages, so it counts the chat separately (the Customer card's "42 messages").
  const waTotal =
    since && linkedIds.length
      ? db
          .from('whatsapp_messages')
          .select('id', { count: 'exact', head: true })
          .in('enquiry_id', linkedIds)
          .then(
            (r) => r.count ?? 0,
            () => 0
          )
      : null;
  const [{ data: acts }, { data: wa }, { data: people }, { data: tasks }, { data: emails }, deadlineTasks] = await Promise.all([
    actsQ.order('at', { ascending: false }).limit(300),
    // WhatsApp is optional (tables may not exist yet).
    linkedIds.length ? waQ.order('created_at', { ascending: false }).limit(since ? 30 : 300) : Promise.resolve({ data: [] as Wa[] }),
    db.from('profiles').select('*').eq('status', 'approved'),
    db
      .from('tasks')
      .select('id, title, due_date, priority, status, assignee_id, assignee_name, completed_at')
      .eq('crm_project_id', id)
      .order('status')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100),
    // v2 tables: empty until crm-v2.sql has been run.
    emailQ
      .order('at', { ascending: false })
      .limit(since ? 20 : 200)
      .then(
        (r) => r,
        () => ({ data: [] as Email[] })
      ),
    // Tasks made by the paperwork deadlines (source_key arrives with crm-v3.sql; none before).
    db
      .from('tasks')
      .select('id')
      .eq('crm_project_id', id)
      .like('source_key', 'deadline:%')
      .limit(100)
      .then(
        (r) => new Set(r.error ? [] : (r.data ?? []).map((t) => t.id as string)),
        () => new Set<string>()
      ),
  ]);

  // Anyone who can see the work: CRM users, or people who only have Tasks (they see it on the Tasks page).
  const team = (people ?? [])
    .filter((p) => canAccess(p, 'crm') || canAccess(p, 'tasks'))
    .map((p) => ({ id: p.id as string, name: (p.full_name || p.email || 'Team') as string, crm: canAccess(p, 'crm') }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team') as string]));

  const timeline = [
    ...(acts ?? []).map((a) => ({
      id: a.id,
      kind: a.kind as string,
      body: a.body as string | null,
      meta: a.meta,
      by: a.by_id ? (nameOf.get(a.by_id) ?? 'Team') : null,
      at: a.at as string,
      other_project: a.project_id && a.project_id !== id ? a.project_id : null,
    })),
    ...((wa ?? []) as Wa[]).map((m) => ({
      id: `wa-${m.id}`,
      kind: 'whatsapp',
      body: shownBody(m.body),
      meta: {
        direction: m.direction,
        status: m.status,
        kind: m.kind,
        via: m.via,
        ...(m.media_status
          ? { media_status: m.media_status, media_mime: m.media_mime ?? null, media_name: m.media_name ?? null, media_size: m.media_size ?? null, media_error: m.media_error ?? null }
          : {}),
      },
      by:
        m.direction === 'in'
          ? (customer?.name ?? 'Customer')
          : m.sent_by
            ? (nameOf.get(m.sent_by) ?? 'Team')
            : m.via === 'whatsapp-app'
              ? 'WhatsApp app'
              : m.via === 'import'
                ? 'Imported · WhatsApp Business app'
                : m.via === 'chase'
                  ? 'Chaser'
                  : m.rule_id
                    ? 'Smart reply'
                    : 'Automatic',
      at: m.created_at,
      other_project: null,
    })),
    ...((emails ?? []) as Email[]).map((m) => ({
      id: `em-${m.id}`,
      kind: 'email',
      body: `${m.subject ? `${m.subject}\n\n` : ''}${m.body || ''}`.trim(),
      meta: { direction: m.direction, attachments: m.attachments, synced: true },
      by: m.direction === 'in' ? (customer?.name ?? 'Customer') : m.sent_by ? (nameOf.get(m.sent_by) ?? 'Team') : 'Outlook',
      at: m.at,
      other_project: null,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const whatsapp = {
    configured: whatsappConfigured(),
    number: waId,
    threadId: thread?.id ?? customer?.id ?? null,
    enquiryIds: linkedIds,
    windowOpen: windowOpen(lastInbound),
    lastInbound,
    unread: linked.reduce((n, l) => n + (l.wa_unread || 0), 0),
    unreadIds: linked.filter((l) => l.wa_unread > 0).map((l) => l.id),
    messages: waTotal ? await waTotal : (wa ?? []).length,
    chaseHours: await getSettings()
      .then((st) => (st.chaseQuestions ? st.chaseAfterHours : 0))
      .catch(() => 0),
  };
  const taskList = (tasks ?? []).map((t) => ({
    ...t,
    assignee: t.assignee_id ? (nameOf.get(t.assignee_id) ?? '') : t.assignee_name || '',
    deadline: deadlineTasks.has(t.id),
  }));

  if (light) {
    const count = (table: string) =>
      db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('project_id', id)
        .then(
          (r) => r.count ?? 0,
          () => 0
        );
    const [photoCount, documentCount] = await Promise.all([count('crm_photos'), count('crm_documents')]);
    return json({
      light: true,
      // Ask again from a few seconds before this read started, so nothing saved meanwhile is missed (entries have ids to tell repeats apart).
      cursor: new Date(startedAt - 5000).toISOString(),
      project,
      customer,
      tasks: taskList,
      whatsapp,
      counts: { photos: photoCount, documents: documentCount, tasks: taskList.filter((t) => t.status !== 'done').length },
      timeline,
    });
  }

  const [{ data: photos }, { data: docs }, othersRes, dupes, cal, schema, booking, notify, orders] = await fullReads!;

  // Signed links (1h) for each photo and its thumbnail.
  const paths = (photos ?? []).flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(CRM_BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  // The checklist, from what's already been read (documents, photos) plus surveys and RAMS bookings.
  const p = projectRow(project as Row);
  const photoCounts: Record<string, number> = {};
  for (const ph of photos ?? []) photoCounts[ph.category] = (photoCounts[ph.category] ?? 0) + 1;
  const lookups = await jobLookups(db, [p], { docs: (docs ?? []) as DocRow[], photoCounts: { [id]: photoCounts } });
  const check = checkCtxFor(p, lookups, cal.today);
  const surveys = (lookups.surveys.get(id) ?? []).map((sv) => ({
    id: sv.id,
    type: sv.type,
    status: sv.status,
    completed_at: (sv.completed_at as string | null) ?? null,
    flags: Array.isArray(sv.flags) ? (sv.flags as string[]) : [],
    surveyor: sv.surveyor_id ? (nameOf.get(String(sv.surveyor_id)) ?? '') : '',
  }));

  // The DNO paperwork's "For the ENA application": solar and battery jobs (and any with a solar survey), after surveys.sql.
  const enaJob = p.products.some((k) => k === 'solar' || k === 'battery') || surveys.some((sv) => sv.type === 'solar');
  const ena = schema.surveys && enaJob ? await enaForJob(db, surveys, String(p.project_ref || customer?.customer_ref || customer?.name || 'survey')) : null;

  const installAt = typeof p.install_at === 'string' ? p.install_at : null;
  const installDates = installAt ? installDayList(ukDay(installAt), Math.max(1, Number(p.install_days) || 1), cal.hols) : [];
  const token = typeof p.booking_token === 'string' ? p.booking_token : null;

  return json({
    project,
    customer,
    portal: project.portal_token && portalOpen(project.stage) ? portalUrl(project.portal_token) : null,
    portalOpen: portalOpen(project.stage),
    portalMode: portalMode(project.stage),
    tracker: buildTracker({ ...project, products: project.products ?? [] }, cal.hols),
    documents: docs ?? [],
    connected: { email: msConfigured(), stripe: stripeConfigured() },
    whatsapp,
    timeline,
    photos: (photos ?? []).map((ph) => ({
      ...ph,
      url: signed.get(ph.storage_path) ?? null,
      thumb: signed.get(thumbPath(ph.storage_path)) ?? signed.get(ph.storage_path) ?? null,
      by: ph.uploaded_by ? (nameOf.get(ph.uploaded_by) ?? '') : '',
    })),
    team,
    tasks: taskList,
    others: ((othersRes.error ? [] : othersRes.data) ?? []).map((o) => ({ ...o, project_ref: o.project_ref ?? null })),
    duplicates: dupes.get(project.enquiry_id) ?? [],
    surveys,
    booking: booking
      ? {
          id: booking.id,
          status: booking.status,
          ...rangeOf(booking.onsite),
          minutes: booking.minutes,
          survey_type: booking.survey_type,
          source: booking.source,
          surveyor: booking.surveyor_id ? (nameOf.get(String(booking.surveyor_id)) ?? String(booking.surveyor_key ?? '')) : String(booking.surveyor_key ?? ''),
          booked_by: booking.booked_by ? (nameOf.get(String(booking.booked_by)) ?? '') : '',
          would_confirm: booking.would_confirm ?? null,
          overridden: !!booking.overridden,
        }
      : null,
    bookingLink: token && (BOOKABLE_STAGES as readonly string[]).includes(p.stage) ? bookingUrl(token) : null,
    notify,
    calendar: {
      outlook: msConfigured(),
      survey: !!p.survey_event_id,
      install: Array.isArray(p.install_event_ids) && p.install_event_ids.length > 0,
      error: typeof p.calendar_error === 'string' ? p.calendar_error : null,
    },
    checklist: checklistView(check),
    progress: stageProgress(check, p.stage),
    deadlines: deadlinesFor(p, cal),
    install: installDates.length ? { dates: installDates, words: dayListWords(installDates) } : null,
    next_date: nextDate(p, cal),
    subcontracts: lookups.subcontracts.get(id) ?? [],
    ena,
    schema,
    orders,
  });
}

/* ── Saving ──────────────────────────────────────────────────────────────────── */

const TEXT = ['title', 'address', 'postcode', 'simpliheat_url', 'opensolar_url', 'lost_reason', 'notes', 'dno_ref'] as const;
const DNO = ['not_required', 'not_started', 'submitted', 'approved', 'rejected'];
const DNO_ROUTES = ['g98', 'g99', 'demand', 'not_needed'];
/** system keys and how each is cleaned. */
const SYSTEM: Record<string, 'number' | 'int' | 'text'> = {
  kwp: 'number',
  panel_count: 'int',
  panel_model: 'text',
  inverter_model: 'text',
  inverter_kw: 'number',
  battery_model: 'text',
  battery_kwh: 'number',
  heat_pump_model: 'text',
  heat_pump_kw: 'number',
  ev_charger_model: 'text',
  mpan: 'text',
  export_limit_kw: 'number',
  monitoring: 'text',
};
const PAPER_DATES = [
  'mcs_registered_on',
  'eic_on',
  'bus_applied_on',
  'bus_issued_on',
  'bus_expires_on',
  'bus_redeemed_on',
  'building_regs_on',
  'ibg_registered_on',
  'warranties_registered_on',
  'seg_info_sent_on',
];
const PAPER_TEXT = ['mcs_cert_no', 'bus_ref', 'building_regs_ref', 'ibg_ref'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const V3_WARNING = 'Some fields need crm-v3.sql: run it from the to-do list.';

const ymdOrNull = (v: unknown) => (typeof v === 'string' && YMD.test(v.trim()) ? v.trim() : null);
const isoOrNull = (v: unknown) => (v && !Number.isNaN(Date.parse(String(v))) ? new Date(String(v)).toISOString() : null);
const textOrNull = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null;

/** Merge cleaned values into a JSON column: an empty value removes the key. */
function merge(current: unknown, input: unknown, clean: (key: string, v: unknown) => unknown, allowed: (key: string) => boolean): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, unknown> = { ...(current && typeof current === 'object' && !Array.isArray(current) ? (current as Row) : {}) };
  for (const [k, v] of Object.entries(input as Row)) {
    if (!allowed(k)) continue;
    const c = clean(k, v);
    if (c === null || c === undefined || c === '') delete out[k];
    else out[k] = c;
  }
  return out;
}

function cleanSystem(key: string, v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  if (SYSTEM[key] === 'text') return String(v).trim().slice(0, 200) || null;
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return SYSTEM[key] === 'int' ? Math.round(n) : Math.round(n * 1000) / 1000;
}

function cleanPaper(key: string, v: unknown): unknown {
  if (key === 'dno_route') return DNO_ROUTES.includes(String(v)) ? String(v) : null;
  if (PAPER_DATES.includes(key)) return ymdOrNull(v);
  return textOrNull(v, 120);
}

const UK_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
const UK_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "Tue 3 Nov, 11:45" in UK time. */
const when = (iso: string) => `${UK_DAY.format(new Date(iso))}, ${UK_TIME.format(new Date(iso))}`;
const workingDays = (n: number) => (n > 1 ? ` (${n} working days)` : '');

export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: before } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  if (!before) return json({ error: 'Not found' }, 404);
  const enquiryId = String(before.enquiry_id);
  const log = (body: string) => logActivity({ enquiryId, projectId: id, kind: 'system', body, byId: s.user.id });

  // 1. The fields every database has, saved exactly as before.
  const u: Row = { updated_at: new Date().toISOString() };
  for (const k of TEXT) {
    if (k in b) {
      const v = String(b[k] ?? '').trim();
      if (k === 'title' && !v) return json({ error: 'The project needs a name.' }, 400);
      if ((k === 'simpliheat_url' || k === 'opensolar_url') && v && !/^https?:\/\//i.test(v)) {
        return json({ error: 'Links must start with https://' }, 400);
      }
      u[k] = v ? (k === 'postcode' ? v.toUpperCase() : v.slice(0, k === 'notes' ? 5000 : 500)) : k === 'title' ? v : null;
    }
  }
  if ('products' in b) u.products = (Array.isArray(b.products) ? b.products : []).filter((k: unknown) => PRODUCT_KEYS.includes(String(k)));
  if ('value' in b) u.value = b.value === null || b.value === '' ? null : Number.isFinite(Number(b.value)) ? Number(b.value) : null;
  if ('owner_id' in b) u.owner_id = b.owner_id && isUuid(String(b.owner_id)) ? b.owner_id : null;
  // Next step: set / change (re-arms its reminder), or mark done (logged on the timeline).
  let doneStep: string | null = null;
  if (b.complete_next_step) {
    doneStep = (before.next_step as string | null) || null;
    u.next_step = null;
    u.next_step_at = null;
    u.next_step_notified_at = null;
  } else {
    if ('next_step' in b) u.next_step = String(b.next_step || '').trim().slice(0, 300) || null;
    if ('next_step_at' in b) {
      u.next_step_at = isoOrNull(b.next_step_at);
      u.next_step_notified_at = null;
    }
  }
  if ('deposit_amount' in b) {
    const v = b.deposit_amount === null || b.deposit_amount === '' ? null : Number(b.deposit_amount);
    u.deposit_amount = v !== null && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  }
  let dnoMove: string | null = null;
  if ('dno_status' in b && DNO.includes(String(b.dno_status)) && b.dno_status !== before.dno_status) {
    u.dno_status = b.dno_status;
    dnoMove = String(b.dno_status);
    const now = new Date().toISOString();
    if (b.dno_status === 'submitted' && !b.dno_submitted_at) u.dno_submitted_at = now;
    if (b.dno_status === 'approved' && !b.dno_approved_at) u.dno_approved_at = now;
  }
  for (const k of ['survey_at', 'install_at', 'dno_submitted_at', 'dno_approved_at'] as const) {
    if (k in b) u[k] = isoOrNull(b[k]);
  }
  let stageTo: string | null = null;
  if ('stage' in b) {
    if (!isStage(b.stage)) return json({ error: 'Unknown stage' }, 400);
    if (b.stage !== before.stage) stageTo = b.stage;
  }

  // 2. The Projects fields (crm-v3.sql), in their own update so the rest saves without them.
  const v3: Row = {};
  if ('install_days' in b) {
    const n = Math.round(Number(b.install_days));
    if (!Number.isFinite(n) || n < 1 || n > 30) return json({ error: 'An install takes 1 to 30 working days.' }, 400);
    v3.install_days = n;
  }
  if ('install_team' in b) v3.install_team = [...new Set((Array.isArray(b.install_team) ? b.install_team : []).map(String).filter(isUuid))].slice(0, 20);
  for (const k of ['scaffold_up_on', 'scaffold_down_on'] as const) if (k in b) v3[k] = ymdOrNull(b[k]);
  for (const k of ['commissioned_at', 'handover_at'] as const) if (k in b) v3[k] = isoOrNull(b[k]);
  if ('rams_project_id' in b) v3.rams_project_id = textOrNull(b.rams_project_id, 100);
  if ('on_hold' in b) {
    v3.on_hold = b.on_hold === true;
    if (!v3.on_hold && !('hold_reason' in b)) v3.hold_reason = null;
  }
  if ('hold_reason' in b) v3.hold_reason = textOrNull(b.hold_reason, 300);
  if ('system' in b) {
    const m = merge(before.system, b.system, cleanSystem, (k) => k in SYSTEM);
    if (m) v3.system = m;
  }
  if ('paperwork' in b) {
    const input = b.paperwork && typeof b.paperwork === 'object' ? { ...(b.paperwork as Row) } : null;
    // The BUS voucher lasts 3 months from when it's issued, unless a different expiry is typed in.
    if (input && 'bus_issued_on' in input && !('bus_expires_on' in input)) {
      const issued = ymdOrNull(input.bus_issued_on);
      input.bus_expires_on = issued ? addMonths(issued, 3) : null;
    }
    const m = merge(before.paperwork, input, cleanPaper, (k) => k === 'dno_route' || PAPER_DATES.includes(k) || PAPER_TEXT.includes(k));
    if (m) v3.paperwork = m;
  }
  // survey-booking.sql adds survey_type: its own update again.
  const booking: Row = {};
  if ('survey_type' in b) booking.survey_type = isSurveyType(b.survey_type) ? b.survey_type : null;

  const { error } = await db.from('crm_projects').update(u).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  const warnings: string[] = [];
  if (Object.keys(v3).length) {
    const r = await db.from('crm_projects').update(v3).eq('id', id);
    if (r.error) warnings.push(V3_WARNING);
  }
  if (Object.keys(booking).length) {
    const r = await db.from('crm_projects').update(booking).eq('id', id);
    if (r.error) warnings.push('The survey type needs survey-booking.sql: run it from the to-do list.');
  }
  const saved = (k: string) => k in u || (k in v3 && !warnings.includes(V3_WARNING));

  // 3. What it says on the timeline.
  if (dnoMove) {
    const label: Record<string, string> = {
      not_required: 'not needed',
      not_started: 'not started',
      submitted: 'applied for',
      approved: 'approved',
      rejected: 'rejected',
    };
    await log(`DNO ${label[dnoMove]}`);
  }
  if (doneStep) await log(`✓ Done: ${doneStep}`);
  const surveyBefore = (before.survey_at as string | null) ?? null;
  const surveyNow = 'survey_at' in u ? (u.survey_at as string | null) : surveyBefore;
  if (surveyNow !== surveyBefore && Date.parse(surveyNow ?? '') !== Date.parse(surveyBefore ?? '')) {
    await log(!surveyNow ? 'Survey date removed' : surveyBefore ? `Survey moved to ${when(surveyNow)}` : `Survey date set: ${when(surveyNow)}`);
  }
  const installBefore = (before.install_at as string | null) ?? null;
  const installNow = 'install_at' in u ? (u.install_at as string | null) : installBefore;
  const daysBefore = Math.max(1, Number(before.install_days) || 1);
  const daysNow = saved('install_days') ? (v3.install_days as number) : daysBefore;
  const installMoved = installNow !== installBefore && Date.parse(installNow ?? '') !== Date.parse(installBefore ?? '');
  if (installMoved) {
    const day = installNow ? shortDay(ukDay(installNow)) : '';
    await log(!installNow ? 'Install date removed' : installBefore ? `Install moved to ${day}${workingDays(daysNow)}` : `Install date set: ${day}${workingDays(daysNow)}`);
  } else if (installNow && daysNow !== daysBefore) {
    await log(`Install now ${daysNow} working day${daysNow === 1 ? '' : 's'} from ${shortDay(ukDay(installNow))}`);
  }
  if (saved('on_hold') && !!v3.on_hold !== !!before.on_hold) {
    await log(v3.on_hold ? `On hold${v3.hold_reason ? `: ${v3.hold_reason}` : ''}` : 'No longer on hold');
  }
  if (saved('commissioned_at') && v3.commissioned_at && Date.parse(String(v3.commissioned_at)) !== Date.parse(String(before.commissioned_at ?? ''))) {
    await log(`Commissioned on ${shortDay(ukDay(String(v3.commissioned_at)))}`);
  }

  // 4. The stage: a manual move, or a date that moves it on (never back).
  if (stageTo && isStage(stageTo)) {
    await moveStage(id, stageTo, { byId: s.user.id });
  } else {
    if (surveyNow && Date.parse(surveyNow) !== Date.parse(surveyBefore ?? '')) {
      await applyStageEvent(id, 'survey_booked', { byId: s.user.id, note: 'survey date set' });
    }
    if (installNow && installMoved) await applyStageEvent(id, 'install_booked', { byId: s.user.id, note: 'install date set' });
  }

  // 5. Paperwork deadlines become tasks (once each).
  if (saved('commissioned_at') || saved('paperwork') || dnoMove || 'dno_submitted_at' in u) {
    await ensureDeadlineTasks(id, s.user.id);
  }

  const { data } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  return json({ project: data, ...(warnings.length ? { warning: warnings.join(' ') } : {}) });
}

/** Delete a job and its files (admins). A signed or paid job needs its reference typed in `confirm`. */
export async function DELETE(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const confirm = typeof b?.confirm === 'string' ? b.confirm : new URL(req.url).searchParams.get('confirm');
  const r = await deleteProject(id, {
    confirm,
    by: { id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone', admin: s.profile.role === 'admin' },
  });
  if (r.ok) return json(r);
  if (r.status === 409) return json({ error: r.message, needsConfirm: true, label: r.label, message: r.message }, 409);
  return json({ error: r.error }, r.status);
}

