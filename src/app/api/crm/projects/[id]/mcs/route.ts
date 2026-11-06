import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { HANDOVER_STAGES } from '@/app/admin/crm/[id]/record-shared';
import { handoverReady, handoverSummary } from '@/lib/handover/server';
import { packHeadline } from '@/lib/inhouse/pack';
import { inhouseView } from '@/lib/inhouse/server';
import { formsReady, listForms } from '@/lib/templates/store';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * The MCS pack on a job: the In-House items (internal, never shown to a customer), the forms to complete (the heat pump
 * commissioning record and the rest), and the customer's handover pack, which opens from "Ready to book".
 * `?summary=1`: just the headline, for the Overview's card.
 */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, stage, products').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const [inhouse, formsOk, handoverOn] = await Promise.all([inhouseView(db, id), formsReady(db), handoverReady()]);
  if (!inhouse) return json({ error: 'Not found' }, 404);
  const forms = formsOk ? await listForms(db, id, (p.products as string[] | null) ?? []) : [];
  const headline = packHeadline(inhouse.views, forms);
  if (new URL(req.url).searchParams.has('summary')) return json({ ...headline });
  const stage = String(p.stage ?? '');
  const handover = handoverOn && HANDOVER_STAGES.includes(stage) ? await handoverSummary(db, id) : null;
  return json({
    headline,
    inhouse: { headline: inhouse.headline, rows: inhouse.views.filter((v) => !v.hidden), hidden: inhouse.views.filter((v) => v.hidden).length, uploads: inhouse.uploads },
    forms: { ready: formsOk, list: forms },
    handover: { available: !!handover, summary: handover, opensAt: handoverOn ? 'Ready to book' : null },
  });
}
