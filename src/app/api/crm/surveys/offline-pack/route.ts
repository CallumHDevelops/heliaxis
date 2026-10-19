import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import {
  addDaysYmd,
  buildPayload,
  ensureOpenSurvey,
  kindsFor,
  OPEN_STATUSES,
  surveysReady,
  ukInstant,
  ukToday,
  type ProjectRow,
  type SurveyRow,
} from '@/lib/surveys/server';
import { SOLAR_SCHEMA_VERSION, type SurveyPayload } from '@/lib/surveys/solar-schema';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

/**
 * The "offline pack" (?days=2: today and tomorrow, UK): every job with a survey date in that time
 * gets its survey record made (booked, not started) and the whole survey is sent, so the phone has
 * it before it loses signal. The app fetches this when it opens with signal (src/lib/surveys/offline.ts).
 *
 * Today from midnight, not from now: a survey that started ten minutes ago still belongs on the phone.
 * A job surveyed for this visit already (or whose survey was cancelled for it) doesn't get a new one.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await surveysReady())) return json({ ready: false, schemaVersion: SOLAR_SCHEMA_VERSION, surveys: [] });
  const days = Math.min(7, Math.max(1, Math.trunc(Number(new URL(req.url).searchParams.get('days')) || 2)));
  const today = ukToday();
  const from = ukInstant(today).toISOString();
  const to = ukInstant(addDaysYmd(today, days)).toISOString();
  const db = createAdminClient();

  const { data: jobs } = await db
    .from('crm_projects')
    .select('*')
    .gte('survey_at', from)
    .lt('survey_at', to)
    .order('survey_at', { ascending: true })
    .limit(40);
  const projects = ((jobs ?? []) as ProjectRow[]).filter((p) => p.stage !== 'lost');
  if (!projects.length) return json({ ready: true, schemaVersion: SOLAR_SCHEMA_VERSION, from, to, surveys: [] });

  const { data: existing } = await db
    .from('crm_surveys')
    .select('*')
    .in(
      'project_id',
      projects.map((p) => p.id)
    );
  const all = (existing ?? []) as SurveyRow[];

  for (const p of projects) {
    const visit = Date.parse(p.survey_at as string);
    for (const kind of kindsFor(p)) {
      const mine = all.filter((x) => x.project_id === p.id && x.type === kind);
      if (mine.some((x) => OPEN_STATUSES.includes(x.status))) continue;
      const doneForVisit = mine.some((x) => x.status === 'complete' && x.completed_at && Date.parse(x.completed_at) >= visit - DAY);
      const cancelledForVisit = mine.some((x) => x.status === 'cancelled' && Date.parse(x.updated_at) >= visit - 14 * DAY);
      if (doneForVisit || cancelledForVisit) continue;
      await ensureOpenSurvey(db, p, kind, { byId: s.user.id, status: 'booked' });
    }
  }

  const { data: open } = await db
    .from('crm_surveys')
    .select('*')
    .in(
      'project_id',
      projects.map((p) => p.id)
    )
    .in('status', OPEN_STATUSES);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const payloads = await Promise.all(((open ?? []) as SurveyRow[]).map((row) => buildPayload(db, row, { project: byId.get(row.project_id) })));
  const surveys = payloads.filter((x): x is SurveyPayload => !!x);
  surveys.sort((a, b) => (a.project.survey_at || '').localeCompare(b.project.survey_at || ''));
  return json({ ready: true, schemaVersion: SOLAR_SCHEMA_VERSION, from, to, surveys });
}
