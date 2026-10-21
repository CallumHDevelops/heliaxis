import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { signDesign, type DesignInput } from '@/lib/site/eic/design';
import { certificateStatus } from '@/lib/site/eic/server';
import { notReady, readAssignment, siteReady } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * Sign the design part of the electrician's EIC (SPEC 3.2.9): { name, company, address, postcode,
 * tel, next_n, next_unit, departures, signature }. Replies with where the certificate stands, made
 * again (final once the electrician has signed off too).
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as DesignInput;
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That electrician isn’t on the job any more.' }, 404);
  const r = await signDesign(db, a, b, { id: s.user.id, name: s.profile.full_name || s.user.email || 'Office' });
  if (!r.ok) return json({ error: r.error }, r.status);
  const now = (await readAssignment(db, id)) ?? a;
  return json({ ok: true, status: await certificateStatus(db, now) });
}
