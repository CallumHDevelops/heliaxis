import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  crmSession,
  docCategoryOf,
  DOC_MIME,
  DOCS_BUCKET,
  ensureDocsBucket,
  fingerprintDocument,
  isUuid,
  json,
  logActivity,
  MAX_DOC_BYTES,
  safeName,
} from '@/lib/crm/server';
import { SIGNABLE_CATEGORIES } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

/**
 * Opportunity paperwork. { action: 'prepare', name, mime, size } → a one-time upload URL (files go
 * straight to storage); { action: 'save', path, name, category, visible, needs_signature } → record it
 * (needs_signature only on quotes and contracts).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);

  if (b.action === 'prepare') {
    const mime = String(b.mime || '');
    if (!DOC_MIME.includes(mime)) return json({ error: 'Upload a PDF, photo, Word or Excel file.' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_DOC_BYTES) return json({ error: 'Files must be under 25 MB.' }, 400);
    await ensureDocsBucket();
    const path = `projects/${id}/${Date.now()}-${safeName(String(b.name || 'document'))}`;
    const { data, error } = await db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
    return json({ bucket: DOCS_BUCKET, path, token: data.token });
  }

  if (b.action === 'save') {
    const path = String(b.path || '');
    if (!path.startsWith(`projects/${id}/`) || path.includes('..')) return json({ error: 'Bad file' }, 400);
    const category = await docCategoryOf(b.category);
    const name = String(b.name || '').trim().slice(0, 140) || 'Document';
    const { data: doc, error } = await db
      .from('crm_documents')
      .insert({
        project_id: id,
        category,
        name,
        storage_path: path,
        mime: String(b.mime || '') || null,
        size: Number(b.size) || null,
        visible: b.visible !== false,
        needs_signature: !!b.needs_signature && SIGNABLE_CATEGORIES.includes(category),
        uploaded_by: s.user.id,
      })
      .select('*')
      .single();
    if (error) return json({ error: error.message }, 500);
    // A fingerprint of the file, so a signed quote can be matched to exactly what they signed.
    after(() => fingerprintDocument(doc.id as string));
    await logActivity({
      enquiryId: p.enquiry_id,
      projectId: id,
      kind: 'system',
      body: `Document added: ${name}${doc.visible ? ' (in their portal)' : ''}`,
      byId: s.user.id,
    });
    return json({ document: doc });
  }
  return json({ error: 'Unknown action' }, 400);
}
