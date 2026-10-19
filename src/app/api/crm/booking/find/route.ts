import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { isSurveyType, stageLabel, surveyTypeFor, type SurveyTypeKey } from '@/lib/crm/stages';
import { schemaReady } from '@/lib/schema-ready';
import { findSlots, liveBookingFor, publicDays } from '@/lib/booking/book';
import type { ProjectRow } from '@/lib/booking/diary';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** Text for a PostgREST .or() filter: no commas, brackets, wildcards, backslashes or quotes. */
const clean = (q: string) =>
  q
    .replace(/[,()%*\\'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

/**
 * Pick a job (Find a time, diary entries): ?q= matches the customer's name, email, mobile or
 * postcode, or the job's title or postcode. Open jobs only (not Lost or Complete), newest first.
 */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const q = clean(new URL(req.url).searchParams.get('q') || '');
  if (q.length < 2) return json({ jobs: [] });
  const db = createAdminClient();
  const digits = q.replace(/\D/g, '');
  const people = await db
    .from('enquiries')
    .select('id, name')
    .or(
      [
        `name.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `postcode.ilike.%${q}%`,
        ...(digits.length >= 6 ? [`wa_id.ilike.%${digits.slice(-9)}%`, `phone.ilike.%${digits.slice(-6)}%`] : []),
      ].join(',')
    )
    .order('created_at', { ascending: false })
    .limit(40);
  const names = new Map((people.data ?? []).map((e) => [e.id as string, (e.name as string) || '']));
  const ids = [...names.keys()];
  const [byCustomer, byJob] = await Promise.all([
    ids.length
      ? db
          .from('crm_projects')
          .select('id, enquiry_id, title, stage, postcode, products, survey_at')
          .in('enquiry_id', ids)
          .order('updated_at', { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [] as ProjectLite[] }),
    db
      .from('crm_projects')
      .select('id, enquiry_id, title, stage, postcode, products, survey_at')
      .or(`title.ilike.%${q}%,postcode.ilike.%${q}%`)
      .order('updated_at', { ascending: false })
      .limit(30),
  ]);
  const seen = new Set<string>();
  const rows = [...((byCustomer.data ?? []) as ProjectLite[]), ...((byJob.data ?? []) as ProjectLite[])].filter((p) => {
    if (seen.has(p.id) || p.stage === 'lost' || p.stage === 'complete') return false;
    seen.add(p.id);
    return true;
  });
  // Customers found through their job's title still need a name.
  const missing = [...new Set(rows.map((p) => p.enquiry_id).filter((id) => !names.has(id)))];
  if (missing.length) {
    const { data } = await db.from('enquiries').select('id, name').in('id', missing.slice(0, 100));
    for (const e of data ?? []) names.set(e.id as string, (e.name as string) || '');
  }
  return json({
    jobs: rows.slice(0, 25).map((p) => ({
      id: p.id,
      customer: names.get(p.enquiry_id) || p.title,
      title: p.title,
      stage: p.stage,
      stageLabel: stageLabel(p.stage),
      postcode: p.postcode,
      surveyAt: p.survey_at,
      type: surveyTypeFor(p.products ?? []),
    })),
  });
}

type ProjectLite = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  postcode: string | null;
  products: string[] | null;
  survey_at: string | null;
};

/**
 * Find a time (staff): { project_id?, postcode?, type?, override? }. The customer's times from now,
 * with the surveyor and the extra driving for each, and why other days have none.
 * { postcode, type, preview: true } instead shows what a customer would see on the website (even
 * while online booking is switched off), with the reasons for days without times.
 */
export async function POST(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ error: 'Run survey-booking.sql in Supabase first.' }, 409);
  const b = await readBody(req);
  let postcode = typeof b.postcode === 'string' ? b.postcode : '';
  let type: SurveyTypeKey | null = isSurveyType(b.type) ? b.type : null;

  if (b.preview === true) {
    if (!postcode) return json({ error: 'Enter a postcode.' }, 400);
    const r = await findSlots({ postcode, type: type ?? 'solar', preview: true, fresh: true });
    if (!r.ok) return json({ error: r.error || 'Please try again.', code: r.code }, r.code === 'unavailable' ? 503 : 400);
    return json({
      mode: r.mode,
      minutesText: r.minutesText,
      days: publicDays(r.days),
      reasons: r.reasons,
      tooFar: r.tooFar,
      outlookOk: r.outlookOk,
      provider: r.provider,
    });
  }

  let ignore: string | null = null;
  let project: { id: string; title: string; customer: string; postcode: string | null; surveyAt: string | null; stage: string } | null = null;
  if (typeof b.project_id === 'string' && isUuid(b.project_id)) {
    const db = createAdminClient();
    const { data } = await db.from('crm_projects').select('*').eq('id', b.project_id).maybeSingle();
    const p = data as ProjectRow | null;
    if (!p) return json({ error: 'Not found' }, 404);
    postcode ||= p.postcode || '';
    type ??= isSurveyType(p.survey_type) ? p.survey_type : (surveyTypeFor(p.products ?? []) ?? 'solar');
    // Moving their booking (or the date on the job): their own time doesn't count as busy.
    ignore = (await liveBookingFor(p.id))?.id ?? null;
    const { data: e } = await db.from('enquiries').select('name').eq('id', p.enquiry_id).maybeSingle();
    project = { id: p.id, title: p.title, customer: (e?.name as string) || p.title, postcode: p.postcode, surveyAt: p.survey_at, stage: p.stage };
  }
  if (!postcode)
    return json({ project, type: type ?? 'solar', error: project ? 'This job has no postcode yet. Enter it below.' : 'Enter the customer’s postcode.' }, 400);
  const r = await findSlots({
    postcode,
    type: type ?? 'solar',
    staff: true,
    override: b.override === true,
    ignoreBookingId: ignore,
    ignoreProjectId: project?.id ?? null,
    fresh: b.fresh === true,
  });
  if (!r.ok) return json({ project, type: type ?? 'solar', error: r.error || 'Please try again.', code: r.code }, r.code === 'unavailable' ? 503 : 400);
  return json({
    project,
    type: type ?? 'solar',
    postcode: r.geo.postcode,
    approx: !!r.geo.approx,
    mode: r.mode,
    wouldConfirm: r.wouldConfirm,
    minutes: r.minutes,
    minutesText: r.minutesText,
    days: r.days,
    reasons: r.reasons,
    tooFar: r.tooFar,
    soonest: r.soonest,
    provider: r.provider,
    outlookOk: r.outlookOk,
    outlookError: r.outlookError ?? null,
    override: b.override === true,
  });
}
