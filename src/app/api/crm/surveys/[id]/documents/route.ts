import { createAdminClient } from '@/lib/supabase/admin';
import {
  crmSession,
  docCategoryOf,
  DOC_MIME,
  DOCS_BUCKET,
  ensureDocsBucket,
  isUuid,
  json,
  logActivity,
  MAX_DOC_BYTES,
  safeName,
  signedDoc,
} from '@/lib/crm/server';
import { getSurvey, SIGNED_SECONDS } from '@/lib/surveys/server';

export const dynamic = 'force-dynamic';

/**
 * A survey's paperwork (the SimpliHeat report PDF, a sketch…), kept with the job's documents and
 * linked to the survey. { action: 'prepare', name, mime, size } → a one-time upload URL;
 * { action: 'save', path, name, mime, size, category?, visible? } → record it (category defaults to
 * design; not shown in the customer's portal unless visible is true).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) return json({ error: 'survey_not_found' }, 404);
  const projectId = survey.project_id;

  if (b.action === 'prepare') {
    const mime = String(b.mime || '');
    if (!DOC_MIME.includes(mime)) return json({ error: 'Upload a PDF, photo, Word or Excel file.' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_DOC_BYTES) return json({ error: 'Files must be under 25 MB.' }, 400);
    await ensureDocsBucket();
    const path = `projects/${projectId}/${Date.now()}-${safeName(String(b.name || 'document'))}`;
    const { data, error } = await db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
    return json({ bucket: DOCS_BUCKET, path, token: data.token });
  }

  if (b.action === 'save') {
    const path = String(b.path || '');
    if (!path.startsWith(`projects/${projectId}/`) || path.includes('..')) return json({ error: 'Bad file' }, 400);
    const category = await docCategoryOf(b.category, 'design');
    const name = String(b.name || '').trim().slice(0, 140) || (survey.type === 'ashp' ? 'SimpliHeat report' : 'Survey document');
    const { data: doc, error } = await db
      .from('crm_documents')
      .insert({
        project_id: projectId,
        survey_id: id,
        category,
        name,
        storage_path: path,
        mime: String(b.mime || '') || null,
        size: Number(b.size) || null,
        visible: b.visible === true,
        needs_signature: false,
        uploaded_by: s.user.id,
      })
      .select('*')
      .single();
    if (error) return json({ error: error.message }, 500);
    await logActivity({
      enquiryId: survey.enquiry_id,
      projectId,
      kind: 'system',
      body: `Survey document added: ${name}`,
      byId: s.user.id,
    }).catch(() => null);
    const url = await signedDoc(path, SIGNED_SECONDS);
    return json({
      document: { id: doc.id, name: doc.name, category: doc.category, mime: doc.mime, size: doc.size, url, created_at: doc.created_at },
    });
  }

  return json({ error: 'Unknown action' }, 400);
}
