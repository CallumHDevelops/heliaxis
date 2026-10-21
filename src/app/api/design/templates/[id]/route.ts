import { createAdminClient } from '@/lib/supabase/admin';
import { NOT_READY, cleanGeometry, cleanName, designReady, designSession, isUuid, json } from '@/lib/design/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Rename a template or correct its trim/bleed/safe settings. Body: { name?, geometry? }. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) u.name = cleanName(b.name, 'Printer template');
  if (b.geometry !== undefined) {
    const g = cleanGeometry(b.geometry);
    if (!g) return json({ error: 'The page size looks wrong.' }, 400);
    u.geometry = g;
  }
  const { data, error } = await createAdminClient()
    .from('design_templates')
    .update(u)
    .eq('id', id)
    .select('id, name, title, storage_path, size, geometry, created_at')
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'That template isn’t there any more.' }, 404);
  return json({ item: data });
}

/** Remove a template from the library (designs that use it keep working — the PDF stays in storage). */
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { error } = await createAdminClient()
    .from('design_templates')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
}
