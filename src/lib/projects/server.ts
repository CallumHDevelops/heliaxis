import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { addWorkingDays, installDayList, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { enquiryStatusFor, logActivity } from '@/lib/crm/server';
import { chunks } from '@/lib/crm/delete-customer';
import { isProjectStage, isStage, PROJECT_STAGES, stageIndex, type StageKey } from '@/lib/crm/stages';
import { msConfigured } from '@/lib/ms365';
import { stageProgress, type CheckCtx, type ProjectRow } from './checklist';
import { deadlinesFor, shortDay, daysBetween, type Deadline, type DeadlineCal } from './deadlines';
import { possibleDuplicates, type Duplicate } from './duplicates';
import { plusDays } from './feed';

/**
 * Server reads shared by the Projects APIs and pages: the CRM pipeline with its counts, the Projects
 * list, the lookups a job's checklist needs, and the deadline tasks. Everything here works before
 * crm-v3.sql, surveys.sql, survey-booking.sql and customer-refs.sql have been run: their columns and
 * tables are read separately, or with select('*'), and missing ones read as empty.
 */

export type Db = ReturnType<typeof createAdminClient>;
type PgError = { code?: string; message?: string } | null;
type Res<T> = { data: T[] | null; error: PgError };

const PAGE = 1000;

/** A column from a later SQL file isn't there yet (42703, or PostgREST's "could not find" wording). */
export const missingColumn = (e: PgError) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the '.*' column/i.test(e.message ?? ''));

/**
 * Every row for these ids, 100 ids per request and 1,000 rows per page. A read that fails (a table or
 * column that isn't there yet) gives what it has so far, usually nothing.
 */
export async function readAll<T>(ids: string[], read: (batch: string[], from: number, to: number) => PromiseLike<Res<T>>): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const parts = await Promise.all(
    chunks(unique, 100).map(async (batch) => {
      const out: T[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await read(batch, from, from + PAGE - 1);
        if (error) return out;
        out.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE) return out;
      }
    })
  );
  return parts.flat();
}

/** Run a read with the newer columns, and again without them if they aren't there yet. */
export async function withFallback<T>(run: (cols: string) => PromiseLike<Res<T>>, cols: string, extra: string): Promise<Res<T>> {
  const first = await run(`${cols}, ${extra}`);
  if (!first.error || !missingColumn(first.error)) return first;
  return run(cols);
}

const text = (v: unknown) => (typeof v === 'string' ? v : null);
const obj = <T>(v: unknown): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : ({} as T));
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** A crm_projects row read with select('*'), with the crm-v3.sql columns filled in when they're missing. */
export function projectRow(raw: Record<string, unknown>): ProjectRow {
  return {
    ...raw,
    id: String(raw.id),
    stage: String(raw.stage ?? 'lead'),
    products: arr<string>(raw.products),
    checklist: obj(raw.checklist),
    paperwork: obj(raw.paperwork),
    system: obj(raw.system),
    reminders_sent: arr<string>(raw.reminders_sent),
  };
}

/** Today in the UK, this year's bank holidays and the working-day maths, for deadlines. */
export async function calendarNow(): Promise<DeadlineCal> {
  return { today: ukDay(Date.now()), hols: await ukBankHolidays(), addWorkingDays, ukDay };
}

/* ── What a job's checklist needs (batched for many jobs) ───────────────────── */

export type DocRow = Record<string, unknown> & { id: string; project_id: string; category: string; visible: boolean; needs_signature: boolean };
export type SurveyRow = Record<string, unknown> & { id: string; project_id: string; type: string; status: string };
export type Assignment = {
  id: string;
  status: string;
  rams_project_id: string;
  rams_project_name: string | null;
  start_date: string | null;
  subcontractor_id: string;
  firm: string | null;
};

export type JobLookups = {
  docs: Map<string, DocRow[]>;
  photoCounts: Map<string, Record<string, number>>;
  surveys: Map<string, SurveyRow[]>;
  subcontracts: Map<string, Assignment[]>;
  outlook: boolean;
};

const group = <T>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
};

/**
 * Documents, photo counts, surveys and RAMS bookings for these jobs, read side by side. A caller that
 * has already read the documents or counted the photos (the record page) passes them in.
 */
export async function jobLookups(
  db: Db,
  projects: ProjectRow[],
  opts: { docs?: DocRow[]; photoCounts?: Record<string, Record<string, number>> } = {}
): Promise<JobLookups> {
  const ids = projects.map((p) => p.id);
  const rams = [...new Set(projects.map((p) => text(p.rams_project_id)?.trim()).filter((r): r is string => !!r))];
  const [docs, photos, surveys, assignments] = await Promise.all([
    // select('*'): signed_outside_at (crm-v3.sql) and survey_id (surveys.sql) may not be there yet.
    opts.docs ??
      readAll<DocRow>(ids, (b, from, to) => db.from('crm_documents').select('*').in('project_id', b).order('id').range(from, to) as unknown as PromiseLike<Res<DocRow>>),
    // Only the two categories the checklist looks at.
    opts.photoCounts
      ? []
      : readAll<{ project_id: string; category: string }>(ids, (b, from, to) =>
          db.from('crm_photos').select('project_id, category').in('project_id', b).in('category', ['progress', 'completion']).order('id').range(from, to)
        ),
    readAll<SurveyRow>(ids, (b, from, to) => db.from('crm_surveys').select('*').in('project_id', b).order('id').range(from, to) as unknown as PromiseLike<Res<SurveyRow>>),
    readAll<Omit<Assignment, 'firm'> & { subcontractors?: { company_name?: string | null } | null }>(rams, (b, from, to) =>
      db
        .from('subcontractor_assignments')
        .select('id, status, rams_project_id, rams_project_name, start_date, subcontractor_id, subcontractors(company_name)')
        .in('rams_project_id', b)
        .order('id')
        .range(from, to) as unknown as PromiseLike<Res<Omit<Assignment, 'firm'> & { subcontractors?: { company_name?: string | null } | null }>>
    ),
  ]);
  const photoCounts = new Map<string, Record<string, number>>(Object.entries(opts.photoCounts ?? {}));
  for (const p of photos) {
    const c = photoCounts.get(p.project_id) ?? {};
    c[p.category] = (c[p.category] ?? 0) + 1;
    photoCounts.set(p.project_id, c);
  }
  const byRams = group(
    assignments.map(({ subcontractors, ...a }) => ({ ...a, firm: subcontractors?.company_name ?? null })),
    (a) => a.rams_project_id
  );
  const subcontracts = new Map<string, Assignment[]>();
  for (const p of projects) {
    const r = text(p.rams_project_id)?.trim();
    if (r && byRams.has(r)) subcontracts.set(p.id, byRams.get(r)!);
  }
  return {
    docs: group(docs, (d) => d.project_id),
    photoCounts,
    surveys: group(surveys, (s) => s.project_id),
    subcontracts,
    outlook: msConfigured(),
  };
}

/** The checklist's view of one job, from the lookups. */
export function checkCtxFor(p: ProjectRow, l: JobLookups, today: string): CheckCtx {
  const docs = l.docs.get(p.id) ?? [];
  const surveyDocs = new Set(docs.map((d) => text(d.survey_id)).filter(Boolean));
  return {
    p,
    docs: docs.map((d) => ({ category: d.category, visible: !!d.visible, needs_signature: !!d.needs_signature, signed_outside_at: text(d.signed_outside_at) })),
    photoCounts: l.photoCounts.get(p.id) ?? {},
    surveys: (l.surveys.get(p.id) ?? [])
      .filter((s) => s.type === 'solar' || s.type === 'ashp')
      .map((s) => ({ type: s.type as 'solar' | 'ashp', status: s.status, simpliheat_url: text(s.simpliheat_url), hasDoc: surveyDocs.has(s.id) })),
    subcontracts: (l.subcontracts.get(p.id) ?? []).map((a) => ({ status: a.status })),
    outlook: l.outlook,
    today,
  };
}

/* ── Deadline tasks ──────────────────────────────────────────────────────────── */

const RULES: Record<Deadline['key'], (p: ProjectRow, d: Deadline, cal: DeadlineCal) => { title: string; notes: string }> = {
  mcs: (p, d, cal) => ({
    title: `${d.label} (deadline ${shortDay(d.due)})`,
    notes: `The MCS certificate has to be registered within 10 working days of commissioning (commissioned ${shortDay(cal.ukDay(String(p.commissioned_at)))}).`,
  }),
  g98: (p, d, cal) => ({
    title: `${d.label} (deadline ${shortDay(d.due)})`,
    notes: `The DNO must get the G98 notice within 28 days of the system being switched on (commissioned ${shortDay(cal.ukDay(String(p.commissioned_at)))}). Tick "G98 notice sent" on the job’s checklist once it’s gone.`,
  }),
  regs: (p, d, cal) => ({
    title: `${d.label} (deadline ${shortDay(d.due)})`,
    notes: `Building Regs have to be notified through NICEIC or NAPIT within 30 days of the work (commissioned ${shortDay(cal.ukDay(String(p.commissioned_at)))}).`,
  }),
  bus: (p, d) => ({
    title: `Redeem the BUS voucher (it expires ${shortDay(d.due)})`,
    notes: `A BUS voucher lasts 3 months from the day it’s issued (issued ${shortDay(String(p.paperwork.bus_issued_on ?? ''))}). Once it runs out it has to be applied for again.`,
  }),
  g99: (p, d, cal) => ({
    title: `${d.label} (deadline ${shortDay(d.due)})`,
    notes: `The DNO should answer a G99 application within 45 working days (applied ${shortDay(cal.ukDay(String(p.dno_submitted_at)))}). Chase them if it isn’t approved yet.`,
  }),
};

/**
 * A task for each paperwork deadline that's still open (spec 4.7), once each: the task's source_key
 * ('deadline:mcs:2026-11-06') can only be used once per job. A changed date makes a new task; the
 * old one is left for a person to close. Nothing before crm-v3.sql (no source_key). Returns how many
 * were added. Never throws.
 */
export async function ensureDeadlineTasks(projectId: string, byId: string | null = null): Promise<number> {
  try {
    const db = createAdminClient();
    const { data: raw } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
    if (!raw) return 0;
    const p = projectRow(raw);
    const cal = await calendarNow();
    const open = deadlinesFor(p, cal).filter((d) => !d.done);
    if (!open.length) return 0;
    const { data: have, error } = await db.from('tasks').select('source_key').eq('crm_project_id', projectId).like('source_key', 'deadline:%');
    if (error) return 0;
    const existing = new Set((have ?? []).map((t) => t.source_key as string));
    let added = 0;
    for (const d of open) {
      const key = `deadline:${d.key}:${d.due}`;
      if (existing.has(key)) continue;
      const { title, notes } = RULES[d.key](p, d, cal);
      const { error: e } = await db.from('tasks').insert({
        title,
        notes,
        due_date: d.remind,
        priority: 'high',
        status: 'todo',
        crm_project_id: projectId,
        assignee_id: text(p.owner_id),
        created_by: byId,
        source_key: key,
      });
      if (e) {
        if (e.code === '23505') continue; // added by someone else just now
        return added;
      }
      added++;
      await logActivity({ enquiryId: String(p.enquiry_id), projectId, kind: 'system', body: `Task added: ${title}`, byId }).catch(() => null);
    }
    return added;
  } catch {
    return 0;
  }
}

/** The customer's Enquiries status follows their most advanced open job (as move-stage.ts does after a move). */
export async function syncEnquiryStatus(db: Db, enquiryId: string): Promise<void> {
  const { data: all, error } = await db.from('crm_projects').select('stage').eq('enquiry_id', enquiryId);
  if (error || !all?.length) return;
  const open = all.map((r) => r.stage as string).filter((s) => s !== 'lost' && isStage(s)) as StageKey[];
  const best = open.length ? open.reduce((a, b) => (stageIndex(b) > stageIndex(a) ? b : a)) : 'lost';
  await db.from('enquiries').update({ status: enquiryStatusFor(best) }).eq('id', enquiryId);
}

/** Customer references (customer-refs.sql) by enquiry id. Empty before that's run, or if the read fails. */
export async function customerRefsFor(db: Db, enquiryIds: string[]): Promise<Map<string, string>> {
  const rows = await readAll<{ id: string; customer_ref: string | null }>(enquiryIds, (b, from, to) =>
    db.from('enquiries').select('id, customer_ref').in('id', b).order('id').range(from, to)
  );
  return new Map(rows.filter((r) => r.customer_ref).map((r) => [r.id, r.customer_ref!]));
}

/* ── The CRM pipeline (GET /api/crm/projects) ────────────────────────────────── */

const LIST_COLS =
  'id, enquiry_id, title, stage, products, value, owner_id, postcode, survey_at, install_at, next_step, next_step_at, updated_at, stage_changed_at, created_at';

type ListRow = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  products: string[];
  value: number | null;
  owner_id: string | null;
  postcode: string | null;
  survey_at: string | null;
  install_at: string | null;
  next_step: string | null;
  next_step_at: string | null;
  updated_at: string;
  stage_changed_at: string;
  created_at: string;
};
type Extras = { id: string; first_contact_at?: string | null; project_ref?: string | null; on_hold?: boolean | null; project_started_at?: string | null };
type Enquiry = { id: string; name: string; phone: string | null; email: string | null; postcode: string | null; interest: string | null; source: string | null; status: string; created_at: string };

export type CrmCounts = {
  followUpsDue: number;
  overdue: number;
  newEnquiries: number;
  newToday: number;
  surveysThisWeek: number;
  nextSurvey: { at: string; name: string; projectId: string } | null;
  quotesOut: number;
  quotesValue: number;
  oldestQuoteDays: number | null;
  wonLast30: number;
};

export type PipelineProject = ListRow & {
  customer: string;
  phone: string | null;
  wa_unread: number;
  owner: string;
  next_task: { title: string; due_date: string | null } | null;
  first_contact_at: string | null;
  project_ref: string | null;
  on_hold: boolean | null;
  project_started_at: string | null;
  customer_ref: string | null;
  customer_projects: number;
  possible_duplicate: Duplicate | null;
};

export type Pipeline = { projects: PipelineProject[]; unassigned: Enquiry[]; counts: CrmCounts };

/** The newer columns for the same rows as the list (same order and limit), or nothing before crm-v2/v3.sql. */
async function listExtras(db: Db): Promise<Map<string, Extras>> {
  const read = (cols: string) => db.from('crm_projects').select(cols).order('updated_at', { ascending: false }).limit(PAGE);
  let r = await read('id, first_contact_at, project_ref, on_hold, project_started_at');
  if (r.error) r = await read('id, first_contact_at');
  return new Map(((r.error ? [] : (r.data ?? [])) as unknown as Extras[]).map((x) => [x.id, x]));
}

/** Open job tasks due by today (UK), for Follow-ups due. */
async function tasksDueBy(db: Db, today: string): Promise<{ due_date: string }[]> {
  const { data } = await db
    .from('tasks')
    .select('due_date')
    .not('crm_project_id', 'is', null)
    .neq('status', 'done')
    .lte('due_date', today)
    .limit(PAGE);
  return (data ?? []) as { due_date: string }[];
}

/** The CRM home's five numbers (research 2.1), in UK time. Unread WhatsApp comes from /api/whatsapp/active. */
export function crmCounts(rows: PipelineProject[], unassigned: Enquiry[], tasksDue: { due_date: string }[], now = Date.now()): CrmCounts {
  const today = ukDay(now);
  const weekEnd = plusDays(today, 6);
  const open = (r: PipelineProject) => r.stage !== 'complete' && r.stage !== 'lost';
  const steps = rows.filter((r) => open(r) && r.next_step && r.next_step_at).map((r) => ukDay(r.next_step_at!));
  const fresh = rows.filter((r) => r.stage === 'lead' && !r.first_contact_at);
  const surveys = rows.filter((r) => r.survey_at && r.stage !== 'lost');
  const upcoming = surveys
    .filter((r) => open(r) && Date.parse(r.survey_at!) >= now)
    .sort((a, b) => a.survey_at!.localeCompare(b.survey_at!))[0];
  const quotes = rows.filter((r) => r.stage === 'quote_sent');
  const since = now - 30 * 86_400_000;
  return {
    followUpsDue: tasksDue.length + steps.filter((d) => d <= today).length,
    overdue: tasksDue.filter((t) => t.due_date < today).length + steps.filter((d) => d < today).length,
    newEnquiries: fresh.length + unassigned.length,
    newToday: fresh.filter((r) => ukDay(r.created_at) === today).length + unassigned.filter((e) => ukDay(e.created_at) === today).length,
    surveysThisWeek: surveys.filter((r) => {
      const d = ukDay(r.survey_at!);
      return d >= today && d <= weekEnd;
    }).length,
    nextSurvey: upcoming ? { at: upcoming.survey_at!, name: upcoming.customer, projectId: upcoming.id } : null,
    quotesOut: quotes.length,
    quotesValue: quotes.reduce((n, r) => n + (Number(r.value) || 0), 0),
    oldestQuoteDays: quotes.length ? Math.max(...quotes.map((r) => daysBetween(ukDay(r.stage_changed_at), today))) : null,
    wonLast30: rows.filter((r) => isProjectStage(r.stage) && Date.parse(r.project_started_at || r.stage_changed_at) >= since).length,
  };
}

/** The CRM pipeline: opportunities and jobs, new enquiries without one, and the home page's counts. */
export async function pipeline(): Promise<Pipeline | { error: string }> {
  const db = createAdminClient();
  const [{ data: projects, error }, { data: recent }, extras] = await Promise.all([
    db.from('crm_projects').select(LIST_COLS).order('updated_at', { ascending: false }).limit(PAGE),
    db.from('enquiries').select('id, name, phone, email, postcode, interest, source, status, created_at').order('created_at', { ascending: false }).limit(200),
    listExtras(db),
  ]);
  if (error) return { error: error.message };
  const list = (projects ?? []) as ListRow[];

  const enquiryIds = [...new Set(list.map((p) => p.enquiry_id))];
  const ownerIds = [...new Set(list.map((p) => p.owner_id).filter(Boolean))] as string[];
  const projectIds = list.map((p) => p.id);
  const today = ukDay(Date.now());
  const [customers, owners, open, refs, dupes, tasksDue] = await Promise.all([
    readAll<{ id: string; name: string; phone: string | null; wa_unread: number }>(enquiryIds, (b, from, to) =>
      db.from('enquiries').select('id, name, phone, wa_unread').in('id', b).order('id').range(from, to)
    ),
    readAll<{ id: string; full_name: string | null; email: string | null }>(ownerIds, (b, from, to) =>
      db.from('profiles').select('id, full_name, email').in('id', b).order('id').range(from, to)
    ),
    // The soonest open task on each opportunity (shown when it has no next step).
    readAll<{ crm_project_id: string; title: string; due_date: string | null }>(projectIds, (b, from, to) =>
      db
        .from('tasks')
        .select('crm_project_id, title, due_date')
        .in('crm_project_id', b)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('id')
        .range(from, to)
    ),
    customerRefsFor(db, enquiryIds),
    possibleDuplicates(enquiryIds),
    tasksDueBy(db, today),
  ]);
  const nextTask = new Map<string, { title: string; due_date: string | null }>();
  const soonest = [...open].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  for (const t of soonest) if (!nextTask.has(t.crm_project_id)) nextTask.set(t.crm_project_id, { title: t.title, due_date: t.due_date });
  const cust = new Map(customers.map((c) => [c.id, c]));
  const own = new Map(owners.map((o) => [o.id, o.full_name || o.email || '']));
  const perCustomer = new Map<string, number>();
  for (const p of list) perCustomer.set(p.enquiry_id, (perCustomer.get(p.enquiry_id) ?? 0) + 1);
  const withProject = new Set(enquiryIds);

  const rows: PipelineProject[] = list.map((p) => {
    const x = extras.get(p.id);
    return {
      ...p,
      customer: cust.get(p.enquiry_id)?.name ?? '',
      phone: cust.get(p.enquiry_id)?.phone ?? null,
      wa_unread: cust.get(p.enquiry_id)?.wa_unread ?? 0,
      owner: p.owner_id ? (own.get(p.owner_id) ?? '') : '',
      next_task: nextTask.get(p.id) ?? null,
      first_contact_at: x?.first_contact_at ?? null,
      project_ref: x?.project_ref ?? null,
      on_hold: x?.on_hold ?? null,
      project_started_at: x?.project_started_at ?? null,
      customer_ref: refs.get(p.enquiry_id) ?? null,
      customer_projects: perCustomer.get(p.enquiry_id) ?? 1,
      possible_duplicate: dupes.get(p.enquiry_id)?.[0] ?? null,
    };
  });
  // Leads not yet turned into a project (excluding lost ones).
  const unassigned = ((recent ?? []) as Enquiry[]).filter((e) => !withProject.has(e.id) && e.status !== 'lost').slice(0, 30);
  return { projects: rows, unassigned, counts: crmCounts(rows, unassigned, tasksDue) };
}

/* ── The Projects list (GET /api/crm/projects?scope=projects) ────────────────── */

export type NextDate = { kind: 'survey' | 'install'; at: string; days?: number; dates?: string[] };

export type ProjectListRow = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  products: string[];
  value: number | null;
  owner_id: string | null;
  owner: string;
  postcode: string | null;
  address: string | null;
  survey_at: string | null;
  install_at: string | null;
  install_days: number;
  install_dates: string[];
  install_team: string[];
  team: string[];
  scaffold_up_on: string | null;
  scaffold_down_on: string | null;
  project_ref: string | null;
  project_started_at: string | null;
  on_hold: boolean;
  hold_reason: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  dno_status: string | null;
  updated_at: string;
  stage_changed_at: string;
  created_at: string;
  customer: { id: string; name: string; phone: string | null; postcode: string | null; customer_ref: string | null } | null;
  customer_ref: string | null;
  customer_projects: number;
  possible_duplicate: Duplicate | null;
  progress: { done: number; total: number; keyMissing: number };
  deadlines: Deadline[];
  flags: string[];
  /** The flags that put the job in "Needs attention". */
  attention: string[];
  needs_attention: boolean;
  next_date: NextDate | null;
};

const DEADLINE_SHORT: Record<Deadline['key'], string> = { mcs: 'MCS', g98: 'G98 notice', regs: 'Building Regs', bus: 'BUS voucher', g99: 'G99 chase' };

/** The next survey or install that hasn't finished yet (an install counts until its last working day). */
export function nextDate(p: ProjectRow, cal: DeadlineCal): NextDate | null {
  const options: NextDate[] = [];
  const install = text(p.install_at);
  if (install) {
    const days = Math.max(1, Number(p.install_days) || 1);
    const dates = installDayList(cal.ukDay(install), days, cal.hols);
    if (dates[dates.length - 1] >= cal.today) options.push({ kind: 'install', at: install, days, dates });
  }
  const survey = text(p.survey_at);
  if (survey && cal.ukDay(survey) >= cal.today) options.push({ kind: 'survey', at: survey });
  return options.sort((a, b) => a.at.localeCompare(b.at))[0] ?? null;
}

/** The flags on a Projects row, and which of them need attention (spec 4.5). */
export function projectFlags(p: ProjectRow, deadlines: Deadline[], cal: DeadlineCal, duplicate: boolean, now = Date.now()) {
  const flags: string[] = [];
  const attention: string[] = [];
  if (p.on_hold) flags.push('On hold');
  const started = text(p.project_started_at);
  if (Number(p.deposit_amount) > 0 && !p.deposit_paid_at) {
    flags.push('Deposit due');
    if (started && now - Date.parse(started) > 7 * 86_400_000) attention.push('Deposit due');
  }
  const submitted = text(p.dno_submitted_at);
  if (p.dno_status === 'submitted' && submitted) {
    const day = cal.ukDay(submitted);
    const label = `DNO waiting ${daysBetween(day, cal.today)} days`;
    flags.push(label);
    if (p.paperwork.dno_route !== 'g98' && cal.addWorkingDays(day, 45, cal.hols) < cal.today) attention.push(label);
  }
  for (const d of deadlines) {
    if (d.done || d.key === 'g99') continue;
    const name = DEADLINE_SHORT[d.key];
    if (d.key === 'bus') {
      if (d.daysLeft > 30) continue;
      const label = d.daysLeft < 0 ? 'BUS voucher expired' : `BUS voucher expires in ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'}`;
      flags.push(label);
      attention.push(label);
      continue;
    }
    if (d.daysLeft > 14) continue;
    const label =
      d.daysLeft < 0 ? `${name} ${-d.daysLeft} day${d.daysLeft === -1 ? '' : 's'} late` : d.daysLeft === 0 ? `${name} due today` : `${name} due in ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'}`;
    flags.push(label);
    if (d.daysLeft < 0) attention.push(label);
  }
  if (duplicate) flags.push('Possible duplicate');
  return { flags, attention };
}

/**
 * Every job from Won onwards (and Lost ones that got that far), with its customer, checklist progress,
 * flags and next date. `ready: false` before crm-v3.sql, which says when a job became a project.
 */
export async function projectsList(): Promise<{ ready: boolean; projects: ProjectListRow[] }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('crm_projects')
    .select('*')
    .not('project_started_at', 'is', null)
    .in('stage', [...PROJECT_STAGES, 'lost'])
    .order('project_started_at', { ascending: false })
    .limit(PAGE);
  if (error) return { ready: false, projects: [] };
  const projects = ((data ?? []) as Record<string, unknown>[]).map(projectRow);
  if (!projects.length) return { ready: true, projects: [] };

  const enquiryIds = [...new Set(projects.map((p) => String(p.enquiry_id)))];
  const people = [...new Set(projects.flatMap((p) => [text(p.owner_id), ...arr<string>(p.install_team)]).filter((x): x is string => !!x))];
  type Cust = { id: string; name: string; phone: string | null; postcode: string | null; customer_ref?: string | null };
  const [lookups, cal, customers, profiles, theirJobs, dupes] = await Promise.all([
    jobLookups(db, projects),
    calendarNow(),
    readAll<Cust>(enquiryIds, (b, from, to) =>
      withFallback<Cust>(
        (cols) => db.from('enquiries').select(cols).in('id', b).order('id').range(from, to) as unknown as PromiseLike<Res<Cust>>,
        'id, name, phone, postcode',
        'customer_ref'
      )
    ),
    readAll<{ id: string; full_name: string | null; email: string | null }>(people, (b, from, to) =>
      db.from('profiles').select('id, full_name, email').in('id', b).order('id').range(from, to)
    ),
    readAll<{ enquiry_id: string }>(enquiryIds, (b, from, to) => db.from('crm_projects').select('enquiry_id').in('enquiry_id', b).order('id').range(from, to)),
    possibleDuplicates(enquiryIds),
  ]);
  const cust = new Map(customers.map((c) => [c.id, c]));
  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || p.email || '']));
  const perCustomer = new Map<string, number>();
  for (const j of theirJobs) perCustomer.set(j.enquiry_id, (perCustomer.get(j.enquiry_id) ?? 0) + 1);

  const rows = projects.map((p): ProjectListRow => {
    const enquiryId = String(p.enquiry_id);
    const c = cust.get(enquiryId);
    const ctx = checkCtxFor(p, lookups, cal.today);
    const deadlines = deadlinesFor(p, cal);
    const duplicate = dupes.get(enquiryId)?.[0] ?? null;
    const { flags, attention } = projectFlags(p, deadlines, cal, !!duplicate);
    const team = arr<string>(p.install_team);
    const installDays = Math.max(1, Number(p.install_days) || 1);
    const install = text(p.install_at);
    return {
      id: p.id,
      enquiry_id: enquiryId,
      title: String(p.title ?? ''),
      stage: p.stage,
      products: p.products,
      value: p.value == null ? null : Number(p.value),
      owner_id: text(p.owner_id),
      owner: text(p.owner_id) ? (nameOf.get(String(p.owner_id)) ?? '') : '',
      postcode: text(p.postcode),
      address: text(p.address),
      survey_at: text(p.survey_at),
      install_at: install,
      install_days: installDays,
      install_dates: install ? installDayList(cal.ukDay(install), installDays, cal.hols) : [],
      install_team: team,
      team: team.map((id) => nameOf.get(id) ?? '').filter(Boolean),
      scaffold_up_on: text(p.scaffold_up_on),
      scaffold_down_on: text(p.scaffold_down_on),
      project_ref: text(p.project_ref),
      project_started_at: text(p.project_started_at),
      on_hold: !!p.on_hold,
      hold_reason: text(p.hold_reason),
      deposit_amount: p.deposit_amount == null ? null : Number(p.deposit_amount),
      deposit_paid_at: text(p.deposit_paid_at),
      dno_status: text(p.dno_status),
      updated_at: String(p.updated_at ?? ''),
      stage_changed_at: String(p.stage_changed_at ?? ''),
      created_at: String(p.created_at ?? ''),
      customer: c ? { id: c.id, name: c.name, phone: c.phone, postcode: c.postcode, customer_ref: c.customer_ref ?? null } : null,
      customer_ref: c?.customer_ref ?? null,
      customer_projects: perCustomer.get(enquiryId) ?? 1,
      possible_duplicate: duplicate,
      progress: stageProgress(ctx, p.stage),
      deadlines,
      flags,
      attention,
      needs_attention: attention.length > 0,
      next_date: p.stage === 'lost' || p.stage === 'complete' ? null : nextDate(p, cal),
    };
  });
  return { ready: true, projects: rows };
}
