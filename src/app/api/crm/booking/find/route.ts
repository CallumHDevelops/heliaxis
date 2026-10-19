import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { isSurveyType, surveyTypeFor, type SurveyTypeKey } from '@/lib/crm/stages';
import { schemaReady } from '@/lib/schema-ready';
import { findSlots, liveBookingFor } from '@/lib/booking/book';
import type { ProjectRow } from '@/lib/booking/diary';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Find a time (staff): { project_id?, postcode?, type?, override? }. The customer's times from now,
 * with the surveyor and the extra driving for each, and why other days have none.
 */
export async function POST(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ error: 'Run survey-booking.sql in Supabase first.' }, 409);
  const b = await readBody(req);
  let postcode = typeof b.postcode === 'string' ? b.postcode : '';
  let type: SurveyTypeKey | null = isSurveyType(b.type) ? b.type : null;
  let ignore: string | null = null;
  let project: { id: string; title: string; postcode: string | null; surveyAt: string | null } | null = null;
  if (typeof b.project_id === 'string' && isUuid(b.project_id)) {
    const { data } = await createAdminClient().from('crm_projects').select('*').eq('id', b.project_id).maybeSingle();
    const p = data as ProjectRow | null;
    if (!p) return json({ error: 'Not found' }, 404);
    postcode ||= p.postcode || '';
    type ??= isSurveyType(p.survey_type) ? p.survey_type : (surveyTypeFor(p.products ?? []) ?? 'solar');
    // Moving their booking: their own time doesn't count as busy.
    ignore = (await liveBookingFor(p.id))?.id ?? null;
    project = { id: p.id, title: p.title, postcode: p.postcode, surveyAt: p.survey_at };
  }
  if (!postcode) return json({ error: 'Enter the customer’s postcode.' }, 400);
  const r = await findSlots({ postcode, type: type ?? 'solar', staff: true, override: b.override === true, ignoreBookingId: ignore, fresh: b.fresh === true });
  if (!r.ok) return json({ error: r.error || 'Please try again.', code: r.code }, r.code === 'unavailable' ? 503 : 400);
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
