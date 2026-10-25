import { createAdminClient } from '@/lib/supabase/admin';
import {
  NOT_READY,
  cleanDoc,
  cleanName,
  designReady,
  designSession,
  isUuid,
  json,
  saveThumb,
} from '@/lib/design/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const CONFLICT = 'This design was saved on another computer since you opened it, so it wasn’t saved over.';
const GONE = 'That design isn’t there any more.';

/** One saved design, with its full document. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { data, error } = await createAdminClient()
    .from('design_projects')
    .select('id, name, format_id, doc, updated_at, archived_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data || data.archived_at) return json({ error: 'That design isn’t there any more.' }, 404);
  return json({ item: data });
}

/**
 * Update a design. Body: { name?, doc?, thumb?, archived?, base? }.
 * `base` is the updated_at the editor's copy was opened or last saved at: when it's sent and the
 * design has been saved since (another computer, another tab), nothing is written and the answer
 * is 409 { conflict: true }, so a stale copy never overwrites newer work. A deleted (archived)
 * design isn't written to either (404), except to restore it ({ archived: false }).
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await designSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));

  const u: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: s.user.id };
  if (b.name !== undefined) u.name = cleanName(b.name);
  if (b.doc !== undefined) {
    const clean = cleanDoc(b.doc);
    if (!clean.ok) return json({ error: clean.error }, 400);
    u.doc = clean.doc;
    u.format_id = String(clean.doc.formatId || 'custom').slice(0, 40);
    const lib = clean.doc.template?.libraryId;
    u.template_id = lib && isUuid(lib) ? lib : null;
  }
  if (typeof b.archived === 'boolean') u.archived_at = b.archived ? new Date().toISOString() : null;

  const db = createAdminClient();
  const base = typeof b.base === 'string' && b.base ? b.base : null;
  let q = db.from('design_projects').update(u).eq('id', id);
  if (b.archived !== false) q = q.is('archived_at', null);
  if (base) q = q.eq('updated_at', base);
  const { data, error } = await q.select('id, name, format_id, updated_at').maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) {
    if (base) {
      const { data: cur } = await db.from('design_projects').select('archived_at').eq('id', id).maybeSingle();
      if (cur && !cur.archived_at) return json({ error: CONFLICT, conflict: true }, 409);
    }
    return json({ error: GONE, gone: true }, 404);
  }

  if (b.thumb) {
    const thumb = await saveThumb(id, b.thumb);
    if (thumb) await db.from('design_projects').update({ thumb_path: thumb }).eq('id', id);
  }
  return json({ item: data });
}

/** Archive (soft-delete) a design. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await designSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { error } = await createAdminClient()
    .from('design_projects')
    .update({ archived_at: new Date().toISOString(), updated_by: s.user.id })
    .eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
}
