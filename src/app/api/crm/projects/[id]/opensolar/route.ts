import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, ensureDocsBucket, isUuid, json } from '@/lib/crm/server';
import { patchSlotData, refreshHandover } from '@/lib/handover/server';
import { readProposal } from '@/lib/quotes/proposal';
import { cleanOption } from '@/lib/quotes/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * The OpenSolar proposal for a job's handover pack: { action: 'prepare' } → a signed upload (big PDFs go
 * straight to storage); { action: 'read', path, name } → the options it holds (the PDF is kept on the job
 * as a design document); { action: 'use', option } → its figures make the system design calculations
 * (HX-HO-14) and the solar estimate page (HX-HO-10).
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const b = (await req.json().catch(() => ({}))) as { action?: string; path?: string; name?: string; option?: unknown };
  const prefix = `projects/${id}/opensolar/`;

  if (b.action === 'prepare') {
    await ensureDocsBucket().catch(() => null);
    const path = `${prefix}${Date.now()}.pdf`;
    const { data, error } = await db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Couldn’t start the upload. Try again.' }, 500);
    return json({ bucket: DOCS_BUCKET, path, token: data.token });
  }

  if (b.action === 'read') {
    if (!b.path?.startsWith(prefix) || b.path.includes('..')) return json({ error: 'Choose the OpenSolar proposal PDF.' }, 400);
    const { data: blob, error } = await db.storage.from(DOCS_BUCKET).download(b.path);
    if (error || !blob) return json({ error: 'Couldn’t fetch the uploaded file. Try again.' }, 422);
    if (blob.size > 20 * 1024 * 1024) return json({ error: 'That file is over 20 MB.' }, 400);
    const out = await readProposal(new Uint8Array(await blob.arrayBuffer()), id);
    if (!out.ok) return json({ error: out.error }, 422);
    // Kept on the job as a design document (not in the pack itself).
    await db.from('crm_documents').insert({
      project_id: id,
      category: 'design',
      name: (b.name || 'OpenSolar proposal').replace(/\.pdf$/i, '').slice(0, 160),
      storage_path: b.path,
      mime: 'application/pdf',
      size: blob.size,
      visible: false,
      uploaded_by: s.user.id,
      source: 'upload',
    });
    return json({ options: out.options });
  }

  if (b.action === 'use') {
    const option = cleanOption(b.option);
    if (!Object.keys(option).length) return json({ error: 'Choose an option.' }, 400);
    await patchSlotData(db, id, 'HX-HO-14', { opensolar: option as Record<string, unknown> }, s.user.id);
    await refreshHandover(db, id, { by: s.user.id, force: ['HX-HO-14', 'HX-HO-10'] }).catch((e) => console.error('[opensolar] refresh', e));
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
}
