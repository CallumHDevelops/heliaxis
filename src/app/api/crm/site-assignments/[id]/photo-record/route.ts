import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, isUuid, json } from '@/lib/crm/server';
import { savePhotoRecord } from '@/lib/site/electrician-docs';
import { notReady, readAssignment, siteReady } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * The electrician's photo record (SPEC 2.13 item 7): made when the office asks, because a job's
 * photos make a big file. Internal (not visible to the customer). Replies with a link to download it.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a || a.trade !== 'electrician') return json({ error: 'That electrician isn’t on the job any more.' }, 404);
  const r = await savePhotoRecord(db, a.id, s.user.id);
  if (!r) return json({ error: 'There’s nothing to put in it yet.' }, 409);
  const { data } = await db.storage.from(DOCS_BUCKET).createSignedUrl(r.doc.storage_path, 600, { download: r.doc.name });
  return json({ ok: true, name: r.doc.name, version: r.doc.version, url: data?.signedUrl ?? null });
}
