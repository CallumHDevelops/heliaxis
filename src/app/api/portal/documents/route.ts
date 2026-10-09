import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_BY_KEY } from '@/lib/subcontractors/documents';
import { clientIp, DOCS_BUCKET, logEvent } from '@/lib/subcontractors/server';
import { jsonError, portalRequest, str } from '@/lib/subcontractors/portal-request';
import { fulfilRequestsForUpload, reopenRequestsForDocument, toPortalRequest } from '@/lib/subcontractors/requests';
import type { DocumentRow } from '@/lib/subcontractors/types';

type Body = {
  path: string;
  fileName: string;
  mime: string;
  size: number;
  category: string;
  label?: string;
  operativeId?: string;
  reference?: string;
  cover?: string;
  expiresOn?: string;
  /** The document request this upload answers ('none' = not for a request). */
  requestId?: string;
};

/** Identify a file by its magic bytes. Returns the real MIME type or null. */
function sniffType(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return 'image/heic';
  return null;
}

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
  const admin = createAdminClient();
  let operative: { id: string; full_name: string } | null = null;
  if (cat.operative) {
    const { data: op } = await admin
      .from('subcontractor_operatives')
      .select('id, full_name')
      .eq('id', str(body.operativeId, 40))
      .eq('subcontractor_id', sub.id)
      .is('archived_at', null)
      .maybeSingle();
    if (!op) return jsonError('Please choose which member of your team this document belongs to.');
    operative = op;
  }

  // Confirm the object landed, and that its bytes really are a PDF or image —
  // the declared type comes from the browser and can't be trusted.
  const { data: blob } = await admin.storage.from(DOCS_BUCKET).download(path);
  if (!blob) return jsonError('Upload did not complete — please try again.', 400);
  const sniffed = sniffType(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
  if (!sniffed) {
    await admin.storage.from(DOCS_BUCKET).remove([path]);
    return jsonError('That file is not a PDF or a photo. Please upload a PDF, JPG, PNG, WebP or HEIC.', 400);
  }
  const file = path.slice(path.lastIndexOf('/') + 1);

  const { data, error } = await admin
    .from('subcontractor_documents')
    .insert({
      subcontractor_id: sub.id,
      category: cat.key,
      label: str(body.label, 120) || null,
      operative_name: operative?.full_name ?? null,
      operative_id: operative?.id ?? null,
      reference: str(body.reference, 80) || null,
      cover_amount: cat.cover ? str(body.cover, 40) || null : null,
      expires_on: cat.expiry === 'none' ? null : expiresOn,
      storage_path: path,
      file_name: str(body.fileName, 200) || file,
      mime: sniffed,
      size_bytes: Number(body.size) || null,
    })
    .select('*')
    .single();
  if (error) return jsonError('Could not save the document — please try again.', 500);

  await logEvent(sub.id, 'subcontractor', 'document_uploaded', { category: cat.key, file: body.fileName }, clientIp(req.headers));
  const fulfilled = await fulfilRequestsForUpload(sub, data as DocumentRow, body.requestId);
  const document: Partial<DocumentRow> = { ...(data as DocumentRow) };
  delete document.storage_path; // the browser never needs the storage key
  return NextResponse.json({ ok: true, document, fulfilled });
}

/** Subcontractors may withdraw a document until Heliaxis has reviewed it. */
export async function DELETE(req: Request) {
  const r = await portalRequest<{ id: string }>(req);
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

  // Anything this document answered is open again (done before the delete clears the link).
  const reopened = await reopenRequestsForDocument(sub.id, doc);
  await admin.storage.from(DOCS_BUCKET).remove([doc.storage_path]);
  await admin.from('subcontractor_documents').delete().eq('id', doc.id);
  await logEvent(sub.id, 'subcontractor', 'document_removed', { file: doc.file_name }, clientIp(req.headers));
  return NextResponse.json({ ok: true, reopened: reopened.map(toPortalRequest) });
}
