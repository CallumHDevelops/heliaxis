import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOC_MIME, DOCS_BUCKET, ensureDocsBucket, json, MAX_DOC_BYTES, safeName } from '@/lib/crm/server';
import { compactLibraryFile, libraryFields } from '@/lib/handover/library';
import { handoverReady } from '@/lib/handover/server';

export const dynamic = 'force-dynamic';

/**
 * Company documents you send to many customers (EV access guide, intro pack…), and, once handover.sql
 * has run, the product library for handover packs: kind, models, handover item, technologies, "add to
 * every pack" and per-model details, saved with the file (a big PDF gets a compacted copy too).
 */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { data, error } = await createAdminClient().from('crm_library').select('*').order('name');
  if (error) return json({ error: error.message, items: [] }, 500);
  return json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  if (b.action === 'prepare') {
    const mime = String(b.mime || '');
    if (!DOC_MIME.includes(mime)) return json({ error: 'Upload a PDF, photo, Word or Excel file.' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_DOC_BYTES) return json({ error: 'Files must be under 25 MB.' }, 400);
    await ensureDocsBucket();
    const path = `library/${Date.now()}-${safeName(String(b.name || 'document'))}`;
    const { data, error } = await db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
    return json({ bucket: DOCS_BUCKET, path, token: data.token });
  }
  if (b.action === 'save') {
    const path = String(b.path || '');
    if (!path.startsWith('library/') || path.includes('..')) return json({ error: 'Bad file' }, 400);
    // "In every pack" and a model's details are admin-only, as on CRM settings → Product library; anyone
    // can still add a manual for a model from a job's Handover tab, which sends neither.
    if (s.profile.role !== 'admin' && (b.every_pack === true || 'details' in b)) return json({ error: 'Only admins can change the product library.' }, 403);
    const product = (await handoverReady()) ? libraryFields(b) : {};
    const { data, error } = await db
      .from('crm_library')
      .insert({
        name: String(b.name || '').trim().slice(0, 140) || 'Document',
        description: String(b.description || '').trim().slice(0, 300) || null,
        storage_path: path,
        mime: String(b.mime || '') || null,
        size: Number(b.size) || null,
        created_by: s.user.id,
        ...product,
      })
      .select('*')
      .single();
    if (!error && data && Object.keys(product).length) after(() => compactLibraryFile(db, String(data.id), path, (data.mime as string | null) ?? null));
    return error ? json({ error: error.message }, 500) : json({ item: data });
  }
  return json({ error: 'Unknown action' }, 400);
}
