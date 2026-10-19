import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, DOCS_BUCKET, thumbPath } from '@/lib/crm/server';
import { surveyTypeFor } from '@/lib/crm/stages';
import { cleanMarkup } from './markup';
import { evaluate, type Evaluation, type PhotoInfo } from './rules';
import {
  ENA_PHOTOS,
  enaFileName,
  MAX_ROOFS,
  ROOF_ID_RE,
  SOLAR_SCHEMA,
  SOLAR_SCHEMA_VERSION,
  type Answers,
  type RoofAnswers,
  type SurveyKind,
  type SurveyPayload,
  type SurveyPhoto,
  type SurveyStatus,
} from './solar-schema';

/**
 * Survey server helpers: reading a survey with its photos (signed for 12 hours so the phone's copy
 * still shows them offline), making the open survey for a job, saving flags and tasks.
 * Everything reads new tables and columns defensively: before surveys.sql has run it returns
 * nothing rather than throwing.
 */

type Db = ReturnType<typeof createAdminClient>;

export const SIGNED_SECONDS = 12 * 3600;
export const OPEN_STATUSES: SurveyStatus[] = ['booked', 'draft'];
export const isOpen = (s: string) => s === 'booked' || s === 'draft';
export const isSurveyKind = (k: unknown): k is SurveyKind => k === 'solar' || k === 'ashp';
export const kindLabel = (k: string) => (k === 'ashp' ? 'Heat pump survey' : 'Solar survey');

/** True once surveys.sql has been run. */
export async function surveysReady(): Promise<boolean> {
  return (await schemaReady()).surveys;
}

export type SurveyRow = {
  id: string;
  project_id: string;
  enquiry_id: string;
  type: SurveyKind;
  status: SurveyStatus;
  surveyor_id: string | null;
  booking_id: string | null;
  schema_version: number;
  answers: Answers | null;
  rev: number;
  answers_saved_at: string | null;
  flags: string[] | null;
  summary: Record<string, unknown> | null;
  simpliheat_url: string | null;
  notes: string | null;
  started_at: string | null;
  finished_on_site_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  customer_signed_name: string | null;
  customer_signature: string | null;
  customer_signed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** A job, read with select('*') because some of its columns arrive with later SQL files. */
export type ProjectRow = Record<string, unknown> & {
  id: string;
  enquiry_id: string;
  title: string | null;
  stage: string;
  products: string[] | null;
  address: string | null;
  postcode: string | null;
  survey_at: string | null;
  owner_id: string | null;
  simpliheat_url: string | null;
};

export type PhotoRow = {
  id: string;
  project_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
  survey_id?: string | null;
  slot?: string | null;
  markup?: unknown;
  markup_path?: string | null;
};

export async function getSurvey(db: Db, id: string): Promise<SurveyRow | null> {
  const { data } = await db
    .from('crm_surveys')
    .select('*')
    .eq('id', id)
    .maybeSingle()
    .then(
      (r) => r,
      () => ({ data: null })
    );
  return (data as SurveyRow | null) ?? null;
}

export async function getProject(db: Db, id: string): Promise<ProjectRow | null> {
  const { data } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
  return (data as ProjectRow | null) ?? null;
}

export async function surveyPhotos(db: Db, surveyId: string): Promise<PhotoRow[]> {
  const { data } = await db
    .from('crm_photos')
    .select('*')
    .eq('survey_id', surveyId)
    .order('created_at', { ascending: true })
    .then(
      (r) => r,
      () => ({ data: [] })
    );
  return (data ?? []) as PhotoRow[];
}

export const photoInfo = (rows: PhotoRow[]): PhotoInfo[] =>
  rows.filter((p) => p.slot).map((p) => ({ slot: p.slot as string, hasMarkup: !!cleanMarkup(p.markup) }));

export const productsOf = (p: ProjectRow | null): string[] => (Array.isArray(p?.products) ? (p.products as string[]) : []);

/** The rules for a solar survey (empty for a heat pump one). */
export function evaluateSurvey(s: Pick<SurveyRow, 'answers'>, products: string[], photos: PhotoRow[]): Evaluation {
  return evaluate(SOLAR_SCHEMA, s.answers ?? {}, photoInfo(photos), products);
}

/* ── Answers from the phone ───────────────────────────────────────────────────── */

const KEY_RE = /^[A-Z][0-9A-Za-z_]{0,20}$/;
const MAX_ANSWERS_BYTES = 256 * 1024;

/** A safe copy of the answers the phone sent, or null if they can't be used. */
export function cleanAnswers(x: unknown): Answers | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  let size = 0;
  try {
    size = JSON.stringify(x).length;
  } catch {
    return null;
  }
  if (size > MAX_ANSWERS_BYTES) return null;
  const src = x as Record<string, unknown>;
  const out: Answers = {};
  for (const [k, v] of Object.entries(src)) {
    if (v == null || !KEY_RE.test(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 10_000) : v;
  }
  if (Array.isArray(src.roofs)) {
    const seen = new Set<string>();
    const roofs: RoofAnswers[] = [];
    for (const r of src.roofs) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      const id = String((r as RoofAnswers).id ?? '');
      if (!ROOF_ID_RE.test(id) || seen.has(id) || roofs.length >= MAX_ROOFS) continue;
      seen.add(id);
      const roof: RoofAnswers = { id };
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        if (v != null && KEY_RE.test(k)) roof[k] = typeof v === 'string' ? v.slice(0, 10_000) : v;
      }
      roofs.push(roof);
    }
    out.roofs = roofs;
  }
  for (const k of ['skip', 'send'] as const) {
    const m = src[k];
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const clean: Record<string, string | boolean> = {};
    for (const [key, v] of Object.entries(m as Record<string, unknown>)) {
      if (!/^[A-Z][0-9A-Za-z]{0,5}(:r[1-6])?$/.test(key)) continue;
      if (k === 'skip' && typeof v === 'string' && v.trim()) clean[key] = v.trim().slice(0, 300);
      if (k === 'send' && v === true) clean[key] = true;
    }
    if (Object.keys(clean).length) (out as Record<string, unknown>)[k] = clean;
  }
  return out;
}

const isEmpty = (a: Answers | null | undefined) => !a || Object.keys(a).length === 0;

/** What the survey covers, from the job's products (A4). */
export function scopeFor(products: string[]): string {
  const solar = products.includes('solar');
  const battery = products.includes('battery');
  if (solar && battery && products.includes('ev')) return 'solar_battery_ev';
  if (solar && battery) return 'solar_battery';
  if (battery && !solar) return 'battery_only';
  return 'solar';
}

/**
 * Pre-filled answers for a new solar survey: the site address, the scope and the first roof area.
 * A3.was is the job's own address at the time, so finishing only changes the job's address if the
 * surveyor changed it (not because the office corrected the job meanwhile).
 */
export function defaultsFor(project: ProjectRow, customerPostcode?: string | null): Answers {
  const address = String(project.address ?? '').trim();
  return {
    A3: {
      address,
      postcode: String(project.postcode ?? customerPostcode ?? '').trim().toUpperCase(),
      was: { address, postcode: String(project.postcode ?? '').trim().toUpperCase() },
    },
    A4: scopeFor(productsOf(project)),
    roofs: [{ id: 'r1', R1: 'Roof area 1' }],
  };
}

/* ── The full survey for the phone (GET /api/crm/surveys/{id} and the offline pack) ── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Photos queued on the phone are named after their queue id ({client_id}.jpg). */
const clientIdOf = (path: string) => {
  const base = path.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? '';
  return UUID_RE.test(base) ? base.toLowerCase() : null;
};

async function signAll(db: Db, bucket: string, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < list.length; i += 100) {
    const { data } = await db.storage.from(bucket).createSignedUrls(list.slice(i, i + 100), SIGNED_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) out.set(s.path, s.signedUrl);
  }
  return out;
}

export function photoPayload(rows: PhotoRow[], signed: Map<string, string>): SurveyPhoto[] {
  return rows.map((p) => ({
    id: p.id,
    slot: p.slot ?? null,
    url: signed.get(p.storage_path) ?? null,
    thumb: signed.get(thumbPath(p.storage_path)) ?? null,
    markup: cleanMarkup(p.markup),
    markupUrl: p.markup_path ? signed.get(p.markup_path) ?? null : null,
    width: p.width ?? null,
    height: p.height ?? null,
    created_at: p.created_at,
    clientId: clientIdOf(p.storage_path),
  }));
}

export async function signPhotos(db: Db, rows: PhotoRow[]): Promise<SurveyPhoto[]> {
  const signed = await signAll(
    db,
    CRM_BUCKET,
    rows.flatMap((p) => [p.storage_path, thumbPath(p.storage_path), p.markup_path ?? ''])
  );
  return photoPayload(rows, signed);
}

/**
 * Download links for the ENA photos (the main cut-out and the meter), keyed by photo id: the original
 * file, without any drawing, saved as "HX-0042-main-cut-out.jpg" (`base` is the job's ref, or the
 * customer's name before refs exist). Empty if there are none or the storage can't be reached.
 */
export async function enaDownloads(db: Db, surveyId: string, base: string): Promise<Record<string, string>> {
  const rows = await surveyPhotos(db, surveyId);
  const out: Record<string, string> = {};
  await Promise.all(
    ENA_PHOTOS.flatMap(({ slot, file }) => {
      const list = rows.filter((p) => p.slot === slot);
      return list.map(async (p, i) => {
        const ext = /\.([a-z0-9]+)$/i.exec(p.storage_path)?.[1] ?? 'jpg';
        const name = enaFileName(base, file, i + 1, list.length, ext);
        const { data } = await db.storage
          .from(CRM_BUCKET)
          .createSignedUrl(p.storage_path, SIGNED_SECONDS, { download: name })
          .then(
            (r) => r,
            () => ({ data: null })
          );
        if (data?.signedUrl) out[p.id] = data.signedUrl;
      });
    })
  );
  return out;
}

const nameOf = (p: { full_name?: string | null; email?: string | null } | undefined) => (p ? p.full_name || p.email || 'Team' : null);

export async function buildPayload(db: Db, s: SurveyRow, known?: { project?: ProjectRow | null }): Promise<SurveyPayload | null> {
  const project = known?.project ?? (await getProject(db, s.project_id));
  if (!project) return null;
  const people = [s.surveyor_id, s.completed_by].filter(Boolean) as string[];
  const [{ data: customer }, photos, { data: docs }, { data: profiles }] = await Promise.all([
    db.from('enquiries').select('id, name, phone, email, postcode').eq('id', s.enquiry_id).maybeSingle(),
    surveyPhotos(db, s.id),
    db
      .from('crm_documents')
      .select('*')
      .eq('survey_id', s.id)
      .order('created_at', { ascending: false })
      .then(
        (r) => r,
        () => ({ data: [] })
      ),
    people.length ? db.from('profiles').select('id, full_name, email').in('id', people) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);
  type Doc = { id: string; name: string; category: string; mime: string | null; size: number | null; storage_path: string; created_at: string };
  const docRows = (docs ?? []) as Doc[];
  const [signedPhotos, signedDocs] = await Promise.all([
    signPhotos(db, photos),
    signAll(db, DOCS_BUCKET, [...docRows.map((d) => d.storage_path), s.customer_signature ?? '']),
  ]);
  const who = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const answers = s.answers ?? {};
  return {
    survey: {
      id: s.id,
      project_id: s.project_id,
      enquiry_id: s.enquiry_id,
      type: s.type,
      status: s.status,
      surveyor_id: s.surveyor_id,
      surveyor: s.surveyor_id ? nameOf(who.get(s.surveyor_id)) : null,
      booking_id: s.booking_id,
      schema_version: s.schema_version,
      answers,
      rev: s.rev,
      answers_saved_at: s.answers_saved_at,
      flags: s.flags ?? [],
      summary: s.summary,
      simpliheat_url: s.simpliheat_url,
      notes: s.notes,
      started_at: s.started_at,
      finished_on_site_at: s.finished_on_site_at,
      completed_at: s.completed_at,
      completed_by: s.completed_by,
      completed_by_name: s.completed_by ? nameOf(who.get(s.completed_by)) : null,
      customer_signed_name: s.customer_signed_name,
      customer_signed_at: s.customer_signed_at,
      signatureUrl: s.customer_signature ? signedDocs.get(s.customer_signature) ?? null : null,
      created_at: s.created_at,
      updated_at: s.updated_at,
    },
    defaults: s.type === 'solar' && isEmpty(answers) && isOpen(s.status) ? defaultsFor(project, customer?.postcode) : null,
    project: {
      id: project.id,
      title: project.title,
      ref: (project.project_ref as string | null | undefined) ?? null,
      address: project.address,
      postcode: project.postcode,
      products: productsOf(project),
      stage: project.stage,
      survey_at: project.survey_at,
      survey_minutes: (project.survey_minutes as number | null | undefined) ?? null,
      survey_type: (project.survey_type as string | null | undefined) ?? null,
      simpliheat_url: project.simpliheat_url,
    },
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email } : null,
    photos: signedPhotos,
    documents: docRows.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      mime: d.mime,
      size: d.size,
      url: signedDocs.get(d.storage_path) ?? null,
      created_at: d.created_at,
    })),
    schemaVersion: SOLAR_SCHEMA_VERSION,
    fetchedAt: new Date().toISOString(),
  };
}

/* ── Making the open survey for a job ─────────────────────────────────────────── */

/**
 * The job's open survey of this type, made if there isn't one: 'booked' if the job's survey date is
 * still ahead (or `status` says so), otherwise 'draft' and started now. The unique index on open
 * surveys means two taps (or a booking and a tap) can't make two; on a clash the other one is returned.
 */
export async function ensureOpenSurvey(
  db: Db,
  project: ProjectRow,
  type: SurveyKind,
  opts: { byId: string | null; status?: 'booked' | 'draft' }
): Promise<{ id: string; status: SurveyStatus; created: boolean } | null> {
  const findOpen = async () => {
    const { data } = await db
      .from('crm_surveys')
      .select('id, status')
      .eq('project_id', project.id)
      .eq('type', type)
      .in('status', OPEN_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(
        (r) => r,
        () => ({ data: null })
      );
    const row = (data ?? [])[0] as { id: string; status: SurveyStatus } | undefined;
    return row ? { id: row.id, status: row.status, created: false } : null;
  };
  const open = await findOpen();
  if (open) return open;
  const future = !!project.survey_at && Date.parse(project.survey_at) > Date.now();
  const status = opts.status ?? (future ? 'booked' : 'draft');
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('crm_surveys')
    .insert({
      project_id: project.id,
      enquiry_id: project.enquiry_id,
      type,
      status,
      schema_version: SOLAR_SCHEMA_VERSION,
      booking_id: (project.survey_booking_id as string | null | undefined) ?? null,
      surveyor_id: status === 'draft' ? opts.byId : null,
      started_at: status === 'draft' ? now : null,
      created_by: opts.byId,
    })
    .select('id, status')
    .single();
  if (data) return { id: data.id as string, status: data.status as SurveyStatus, created: true };
  if (error?.code === '23505') return findOpen();
  return null;
}

/**
 * A survey has started, so someone is with the customer: no "hasn't been contacted" alert or new-lead
 * follow-ups for this job (a survey on an existing customer's new opportunity, say). Each stamp is
 * only filled if empty; errors are ignored.
 */
export async function markCustomerSeen(db: Db, projectId: string): Promise<void> {
  const at = new Date().toISOString();
  await Promise.all(
    (['first_contact_at', 'first_response_alerted_at', 'sequence_stopped_at'] as const).map((col) =>
      db
        .from('crm_projects')
        .update({ [col]: at })
        .eq('id', projectId)
        .is(col, null)
        .then(
          () => null,
          () => null
        )
    )
  );
}

/** The survey kinds a job needs: its survey type if booked with one, else from its products. */
export function kindsFor(project: ProjectRow): SurveyKind[] {
  const t = (project.survey_type as string | null | undefined) || surveyTypeFor(productsOf(project));
  return t === 'solar_ashp' ? ['solar', 'ashp'] : t === 'solar' ? ['solar'] : t === 'ashp' ? ['ashp'] : [];
}

/* ── Flags and tasks ──────────────────────────────────────────────────────────── */

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Work out a survey's red flags again (after a photo, a drawing or a delete) and save them. On a
 * complete survey with no drawings left, the "Finish the drawings" task closes itself. Never throws.
 */
export async function recomputeFlags(surveyId: string): Promise<{ flags: string[]; drawingsLeft: number } | null> {
  try {
    const db = createAdminClient();
    const s = await getSurvey(db, surveyId);
    if (!s || s.type !== 'solar') return null;
    const [project, photos] = await Promise.all([getProject(db, s.project_id), surveyPhotos(db, s.id)]);
    const ev = evaluateSurvey(s, productsOf(project), photos);
    if (!sameList(ev.flags, s.flags ?? [])) await db.from('crm_surveys').update({ flags: ev.flags, updated_at: new Date().toISOString() }).eq('id', s.id);
    if (s.status === 'complete' && !ev.drawingsToDo.length) await closeSourceTask(db, s.project_id, `survey-drawings:${s.id}`);
    return { flags: ev.flags, drawingsLeft: ev.drawingsToDo.length };
  } catch {
    return null;
  }
}

/** Mark the job's task with this source key done (if it's still open). */
export async function closeSourceTask(db: Db, projectId: string, key: string) {
  const now = new Date().toISOString();
  await db
    .from('tasks')
    .update({ status: 'done', completed_at: now, updated_at: now })
    .eq('crm_project_id', projectId)
    .eq('source_key', key)
    .neq('status', 'done')
    .then(
      () => null,
      () => null
    );
}

/**
 * One task per source per job (tasks.source_key, crm-v3.sql). Before that column exists the task is
 * made without it. True if a task was made.
 */
export async function addSourceTask(
  db: Db,
  t: { projectId: string; key: string; title: string; notes?: string | null; assigneeId?: string | null; createdBy?: string | null; dueDate?: string | null }
): Promise<boolean> {
  const { data: existing, error: lookErr } = await db
    .from('tasks')
    .select('id')
    .eq('crm_project_id', t.projectId)
    .eq('source_key', t.key)
    .limit(1)
    .then(
      (r) => r,
      () => ({ data: null, error: { message: 'missing' } })
    );
  if (existing?.length) return false;
  const row: Record<string, unknown> = {
    title: t.title.slice(0, 300),
    notes: t.notes ?? null,
    status: 'todo',
    priority: 'normal',
    crm_project_id: t.projectId,
    assignee_id: t.assigneeId ?? null,
    created_by: t.createdBy ?? null,
    due_date: t.dueDate ?? null,
  };
  // A clash on the unique (job, source_key) index means another request has just made it.
  const { error } = await db.from('tasks').insert(lookErr ? row : { ...row, source_key: t.key });
  return !error;
}

/* ── Dates (UK) ───────────────────────────────────────────────────────────────── */

/** The instant a UK wall-clock time happens ("2026-10-25", "00:00" → 2026-10-24T23:00Z). */
export function ukInstant(ymd: string, hhmm = '00:00'): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let t = wall;
  for (let i = 0; i < 3; i++) t = wall - ukOffsetMs(t);
  return new Date(t);
}

function ukOffsetMs(t: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return asUtc - Math.floor(t / 60_000) * 60_000;
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const ukToday = () => ukDay(Date.now());

/* ── Words ────────────────────────────────────────────────────────────────────── */

export const firstName = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || 'the customer';
export const personName = (p: { full_name?: string | null; email?: string | null } | null | undefined) =>
  (p?.full_name || '').trim().split(/\s+/)[0] || p?.email || 'Someone';
