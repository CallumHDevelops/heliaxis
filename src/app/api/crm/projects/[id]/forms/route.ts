import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { formView, type FormRow } from '@/lib/templates/forms';
import { templatesForProducts } from '@/lib/templates/registry';
import { formsReady } from '@/lib/templates/store';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The forms that belong on this project (by its products), each with where it is: not started, draft or signed, and how much is done. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  if (!(await formsReady(db))) return json({ error: 'Forms are not set up yet', ready: false }, 503);
  const { data: p } = await db.from('crm_projects').select('id, products').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const { data } = await db.from('template_documents').select('*').eq('project_id', id).neq('status', 'superseded');
  const rows = new Map(((data ?? []) as FormRow[]).map((r) => [r.template_code, r]));
  const forms = templatesForProducts((p.products as string[] | null) ?? []).map((t) => {
    const v = formView(t, rows.get(t.code) ?? null);
    return { code: v.code, title: v.title, purpose: v.purpose, status: v.status, revision: v.revision, progress: v.progress, signed: Object.keys(v.signed), updatedAt: v.updatedAt };
  });
  return json({ ready: true, forms });
}
