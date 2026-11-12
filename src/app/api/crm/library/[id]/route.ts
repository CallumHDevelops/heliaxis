import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, isUuid, json, signedDoc } from '@/lib/crm/server';
import { libraryFields } from '@/lib/handover/library';
import { cleanLibraryCategory } from '@/lib/writeups/categories';
import { handoverReady } from '@/lib/handover/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const { data } = await createAdminClient().from('crm_library').select('storage_path, name').eq('id', id).maybeSingle();
  // ?download=1 saves it under its own name (with the file's type), instead of opening it.
  const ext = /\.[a-z0-9]{1,5}$/i.exec(String(data?.storage_path ?? ''))?.[0] ?? '';
  const dl = new URL(req.url).searchParams.has('download') ? `${String(data?.name ?? 'document')}${ext}` : undefined;
  const url = data ? await signedDoc(data.storage_path, 300, dl) : null;
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
  // The product library's own fields (handover.sql); archiving keeps it on the jobs that have it.
  if (await handoverReady()) {
    Object.assign(u, libraryFields(b));
    if ('archived' in b) u.archived_at = b.archived === true ? new Date().toISOString() : null;
  }
  const db = createAdminClient();
  if (Object.keys(u).length) {
    const { error } = await db.from('crm_library').update(u).eq('id', id);
    if (error) return json({ error: error.message }, 500);
  }
  if ('category' in b) {
    const { error } = await db.from('crm_library').update({ category: cleanLibraryCategory(b.category) }).eq('id', id);
    if (error) return json({ error: /category/.test(error.message) ? 'Run supabase/document-templates.sql in Supabase first, then try again.' : error.message }, 500);
  }
  return json({ ok: true });
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
