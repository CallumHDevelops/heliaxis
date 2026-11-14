import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { applyAnswers, readEic, ROUTES, viewOf } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The certificate as the editor draws it: its steps with the questions that apply, the boards and circuits, what is still needed. */
export async function GET(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  return json(await viewOf(db, row, { name: s.profile.full_name || '' }));
}

/**
 * Change it: { set: {key: value}, unset: [key], route?, title?, address?, enquiry_id?, project_id? } (null clears an assignment). A job brings its
 * customer. An issued certificate is locked until it is reopened. Replies with the new view.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued. Reopen it to change it.' }, 409);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('set' in b || 'unset' in b) patch.answers = applyAnswers(row.answers, b.set, b.unset);
  if (typeof b.route === 'string' && (ROUTES as readonly string[]).includes(b.route)) patch.route = b.route;
  if ('title' in b) patch.title = String(b.title ?? '').trim().slice(0, 200);
  if ('address' in b) patch.address = String(b.address ?? '').trim().slice(0, 300);
  for (const k of ['enquiry_id', 'project_id'] as const) if (k in b) patch[k] = b[k] && isUuid(String(b[k])) ? String(b[k]) : null;
  if (patch.project_id && !('enquiry_id' in b)) {
    const { data } = await db.from('crm_projects').select('enquiry_id').eq('id', String(patch.project_id)).maybeSingle();
    if (!row.enquiry_id) patch.enquiry_id = (data as { enquiry_id?: string } | null)?.enquiry_id ?? null;
  }
  const { error } = await db.from('eic_manual').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  const next = await readEic(db, id);
  return json(await viewOf(db, next!, { name: s.profile.full_name || '' }));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (row?.status === 'issued' && s.profile.role !== 'admin') return json({ error: 'Only an admin can delete an issued certificate.' }, 403);
  const { error } = await db.from('eic_manual').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
