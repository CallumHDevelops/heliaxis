import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY } from '@/lib/subcontractors/documents';
import { clientIp, DOCS_BUCKET, logEvent } from '@/lib/subcontractors/server';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';

type Body = {
  token: string;
  path: string;
  fileName: string;
  mime: string;
  size: number;
  category: string;
  label?: string;
  operative?: string;
  reference?: string;
  cover?: string;
  expiresOn?: string;
};

/** Record a file the browser has just uploaded to this subcontractor's storage folder. */
export async function POST(req: Request) {
  const r = await portalRequest<Body>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;

  const cat = CATEGORY_BY_KEY[body.category];
  if (!cat) return jsonError('Unknown document type.');
  const path = String(body.path || '');
  if (!path.startsWith(`${sub.id}/${cat.key}/`) || path.includes('..')) return jsonError('Invalid upload.', 403);

  const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(body.expiresOn || '') ? body.expiresOn! : null;
  if (cat.expiry === 'required' && !expiresOn) return jsonError(`Please add the expiry date for ${cat.label.toLowerCase()}.`);
  const operative = str(body.operative, 120);
  if (cat.operative && !operative) return jsonError('Please say which operative this document belongs to.');

  // Confirm the object really landed in storage before recording it.
  const admin = createAdminClient();
  const dir = path.slice(0, path.lastIndexOf('/'));
  const file = path.slice(path.lastIndexOf('/') + 1);
  const { data: found } = await admin.storage.from(DOCS_BUCKET).list(dir, { search: file, limit: 1 });
  if (!found?.some((f) => f.name === file)) return jsonError('Upload did not complete — please try again.', 400);

  const { data, error } = await admin
    .from('subcontractor_documents')
    .insert({
      subcontractor_id: sub.id,
      category: cat.key,
      label: str(body.label, 120) || null,
      operative_name: operative || null,
      reference: str(body.reference, 80) || null,
      cover_amount: cat.cover ? str(body.cover, 40) || null : null,
      expires_on: cat.expiry === 'none' ? null : expiresOn,
      storage_path: path,
      file_name: str(body.fileName, 200) || file,
      mime: str(body.mime, 80),
      size_bytes: Number(body.size) || null,
    })
    .select('*')
    .single();
  if (error) return jsonError('Could not save the document — please try again.', 500);

  await logEvent(sub.id, 'subcontractor', 'document_uploaded', { category: cat.key, file: body.fileName }, clientIp(req.headers));
  return NextResponse.json({ ok: true, document: data });
}

/** Subcontractors may withdraw a document until Heliaxis has reviewed it. */
export async function DELETE(req: Request) {
  const r = await portalRequest<{ token: string; id: string }>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('subcontractor_documents')
    .select('id, storage_path, status, file_name')
    .eq('id', body.id)
    .eq('subcontractor_id', sub.id)
    .maybeSingle();
  if (!doc) return jsonError('Document not found.', 404);
  if (doc.status === 'approved') return jsonError('Approved documents can only be removed by Heliaxis.', 409);

  await admin.storage.from(DOCS_BUCKET).remove([doc.storage_path]);
  await admin.from('subcontractor_documents').delete().eq('id', doc.id);
  await logEvent(sub.id, 'subcontractor', 'document_removed', { file: doc.file_name }, clientIp(req.headers));
  return NextResponse.json({ ok: true });
}
