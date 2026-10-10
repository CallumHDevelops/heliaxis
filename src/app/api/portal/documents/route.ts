import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY } from '@/lib/subcontractors/documents';
import { documentPaths, MAX_FILES, pathsInUse, processUpload, removeUnreferenced, type StoredFile } from '@/lib/subcontractors/doc-processing';
import { clientIp, DOCS_BUCKET, logEvent } from '@/lib/subcontractors/server';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';
import { fulfilRequestsForUpload, reopenRequestsForDocument, toPortalRequest } from '@/lib/subcontractors/requests';
import type { DocumentRow } from '@/lib/subcontractors/types';

// Converting photos / compressing a scanned PDF takes a few seconds.
export const maxDuration = 60;

type UploadedFile = { path: string; fileName: string; size?: number };

type Body = {
  /** Everything uploaded for this one document (e.g. a card's front and back), in page order. */
  files?: UploadedFile[];
  /** Older clients sent a single file. */
  path?: string;
  fileName?: string;
  size?: number;
  category: string;
  label?: string;
  operativeId?: string;
  reference?: string;
  cover?: string;
  expiresOn?: string;
  /** The document request this upload answers ('none' = not for a request). */
  requestId?: string;
};

/**
 * Record a document the browser has just uploaded to this subcontractor's storage folder:
 * its file(s) become one compact PDF (photos converted, scans compressed — see doc-processing.ts).
 */
export async function POST(req: Request) {
  // The conversion must finish well inside maxDuration, counting the downloads before it.
  const deadlineMs = Date.now() + 35_000;
  const r = await portalRequest<Body>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;

  const cat = CATEGORY_BY_KEY[body.category];
  if (!cat) return jsonError('Unknown document type.');
  const files: UploadedFile[] = Array.isArray(body.files)
    ? body.files.slice(0, MAX_FILES + 1)
    : body.path
      ? [{ path: body.path, fileName: body.fileName || '', size: body.size }]
      : [];
  if (!files.length) return jsonError('Choose a file.');
  if (files.length > MAX_FILES) return jsonError(`Upload up to ${MAX_FILES} files at a time.`);
  const own = (p: unknown) => typeof p === 'string' && p.startsWith(`${sub.id}/${cat.key}/`) && !p.includes('..');
  if (!files.every((f) => own(f.path)) || new Set(files.map((f) => f.path)).size !== files.length) {
    return jsonError('Invalid upload.', 403);
  }
  const clean = files.map((f) => ({
    path: f.path,
    name: str(f.fileName, 200) || f.path.slice(f.path.lastIndexOf('/') + 1),
    size: Number(f.size) || 0,
  }));
  // Only fresh uploads: a path a document already points at (e.g. an approved certificate)
  // must never be adopted — or deleted when this request is refused.
  const inUse = await pathsInUse(sub.id);
  if (!inUse) return jsonError('Could not check the upload — please try again.', 500);
  if (clean.some((f) => inUse.has(f.path))) return jsonError('Invalid upload.', 403);
  const admin = createAdminClient();
  // Anything refused below must not leave the uploaded files lying in storage.
  const discard = async (paths: string[]) => {
    if (paths.length) await admin.storage.from(DOCS_BUCKET).remove(paths);
  };
  const refuse = async (msg: string, status = 400) => {
    await discard(clean.map((f) => f.path));
    return jsonError(msg, status);
  };

  const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(body.expiresOn || '') ? body.expiresOn! : null;
  if (cat.expiry === 'required' && !expiresOn) return refuse(`Please add the expiry date for ${cat.label.toLowerCase()}.`);
  let operative: { id: string; full_name: string } | null = null;
  if (cat.operative) {
    const { data: op } = await admin
      .from('subcontractor_operatives')
      .select('id, full_name')
      .eq('id', str(body.operativeId, 40))
      .eq('subcontractor_id', sub.id)
      .is('archived_at', null)
      .maybeSingle();
    if (!op) return refuse('Please choose which member of your team this document belongs to.');
    operative = op;
  }

  // Checks every file really is a PDF / photo (magic bytes), then builds the one PDF.
  let stored: StoredFile;
  try {
    const processed = await processUpload(clean, { deadlineMs });
    if (!processed.ok) return jsonError(processed.error, processed.status);
    stored = processed.stored;
  } catch (e) {
    console.error('[portal/documents] processing failed', e);
    return refuse('Something went wrong saving that — please try again.', 500);
  }

  const row = {
    subcontractor_id: sub.id,
    category: cat.key,
    label: str(body.label, 120) || null,
    operative_name: operative?.full_name ?? null,
    operative_id: operative?.id ?? null,
    reference: str(body.reference, 80) || null,
    cover_amount: cat.cover ? str(body.cover, 40) || null : null,
    expires_on: cat.expiry === 'none' ? null : expiresOn,
    storage_path: stored.storage_path,
    file_name: stored.file_name,
    mime: stored.mime,
    size_bytes: stored.size_bytes,
  };
  const extra = {
    original_files: stored.original_files,
    original_bytes: stored.original_bytes,
    processed_at: stored.processed_at,
    processing_note: stored.processing_note,
  };
  let { data, error } = await admin.from('subcontractor_documents').insert({ ...row, ...extra }).select('*').single();
  if (error && /original_files|original_bytes|processed_at|processing_note/.test(error.message)) {
    // supabase/portal-v4.sql not run yet: record the PDF without the processing details (and
    // don't keep originals nothing points at).
    ({ data, error } = await admin.from('subcontractor_documents').insert(row).select('*').single());
    if (!error) await discard((stored.original_files ?? []).map((o) => o.path).filter((p) => p !== stored.storage_path));
  }
  if (error || !data) {
    await discard([...new Set([...documentPaths(stored), ...clean.map((f) => f.path)])]);
    return jsonError('Could not save the document — please try again.', 500);
  }

  await logEvent(
    sub.id,
    'subcontractor',
    'document_uploaded',
    { category: cat.key, file: stored.file_name, note: stored.processing_note || undefined },
    clientIp(req.headers)
  );
  const fulfilled = await fulfilRequestsForUpload(sub, data as DocumentRow, body.requestId);
  return NextResponse.json({ ok: true, document: forPortal(data as DocumentRow), fulfilled });
}

/** The browser never needs storage keys. */
function forPortal(d: DocumentRow) {
  const out: Partial<DocumentRow> = { ...d };
  delete out.storage_path;
  delete out.original_files;
  return out;
}

/** Subcontractors may withdraw a document until Heliaxis has reviewed it. */
export async function DELETE(req: Request) {
  const r = await portalRequest<{ id: string }>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('subcontractor_documents')
    .select('*')
    .eq('id', body.id)
    .eq('subcontractor_id', sub.id)
    .maybeSingle();
  if (!doc) return jsonError('Document not found.', 404);
  if (doc.status === 'approved') return jsonError('Approved documents can only be removed by Heliaxis.', 409);

  // Anything this document answered is open again (done before the delete clears the link).
  const reopened = await reopenRequestsForDocument(sub.id, doc);
  await admin.from('subcontractor_documents').delete().eq('id', doc.id);
  // After the row is gone, so a path another document still uses is kept.
  await removeUnreferenced(sub.id, documentPaths(doc as DocumentRow));
  await logEvent(sub.id, 'subcontractor', 'document_removed', { file: doc.file_name }, clientIp(req.headers));
  return NextResponse.json({ ok: true, reopened: reopened.map(toPortalRequest) });
}
