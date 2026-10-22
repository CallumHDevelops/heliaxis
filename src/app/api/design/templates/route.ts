import { createAdminClient } from '@/lib/supabase/admin';
import {
  DESIGN_BUCKET,
  MAX_PDF_BYTES,
  NOT_READY,
  PDF_MIME,
  cleanGeometry,
  cleanName,
  designReady,
  designSession,
  ensureDesignBucket,
  json,
  safeName,
} from '@/lib/design/server';

export const dynamic = 'force-dynamic';

/** The printer-template library. */
export async function GET() {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ ready: false, items: [] });
  const { data, error } = await createAdminClient()
    .from('design_templates')
    .select('id, name, title, storage_path, size, geometry, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return json({ error: error.message, items: [] }, 500);
  return json({ ready: true, items: data ?? [] });
}

/**
 * Upload a template PDF straight to storage (Vercel caps request bodies at ~4.5 MB):
 *  - { action: 'prepare', name, mime, size } → { bucket, path, token } for uploadToSignedUrl
 *  - { action: 'save', path, name, title?, size?, geometry } → adds it to the library
 * 'prepare' works before design-studio.sql is run (the PDF is still usable in the open design).
 */
export async function POST(req: Request) {
  const s = await designSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();

  if (b.action === 'prepare') {
    if (!PDF_MIME.includes(String(b.mime || ''))) return json({ error: 'Templates must be PDF files.' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_PDF_BYTES) return json({ error: 'Template PDFs must be under 40 MB.' }, 400);
    await ensureDesignBucket();
    const path = `templates/${Date.now()}-${safeName(String(b.name || 'template.pdf'))}`;
    const { data, error } = await db.storage.from(DESIGN_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
    return json({ bucket: DESIGN_BUCKET, path, token: data.token });
  }

  if (b.action === 'save') {
    if (!(await designReady())) return json({ error: NOT_READY }, 409);
    const path = String(b.path || '');
    if (!path.startsWith('templates/') || path.includes('..')) return json({ error: 'Bad file' }, 400);
    const geometry = cleanGeometry(b.geometry);
    if (!geometry) return json({ error: 'The template’s page size looks wrong.' }, 400);
    const { data, error } = await db
      .from('design_templates')
      .insert({
        name: cleanName(b.name, 'Printer template'),
        title: String(b.title || '').trim().slice(0, 200) || null,
        storage_path: path,
        size: Number(b.size) || null,
        geometry,
        created_by: s.user.id,
      })
      .select('id, name, title, storage_path, size, geometry, created_at')
      .single();
    if (error) return json({ error: error.code === '23505' ? 'That template is already in the library.' : error.message }, error.code === '23505' ? 409 : 500);
    return json({ item: data });
  }

  return json({ error: 'Unknown action' }, 400);
}
