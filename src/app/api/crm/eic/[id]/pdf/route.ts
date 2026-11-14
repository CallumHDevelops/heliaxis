import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { makePdf, readEic } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The certificate as a PDF as it stands (a draft until it is complete). ?variant=print for the ink saver, ?inline=1 to open in the browser. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  const q = new URL(req.url).searchParams;
  try {
    const made = await makePdf(db, row, { name: s.profile.full_name || '' }, q.get('variant') === 'print' ? 'print' : 'digital');
    return new Response(Buffer.from(made.bytes), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `${q.get('inline') === '1' ? 'inline' : 'attachment'}; filename="${made.name.replace(/[^\x20-\x7e]/g, '-').replace(/"/g, '')}"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t make the certificate.' }, 500);
  }
}
