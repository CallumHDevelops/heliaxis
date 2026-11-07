import { crmSession, isUuid, json } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formPdf } from '@/lib/templates/pdf';
import { templateByCode } from '@/lib/templates/registry';
import { formsReady } from '@/lib/templates/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string; code: string }> };

/**
 * The form as a PDF in the Heliaxis document style: a draft (with its banner, and "Not answered" where empty) until it is
 * signed, then as the record. A form not started is the empty template for this job. `?print=1`: the ink-saver version.
 * `?download=1`: saved as a file instead of opened.
 */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id, code } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  if (!templateByCode(code)) return json({ error: 'No such form' }, 404);
  const db = createAdminClient();
  if (!(await formsReady(db))) return json({ error: 'Forms are not set up yet', ready: false }, 503);
  const q = new URL(req.url).searchParams;
  const r = await formPdf(db, id, code, q.has('print'));
  if (!r.ok) return json({ error: r.error }, r.status);
  return new Response(Buffer.from(r.bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${q.has('download') ? 'attachment' : 'inline'}; filename="${r.fileName}"`, 'Cache-Control': 'no-store' },
  });
}
