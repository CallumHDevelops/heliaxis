import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/crm/server';
import { readByToken } from '@/lib/eic-manual/request';
import { scanPhoto } from '@/lib/eic-manual/scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/** The installer's photo of a board or test sheet → circuits as suggestions (nothing is saved here). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const row = await readByToken(createAdminClient(), (await params).token);
  if (!row) return json({ error: 'This link isn’t working any more.' }, 404);
  if (row.status === 'issued') return json({ error: 'It’s been issued, so it can’t be changed.' }, 409);
  const file = (await req.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose a photo.' }, 400);
  if (file.size > 6 * 1024 * 1024) return json({ error: 'That photo is too big.' }, 400);
  const out = await scanPhoto(Buffer.from(await file.arrayBuffer()), file.type, `eic:${row.number}`);
  return json(out, out.ok ? 200 : 422);
}
