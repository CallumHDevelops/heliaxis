import { crmSession, isUuid, json } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { docFileName, variantOf } from '@/lib/documents/pdf-kit';
import { renderTemplate } from '@/lib/documents/templates/render';
import { templateByCode } from '@/lib/templates/registry';
import { formsReady, jobHeadFor, supabaseStore } from '@/lib/templates/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string; code: string }> };

/**
 * The form as a PDF in the Heliaxis document style: a draft (with its banner, and "Not answered" where empty) until it is
 * signed, then as the record. A form not started is the empty template for this job. `?print=1`: the ink-saver version.
 */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id, code } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const template = templateByCode(code);
  if (!template) return json({ error: 'No such form' }, 404);
  const db = createAdminClient();
  if (!(await formsReady(db))) return json({ error: 'Forms are not set up yet', ready: false }, 503);
  const variant = variantOf(new URL(req.url).searchParams.has('print') ? 'print' : 'digital');
  const job = await jobHeadFor(db, id, variant);
  if (!job) return json({ error: 'Not found' }, 404);
  const row = await supabaseStore(db).live(id, template.code);
  const signed = Object.fromEntries(Object.entries(row?.signed ?? {}).map(([k, v]) => [k, { name: v.name, at: v.at, png: v.image ?? null }]));
  try {
    const bytes = await renderTemplate({ template, job, answers: row?.answers, signed, draft: row?.status !== 'signed', revision: row?.issue ?? null });
    return new Response(Buffer.from(bytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${docFileName(job.ref, template.code, template.title, row?.revision ?? 1)}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not make the PDF' }, 500);
  }
}
