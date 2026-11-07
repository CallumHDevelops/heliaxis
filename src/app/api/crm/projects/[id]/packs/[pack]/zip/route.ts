import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { packZip } from '@/lib/docs/server';
import type { PackKey } from '@/lib/docs/packs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string; pack: string }> };

/** One pack's documents as a ZIP: each named by its document number and title, the forms drawn as PDFs. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id, pack } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  if (pack !== 'proposal' && pack !== 'inhouse' && pack !== 'handover') return json({ error: 'No such pack' }, 404);
  const r = await packZip(createAdminClient(), id, pack as PackKey);
  if (!r.ok) return json({ error: r.error }, r.status);
  return new Response(Buffer.from(r.bytes), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${r.name}"`, 'Cache-Control': 'no-store' },
  });
}
