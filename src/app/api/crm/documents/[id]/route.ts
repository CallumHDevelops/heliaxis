import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOC_CATEGORIES, DOCS_BUCKET, isUuid, json, signedDoc } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Open the file (short-lived signed link). */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { data } = await createAdminClient().from('crm_documents').select('storage_path, name').eq('id', id).maybeSingle();
  if (!data) return json({ error: 'Not found' }, 404);
  const dl = new URL(req.url).searchParams.has('download') ? data.name : undefined;
  const url = await signedDoc(data.storage_path, 300, dl);
  return url ? NextResponse.redirect(url) : json({ error: 'File missing' }, 404);
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if ('visible' in b) u.visible = !!b.visible;
  if ('needs_signature' in b) u.needs_signature = !!b.needs_signature;
  if ('name' in b) u.name = String(b.name || '').trim().slice(0, 140) || 'Document';
  if ('category' in b && (DOC_CATEGORIES as readonly string[]).includes(b.category)) u.category = b.category;
  const { error } = await createAdminClient().from('crm_documents').update(u).eq('id', id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data } = await db.from('crm_documents').select('storage_path').eq('id', id).maybeSingle();
  if (data) await db.storage.from(DOCS_BUCKET).remove([data.storage_path]);
  await db.from('crm_documents').delete().eq('id', id);
  return json({ ok: true });
}
