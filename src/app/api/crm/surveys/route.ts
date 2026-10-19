import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { DRAWINGS_FLAG } from '@/lib/surveys/rules';
import { ensureOpenSurvey, getProject, isOpen, isSurveyKind, kindLabel, markCustomerSeen, surveysReady, ukInstant } from '@/lib/surveys/server';
import type { SurveyStatus } from '@/lib/surveys/solar-schema';

export const dynamic = 'force-dynamic';

const STATUSES: SurveyStatus[] = ['booked', 'draft', 'complete', 'cancelled'];

/** A date filter: 'YYYY-MM-DD' (UK midnight) or a full ISO time. */
function when(v: string | null): number | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return ukInstant(v).getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

async function inBatches<T>(ids: string[], read: (batch: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...(((await read(ids.slice(i, i + 100))).data ?? []) as T[]));
  return out;
}

/**
 * Surveys for the lists: ?status=booked,draft&from&to&project_id&mine=1&sort=desc.
 * The date is the job's survey date while a survey is open, else when it was completed.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await surveysReady())) return json({ ready: false, surveys: [] });
  const sp = new URL(req.url).searchParams;
  const asked = (sp.get('status') || '').split(',').filter((x): x is SurveyStatus => (STATUSES as string[]).includes(x));
  const statuses = asked.length ? asked : (['booked', 'draft', 'complete'] as SurveyStatus[]);
  const projectId = sp.get('project_id');
  const from = when(sp.get('from'));
  const to = when(sp.get('to'));
  const db = createAdminClient();

  let q = db
    .from('crm_surveys')
    .select('id, project_id, enquiry_id, type, status, surveyor_id, booking_id, flags, started_at, finished_on_site_at, completed_at, created_at, updated_at')
    .in('status', statuses)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (projectId && isUuid(projectId)) q = q.eq('project_id', projectId);
  if (sp.get('mine') === '1') q = q.eq('surveyor_id', s.user.id);
  const { data: rows, error } = await q;
  if (error) return json({ ready: false, surveys: [] });

  type Row = {
    id: string;
    project_id: string;
    enquiry_id: string;
    type: string;
    status: SurveyStatus;
    surveyor_id: string | null;
    booking_id: string | null;
    flags: string[] | null;
    started_at: string | null;
    finished_on_site_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  };
  const list = (rows ?? []) as Row[];
  const projectIds = [...new Set(list.map((r) => r.project_id))];
  const enquiryIds = [...new Set(list.map((r) => r.enquiry_id))];
  const people = [...new Set(list.map((r) => r.surveyor_id).filter(Boolean) as string[])];
  type P = Record<string, unknown> & { id: string; title: string | null; stage: string; address: string | null; postcode: string | null; survey_at: string | null };
  type C = { id: string; name: string | null; phone: string | null; postcode: string | null };
  const [projects, customers, profiles] = await Promise.all([
    inBatches<P>(projectIds, (b) => db.from('crm_projects').select('*').in('id', b)),
    inBatches<C>(enquiryIds, (b) => db.from('enquiries').select('id, name, phone, postcode').in('id', b)),
    inBatches<{ id: string; full_name: string | null; email: string | null }>(people, (b) => db.from('profiles').select('id, full_name, email').in('id', b)),
  ]);
  const pOf = new Map(projects.map((p) => [p.id, p]));
  const cOf = new Map(customers.map((c) => [c.id, c]));
  const who = new Map(profiles.map((p) => [p.id, p.full_name || p.email || 'Team']));

  const surveys = list
    .map((r) => {
      const p = pOf.get(r.project_id);
      const c = cOf.get(r.enquiry_id);
      const date = isOpen(r.status) ? p?.survey_at ?? null : r.completed_at ?? r.updated_at;
      const flags = r.flags ?? [];
      return {
        id: r.id,
        project_id: r.project_id,
        enquiry_id: r.enquiry_id,
        type: r.type,
        status: r.status,
        customer: c?.name ?? null,
        phone: c?.phone ?? null,
        postcode: p?.postcode || c?.postcode || null,
        address: p?.address ?? null,
        title: p?.title ?? null,
        ref: (p?.project_ref as string | null | undefined) ?? null,
        stage: p?.stage ?? null,
        date,
        minutes: (p?.survey_minutes as number | null | undefined) ?? null,
        surveyor_id: r.surveyor_id,
        surveyor: r.surveyor_id ? who.get(r.surveyor_id) ?? null : null,
        flags,
        flagsCount: flags.filter((f) => f !== DRAWINGS_FLAG).length,
        drawingsToDo: flags.includes(DRAWINGS_FLAG),
        booking_id: r.booking_id,
        started_at: r.started_at,
        finished_on_site_at: r.finished_on_site_at,
        completed_at: r.completed_at,
        updated_at: r.updated_at,
      };
    })
    .filter((r) => {
      if (from == null && to == null) return true;
      const t = r.date ? Date.parse(r.date) : NaN;
      if (Number.isNaN(t)) return false;
      return (from == null || t >= from) && (to == null || t < to);
    });

  const desc = sp.get('sort') === 'desc';
  surveys.sort((a, b) => {
    const ta = a.date ? Date.parse(a.date) : NaN;
    const tb = b.date ? Date.parse(b.date) : NaN;
    if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1; // not dated last
    if (!Number.isNaN(ta) && ta !== tb) return desc ? tb - ta : ta - tb;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return json({ ready: true, surveys });
}

/** { project_id, type } → the job's open survey of that type, made if there isn't one. { id } */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await surveysReady())) return json({ error: 'Surveys aren’t set up yet: run surveys.sql in Supabase.' }, 503);
  const b = (await req.json().catch(() => ({}))) as { project_id?: unknown; type?: unknown };
  const projectId = String(b.project_id || '');
  const type = b.type ?? 'solar';
  if (!isUuid(projectId)) return json({ error: 'Not found' }, 404);
  if (!isSurveyKind(type)) return json({ error: 'Pick solar or heat pump.' }, 400);
  const db = createAdminClient();
  const project = await getProject(db, projectId);
  if (!project) return json({ error: 'Not found' }, 404);
  const r = await ensureOpenSurvey(db, project, type, { byId: s.user.id });
  if (!r) return json({ error: 'Couldn’t start the survey. Try again.' }, 500);
  if (r.status === 'draft') await markCustomerSeen(db, projectId);
  if (r.created && r.status === 'draft') {
    await logActivity({ enquiryId: project.enquiry_id, projectId, kind: 'visit', body: `${kindLabel(type)} started`, byId: s.user.id }).catch(() => null);
  }
  return json({ id: r.id, status: r.status, created: r.created });
}
