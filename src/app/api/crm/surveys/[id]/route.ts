import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, isUuid, json, logActivity } from '@/lib/crm/server';
import { canAccess } from '@/lib/portals';
import {
  buildPayload,
  cleanAnswers,
  evaluateSurvey,
  getProject,
  getSurvey,
  isOpen,
  kindLabel,
  OPEN_STATUSES,
  personName,
  productsOf,
  surveyPhotos,
} from '@/lib/surveys/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The whole survey for the phone: answers and rev, the job, the customer, photos (signed 12 h) and documents. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) return json({ error: 'Not found' }, 404);
  const payload = await buildPayload(db, survey);
  return payload ? json(payload) : json({ error: 'Not found' }, 404);
}

/**
 * Save the answers: { answers, base_rev, saved_at }. Only saves if nobody else has saved since
 * base_rev; otherwise 409 with the server's answers and rev so the phone can merge and try again.
 * A finished or cancelled survey answers 409 { error: 'locked' }. The first save starts the survey.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => null)) as { answers?: unknown; base_rev?: unknown; saved_at?: unknown } | null;
  const answers = cleanAnswers(b?.answers);
  if (!answers) return json({ error: 'Those answers couldn’t be read.' }, 400);
  const baseRev = Number(b?.base_rev);
  if (!Number.isInteger(baseRev) || baseRev < 0) return json({ error: 'Missing base_rev' }, 400);
  const nowMs = Date.now();
  const sent = typeof b?.saved_at === 'string' ? Date.parse(b.saved_at) : NaN;
  const savedAt = new Date(Number.isNaN(sent) || sent > nowMs + 5 * 60_000 ? nowMs : sent).toISOString();

  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) return json({ error: 'Not found' }, 404);
  const conflict = (row: { status: string; answers: unknown; rev: number }) =>
    json({ error: isOpen(row.status) ? 'conflict' : 'locked', status: row.status, answers: row.answers ?? {}, rev: row.rev }, 409);
  if (!isOpen(survey.status) || survey.rev !== baseRev) return conflict(survey);

  const [project, photos] = await Promise.all([getProject(db, survey.project_id), surveyPhotos(db, id)]);
  const flags = survey.type === 'solar' ? evaluateSurvey({ answers }, productsOf(project), photos).flags : survey.flags ?? [];
  const now = new Date().toISOString();
  const starting = survey.status === 'booked';
  const { data: saved } = await db
    .from('crm_surveys')
    .update({
      answers,
      answers_saved_at: savedAt,
      rev: baseRev + 1,
      flags,
      updated_at: now,
      ...(starting ? { status: 'draft', started_at: survey.started_at ?? now } : {}),
      ...(survey.surveyor_id ? {} : { surveyor_id: s.user.id }),
    })
    .eq('id', id)
    .eq('rev', baseRev)
    .in('status', OPEN_STATUSES)
    .select('rev, status');
  if (!saved?.length) {
    const again = await getSurvey(db, id);
    return again ? conflict(again) : json({ error: 'Not found' }, 404);
  }
  if (starting && project) {
    after(() =>
      logActivity({ enquiryId: survey.enquiry_id, projectId: survey.project_id, kind: 'visit', body: `${kindLabel(survey.type)} started`, byId: s.user.id }).catch(() => null)
    );
  }
  return json({ rev: saved[0].rev as number, status: saved[0].status as string, flags });
}

/**
 * { status?: 'draft' | 'cancelled', surveyor_id?, simpliheat_url?, notes? }
 * status 'draft' reopens a finished survey (the person who finished it, or an admin) or brings back a
 * cancelled one; 'cancelled' cancels an open one. A SimpliHeat link also goes on the job if it has none.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) return json({ error: 'Not found' }, 404);
  const admin = s.profile.role === 'admin';
  const who = personName(s.profile);
  const u: Record<string, unknown> = {};
  const notes: string[] = [];
  /** Reopening a signed survey: the old signature's file, removed once it's reopened. */
  let oldSignature: string | null = null;

  if ('status' in b) {
    const to = String(b.status);
    if (to === 'draft' && survey.status === 'complete') {
      if (!admin && survey.completed_by !== s.user.id) return json({ error: 'Only the person who finished it, or an admin, can reopen it.' }, 403);
      // The customer signed what was finished, not what it's about to be changed to: they sign again.
      // The rev moves on so a phone still holding the old answers merges the sign-off away too.
      const { Z8, ...answers } = (survey.answers ?? {}) as Record<string, unknown>;
      const wasSigned = !!(survey.customer_signature || survey.customer_signed_name || Z8);
      oldSignature = survey.customer_signature;
      Object.assign(u, {
        status: 'draft',
        completed_at: null,
        finished_on_site_at: null,
        customer_signature: null,
        customer_signed_name: null,
        customer_signed_at: null,
        answers,
        rev: survey.rev + 1,
      });
      notes.push(`${kindLabel(survey.type)} reopened by ${who}${wasSigned ? '. The customer will need to sign again' : ''}`);
    } else if (to === 'draft' && survey.status === 'cancelled') {
      u.status = 'draft';
      notes.push(`${kindLabel(survey.type)} brought back by ${who}`);
    } else if (to === 'cancelled' && isOpen(survey.status)) {
      u.status = 'cancelled';
      notes.push(`${kindLabel(survey.type)} cancelled by ${who}`);
    } else if (to !== survey.status) {
      return json({ error: 'That change isn’t possible.' }, 400);
    }
  }
  if ('surveyor_id' in b) {
    const sid = b.surveyor_id ? String(b.surveyor_id) : null;
    if (sid) {
      if (!isUuid(sid)) return json({ error: 'Unknown surveyor' }, 400);
      const { data: p } = await db.from('profiles').select('*').eq('id', sid).maybeSingle();
      if (!p || p.status !== 'approved' || !canAccess(p, 'crm')) return json({ error: 'Pick someone with the CRM.' }, 400);
    }
    u.surveyor_id = sid;
  }
  let link: string | null | undefined;
  if ('simpliheat_url' in b) {
    link = String(b.simpliheat_url ?? '').trim() || null;
    if (link) {
      let ok = false;
      try {
        ok = new URL(link).protocol === 'https:';
      } catch {
        ok = false;
      }
      if (!ok || link.length > 1000) return json({ error: 'Paste the SimpliHeat link (it starts with https://).' }, 400);
    }
    u.simpliheat_url = link;
  }
  if ('notes' in b) u.notes = String(b.notes ?? '').trim().slice(0, 5000) || null;
  if (!Object.keys(u).length) return json({ ok: true });

  u.updated_at = new Date().toISOString();
  let q = db.from('crm_surveys').update(u).eq('id', id);
  // A status change only lands on the status it was checked against (a phone may have just finished it).
  // Cancelling takes either open status, so a booked survey started at the same moment still cancels.
  if (u.status) q = q.in('status', isOpen(survey.status) ? OPEN_STATUSES : [survey.status]);
  const { data: changed, error } = await q.select('id');
  if (error) {
    if (error.code === '23505') return json({ error: 'This job already has an open survey of this type.' }, 409);
    return json({ error: error.message }, 500);
  }
  if (!changed?.length) {
    return u.status ? json({ error: 'This survey changed a moment ago. Refresh and try again.' }, 409) : json({ error: 'Not found' }, 404);
  }
  if (oldSignature) await db.storage.from(DOCS_BUCKET).remove([oldSignature]).then(() => null, () => null);
  if (link) {
    const project = await getProject(db, survey.project_id);
    if (project && !project.simpliheat_url) {
      await db.from('crm_projects').update({ simpliheat_url: link, updated_at: u.updated_at }).eq('id', project.id);
    }
  }
  for (const body of notes) {
    await logActivity({ enquiryId: survey.enquiry_id, projectId: survey.project_id, kind: 'system', body, byId: s.user.id }).catch(() => null);
  }
  return json({ ok: true });
}

/** Delete a booked or started survey with no photos (an admin can delete any). Its photos stay on the job. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) return json({ ok: true });
  if (s.profile.role !== 'admin') {
    if (!isOpen(survey.status)) return json({ error: 'Only an admin can delete a finished survey.' }, 403);
    const photos = await surveyPhotos(db, id);
    if (photos.length) return json({ error: 'This survey has photos. Ask an admin to delete it, or cancel it instead.' }, 403);
  }
  const { error } = await db.from('crm_surveys').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  await logActivity({
    enquiryId: survey.enquiry_id,
    projectId: survey.project_id,
    kind: 'system',
    body: `${kindLabel(survey.type)} deleted by ${personName(s.profile)}`,
    byId: s.user.id,
  }).catch(() => null);
  return json({ ok: true });
}
