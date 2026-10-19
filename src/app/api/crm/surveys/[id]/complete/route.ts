import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, ensureDocsBucket, isUuid, json, logActivity } from '@/lib/crm/server';
import { applyStageEvent } from '@/lib/crm/move-stage';
import { notify } from '@/lib/notify';
import { DRAWINGS_FLAG, missingWords, toSend, type Miss } from '@/lib/surveys/rules';
import {
  addSourceTask,
  evaluateSurvey,
  firstName,
  getProject,
  getSurvey,
  isOpen,
  kindLabel,
  OPEN_STATUSES,
  personName,
  productsOf,
  surveyPhotos,
  type PhotoRow,
  type SurveyRow,
} from '@/lib/surveys/server';
import { fieldIndex } from '@/lib/surveys/solar-schema';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const MAX_SIGNATURE_BYTES = 600 * 1024;
const FIELDS = fieldIndex();
const isPhotoMiss = (m: Miss) => ['photo', 'photos'].includes(FIELDS.get(m.field)?.field.type ?? '');

const done = (s: SurveyRow) => json({ ok: true, status: 'complete', flags: s.flags ?? [], summary: s.summary, completed_at: s.completed_at });

/**
 * Finish a survey: { signature?, signed_name?, finished_at? }. Sent by the phone's outbox once its
 * answers and photos are all up (it may have been finished on site hours before, without signal).
 *
 * Solar: the rules run again here; anything Needed or a block → 400 { message, missing, blocks }
 * (and a push to the surveyor, who may not be looking). Heat pump: needs the SimpliHeat link or report.
 * Then: summary and red flags saved, the signature stored, the site address updated if it changed,
 * the job moved to Surveyed, follow-up tasks made, the timeline and pushes. Answers saved by someone
 * else while it's finishing are checked again (503 after three goes: the outbox tries again).
 * Calling it again on a finished survey returns the same result.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { signature?: unknown; signed_name?: unknown; finished_at?: unknown };
  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) return json({ error: 'Not found' }, 404);
  if (survey.status === 'complete') return done(survey);
  if (!isOpen(survey.status)) return json({ error: 'This survey was cancelled.', status: survey.status }, 409);

  const [project, { data: customer }] = await Promise.all([
    getProject(db, survey.project_id),
    db.from('enquiries').select('id, name').eq('id', survey.enquiry_id).maybeSingle(),
  ]);
  if (!project) return json({ error: 'Not found' }, 404);
  const customerName = customer?.name || project.title || 'The customer';
  const first = firstName(customer?.name);

  // The customer's signature (a PNG from the signature pad).
  const nowMs = Date.now();
  const sent = typeof b.finished_at === 'string' ? Date.parse(b.finished_at) : NaN;
  const finishedAt = new Date(Number.isNaN(sent) || sent > nowMs + 10 * 60_000 || sent < nowMs - 60 * 86_400_000 ? nowMs : sent).toISOString();
  const signedName = typeof b.signed_name === 'string' ? b.signed_name.trim().slice(0, 120) : '';
  const sig = typeof b.signature === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(b.signature) : null;
  const sigBytes = sig ? Buffer.from(sig[1], 'base64') : null;
  if (sigBytes && sigBytes.length > MAX_SIGNATURE_BYTES) return json({ error: 'The signature is too big. Clear it and sign again.' }, 400);
  let signaturePath: string | null = null;
  // This attempt's signature file, when it doesn't end up on the survey.
  const dropSignature = async () => {
    if (signaturePath) await db.storage.from(DOCS_BUCKET).remove([signaturePath]).then(() => null, () => null);
  };

  // Check the answers as saved, and finish only if they're still the ones checked: if another phone
  // or the office saves meanwhile, check again with theirs.
  const now = new Date().toISOString();
  let current = survey;
  let answers = current.answers ?? {};
  let photos: PhotoRow[] = [];
  let flags: string[] = [];
  let summary: Record<string, unknown> | null = null;
  let drawings: Miss[] = [];
  let row: SurveyRow | null = null;
  for (let tries = 0; !row; tries++) {
    answers = current.answers ?? {};
    photos = await surveyPhotos(db, id);

    // Does it have everything it needs?
    if (current.type === 'solar') {
      const ev = evaluateSurvey(current, productsOf(project), photos);
      if (ev.missing.length || ev.blocks.length) {
        await dropSignature();
        const photosMissing = ev.missing.filter(isPhotoMiss).length;
        const message = ev.blocks.length
          ? `Survey not finished: ${ev.blocks[0].message}`
          : photosMissing === ev.missing.length
            ? `Survey not finished: ${photosMissing} photo${photosMissing === 1 ? '' : 's'} didn’t upload. Retake ${photosMissing === 1 ? 'it' : 'them'}.`
            : `Survey not finished: still needed ${missingWords(ev.missing)}.`;
        after(() =>
          notify({
            userId: s.user.id,
            kind: 'crm_survey_not_finished',
            title: `${customerName}: survey not finished`,
            body: message.replace(/^Survey not finished: /, ''),
            href: `/admin/surveys/${id}`,
            tag: `survey-${id}`,
          })
        );
        return json({ error: 'not_finished', message, missing: ev.missing, blocks: ev.blocks }, 400);
      }
      flags = ev.flags;
      drawings = ev.drawingsToDo;
      summary = { ...ev.summary, percent: ev.percent, photos: photos.length, system: answers.Z1 ?? null };
    } else {
      const { data: docs } = await db.from('crm_documents').select('id').eq('survey_id', id).limit(1);
      if (!current.simpliheat_url && !docs?.length) {
        await dropSignature();
        return json({ error: 'not_finished', message: 'Add the SimpliHeat link or upload the SimpliHeat report first.', missing: [], blocks: [] }, 400);
      }
    }

    // A file of its own for each attempt, so two phones finishing at once can't swap signatures.
    if (sigBytes && !signaturePath) {
      await ensureDocsBucket();
      const path = `signatures/${survey.project_id}/survey-${id}-${Date.now()}.png`;
      const up = await db.storage.from(DOCS_BUCKET).upload(path, sigBytes, { contentType: 'image/png', upsert: false });
      if (up.error) return json({ error: 'Couldn’t save the signature. Try again.' }, 500);
      signaturePath = path;
    }

    const { data: updated } = await db
      .from('crm_surveys')
      .update({
        status: 'complete',
        completed_at: now,
        completed_by: s.user.id,
        finished_on_site_at: finishedAt,
        flags,
        summary,
        updated_at: now,
        ...(current.surveyor_id ? {} : { surveyor_id: s.user.id }),
        // Always written, so a survey reopened and finished again never keeps an earlier sign-off.
        customer_signature: signaturePath,
        customer_signed_at: signaturePath ? finishedAt : null,
        customer_signed_name: signedName || null,
      })
      .eq('id', id)
      .eq('rev', current.rev)
      .in('status', OPEN_STATUSES)
      .select('*');
    if (updated?.length) {
      row = updated[0] as SurveyRow;
      break;
    }
    const again = await getSurvey(db, id);
    if (again?.status === 'complete') {
      // Finished by another request a moment ago (a retry): same answer.
      await dropSignature();
      return done(again);
    }
    if (!again || !isOpen(again.status)) {
      await dropSignature();
      return json({ error: 'This survey was cancelled.' }, 409);
    }
    if (tries >= 2) {
      // Still changing: the phone tries again shortly.
      await dropSignature();
      return json({ error: 'The survey changed while it was finishing. Trying again.' }, 503);
    }
    current = again;
  }
  const who = personName(s.profile);
  const label = kindLabel(survey.type);

  // The site address, if the surveyor changed it on site. A3.was is what the form started with (the
  // job's address then); surveys started before it was kept compare with the job's address now.
  type Addr = { address?: unknown; postcode?: unknown };
  const norm = (x: Addr) => [String(x.address ?? '').trim(), String(x.postcode ?? '').trim().toUpperCase()] as const;
  const a3 = (answers.A3 && typeof answers.A3 === 'object' ? answers.A3 : {}) as Addr & { was?: unknown };
  const [address, postcode] = norm(a3);
  const job = norm(project);
  const start = a3.was && typeof a3.was === 'object' ? norm(a3.was as Addr) : job;
  const edited = address !== start[0] || postcode !== start[1];
  if (survey.type === 'solar' && address && postcode && edited && (address !== job[0] || postcode !== job[1])) {
    const jobWords = job.filter(Boolean).join(', ') || 'none';
    if (start[0] !== job[0] || start[1] !== job[1]) {
      // The office changed the job's address too while the survey was open: keep theirs and say so.
      await logActivity({
        enquiryId: survey.enquiry_id,
        projectId: project.id,
        kind: 'system',
        body: `Site address at the survey: ${address}, ${postcode}. The job’s address was changed while the survey was open, so it was kept (${jobWords}). Check which is right.`,
        byId: s.user.id,
      }).catch(() => null);
    } else {
      await db.from('crm_projects').update({ address, postcode, updated_at: now }).eq('id', project.id);
      await logActivity({
        enquiryId: survey.enquiry_id,
        projectId: project.id,
        kind: 'system',
        body: `Site address changed at the survey: ${jobWords} → ${address}, ${postcode}`,
        byId: s.user.id,
      }).catch(() => null);
    }
  }

  await applyStageEvent(project.id, 'surveyed', { byId: s.user.id, note: `${label.toLowerCase()} done` });

  // Follow-up tasks (one of each per survey).
  const owner = project.owner_id || s.user.id;
  if (survey.type === 'solar') {
    if (answers.X5 === true) {
      const { data: ashp } = await db.from('crm_surveys').select('id').eq('project_id', project.id).eq('type', 'ashp').neq('status', 'cancelled').limit(1);
      if (!ashp?.length)
        await addSourceTask(db, {
          projectId: project.id,
          key: `survey-ashp:${id}`,
          title: `Book a SimpliHeat heat pump survey for ${first}`,
          notes: 'They said at the solar survey that they’re interested in a heat pump.',
          assigneeId: owner,
          createdBy: s.user.id,
        });
    }
    if (drawings.length) {
      const what = [...new Set(drawings.map((d) => (d.field === 'R13' ? 'cut-out' : 'cable routes')))].join(', ');
      await addSourceTask(db, {
        projectId: project.id,
        key: `survey-drawings:${id}`,
        title: `Finish the drawings for ${first}’s survey (${what})`,
        notes: `Open the survey and draw on the photos: /admin/surveys/${id}`,
        assigneeId: s.user.id,
        createdBy: s.user.id,
      });
    }
    for (const key of toSend(answers)) {
      const title = key === 'E14' ? `Get ${first}’s electricity bill (yearly use in kWh)` : key === 'E16' ? `Get ${first}’s supplier and tariff` : `Get ${first}’s ${FIELDS.get(key)?.field.label.toLowerCase() ?? key}`;
      await addSourceTask(db, { projectId: project.id, key: `survey-send:${id}:${key}`, title, notes: 'They said at the survey they’d send it.', assigneeId: owner, createdBy: s.user.id });
    }
  }

  // Timeline and pushes.
  const red = flags.filter((f) => f !== DRAWINGS_FLAG);
  const bits = survey.type === 'solar' ? [`${photos.length} photo${photos.length === 1 ? '' : 's'}`] : [];
  if (red.length) bits.push(`${red.length} red flag${red.length === 1 ? '' : 's'} (${red.slice(0, 3).join(', ')}${red.length > 3 ? ', …' : ''})`);
  if (drawings.length) bits.push('drawings to do');
  await logActivity({
    enquiryId: survey.enquiry_id,
    projectId: project.id,
    kind: 'visit',
    body: `${label} completed by ${who}${bits.length ? `: ${bits.join(', ')}` : ''}`,
    meta: { survey_id: id, flags: red.length, photos: photos.length },
    byId: s.user.id,
  }).catch(() => null);
  await db.from('crm_projects').update({ updated_at: now }).eq('id', project.id);

  const href = survey.type === 'solar' ? `/admin/surveys/${id}/report` : `/admin/surveys/${id}`;
  after(async () => {
    await notify({
      userId: s.user.id,
      kind: 'crm_survey_uploaded',
      title: `${customerName}’s survey uploaded ✓`,
      body: drawings.length ? 'Everything is in. The drawings are still to do.' : 'Everything is in.',
      href,
      tag: `survey-${id}`,
    });
    if (project.owner_id && project.owner_id !== s.user.id) {
      await notify({
        userId: project.owner_id,
        kind: 'crm_survey_done',
        title: `Survey done: ${customerName}`,
        body: `${label} by ${who}${red.length ? ` · ${red.length} red flag${red.length === 1 ? '' : 's'}` : ''}`,
        href,
        tag: `survey-done-${id}`,
      });
    }
  });

  return done(row);
}
