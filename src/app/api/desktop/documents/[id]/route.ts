import { NextResponse } from 'next/server';
import { DOCS_BUCKET } from '@/lib/crm/server';
import { desktopSession } from '@/lib/desktop/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * One document on a job (a quote, a design pack), as its file, for the desktop app's "Open file". The same people who can
 * open the job's documents in HAP (the CRM portal) can fetch it. Nothing here shares it with a customer.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await desktopSession(req);
  if ('error' in a) return json({ error: a.error }, a.status);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Document not found.' }, 404);
  const db = createAdminClient();
  const { data: doc } = await db.from('crm_documents').select('id, name, mime, storage_path').eq('id', id).maybeSingle();
  if (!doc?.storage_path) return json({ error: 'Document not found.' }, 404);
  const { data: file, error } = await db.storage.from(DOCS_BUCKET).download(doc.storage_path as string);
  if (error || !file) return json({ error: 'The file could not be read from storage.' }, 502);
  const name = String(doc.name || 'document.pdf').replace(/[\\/:*?"<>|\r\n]+/g, '-');
  return new Response(await file.arrayBuffer(), {
    headers: {
      'Content-Type': (doc.mime as string) || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Filename': encodeURIComponent(name),
      'Cache-Control': 'no-store',
    },
  });
}
