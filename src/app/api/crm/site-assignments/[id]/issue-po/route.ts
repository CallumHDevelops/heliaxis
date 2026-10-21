import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { issueLabourPo, refreshDraftPo } from '@/lib/site/labour-po';
import { notReady, readAssignment, siteReady, siteTabData } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * Issue a trade's labour PO from the Site tab: a held one (once what it needs is there), or Issue
 * again after a change (it says it replaces the version sent before). { override: true } issues past
 * the owner's own holds (an Urgent flag, the scaffold not down yet). Replies with the Site tab.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { override?: unknown };
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  if (a.status !== 'signed' && a.status !== 'done') return json({ error: 'The PO is raised when they sign off.' }, 409);
  if (!a.raise_po) return json({ error: 'No PO for this trade (turned off on the Site tab).' }, 409);
  const po = await refreshDraftPo(db, a);
  if (!po) return json({ error: 'There’s no PO to issue yet.' }, 409);
  const r = await issueLabourPo(db, po.id, { by: s.user.id, override: b.override === true, origin: new URL(req.url).origin });
  if (!r.ok) return json({ error: r.words?.length ? r.words.join('. ') : r.error, held: r.held ?? [], data: await siteTabData(db, a.project_id) }, 409);
  return json({ ok: true, po: { id: r.po.id, po_number: r.po.po_number }, notes: r.notes, data: await siteTabData(db, a.project_id) });
}
