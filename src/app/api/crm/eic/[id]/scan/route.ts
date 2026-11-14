import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { readEic } from '@/lib/eic-manual/server';
import { scanPhoto } from '@/lib/eic-manual/scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/** A photo of a board or a paper test sheet → the circuits read from it, as suggestions (nothing is saved here). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const row = await readEic(createAdminClient(), id);
  if (!row) return json({ error: 'Not found' }, 404);
  const file = (await req.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose a photo.' }, 400);
  if (file.size > 6 * 1024 * 1024) return json({ error: 'That photo is too big.' }, 400);
  const out = await scanPhoto(Buffer.from(await file.arrayBuffer()), file.type, `eic:${row.number}`);
  return json(out, out.ok ? 200 : 422);
}
