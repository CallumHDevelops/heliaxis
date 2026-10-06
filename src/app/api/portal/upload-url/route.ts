import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ALLOWED_MIME, CATEGORY_BY_KEY, MAX_FILE_BYTES, safeFileName } from '@/lib/subcontractors/documents';
import { DOCS_BUCKET, ensureDocsBucket } from '@/lib/subcontractors/server';
import { jsonError, portalRequest } from '@/lib/subcontractors/portal-request';

/**
 * Files go straight from the browser to Supabase Storage via a one-time signed
 * upload URL (Vercel functions cap request bodies at ~4.5 MB, certificates are
 * often bigger). The path is always scoped to this subcontractor's folder.
 */
export async function POST(req: Request) {
  const r = await portalRequest<{ token: string; category: string; fileName: string; size: number; mime: string }>(req);
  if ('error' in r) return r.error;
  const { sub, body } = r;

  if (!CATEGORY_BY_KEY[body.category]) return jsonError('Unknown document type.');
  if (!ALLOWED_MIME.includes(body.mime)) return jsonError('Please upload a PDF or a photo (JPG, PNG, WebP, HEIC).');
  if (!(body.size > 0) || body.size > MAX_FILE_BYTES) return jsonError('Files must be under 15 MB.');

  await ensureDocsBucket();
  const path = `${sub.id}/${body.category}/${Date.now()}-${safeFileName(String(body.fileName || ''))}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return jsonError('Could not prepare the upload — please try again.', 500);

  return NextResponse.json({ ok: true, path: data.path, uploadToken: data.token, bucket: DOCS_BUCKET });
}
