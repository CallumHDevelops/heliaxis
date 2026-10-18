import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, isUuid, json, signedDoc } from '@/lib/crm/server';

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

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if ('name' in b) u.name = String(b.name || '').trim().slice(0, 140) || 'Document';
  if ('description' in b) u.description = String(b.description || '').trim().slice(0, 300) || null;
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
