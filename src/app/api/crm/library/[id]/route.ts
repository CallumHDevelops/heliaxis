import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, isUuid, json, signedDoc } from '@/lib/crm/server';
import { libraryFields } from '@/lib/handover/library';
import { handoverReady } from '@/lib/handover/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { data } = await createAdminClient().from('crm_library').select('storage_path').eq('id', id).maybeSingle();
  const url = data ? await signedDoc(data.storage_path, 300) : null;
  return url ? NextResponse.redirect(url) : json({ error: 'Not found' }, 404);
}

/** Admins only, as on CRM settings → Product library: a change reaches customers' handover packs. */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can change the product library.' }, 403);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if ('name' in b) u.name = String(b.name || '').trim().slice(0, 140) || 'Document';
  if ('description' in b) u.description = String(b.description || '').trim().slice(0, 300) || null;
  // The product library's own fields (handover.sql); archiving keeps it on the jobs that have it.
  if (await handoverReady()) {
    Object.assign(u, libraryFields(b));
    if ('archived' in b) u.archived_at = b.archived === true ? new Date().toISOString() : null;
  }
  const { error } = await createAdminClient().from('crm_library').update(u).eq('id', id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data } = await db.from('crm_library').select('storage_path').eq('id', id).maybeSingle();
  if (data) await db.storage.from(DOCS_BUCKET).remove([data.storage_path]);
  await db.from('crm_library').delete().eq('id', id);
  return json({ ok: true });
}
