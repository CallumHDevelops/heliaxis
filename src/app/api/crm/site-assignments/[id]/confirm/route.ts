import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { confirmRead, siteReview } from '@/lib/site/review';
import { notReady, readAssignment, siteReady } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Confirm a label read against its photo: { read_id }. Replies with the review. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { read_id?: unknown };
  if (typeof b.read_id !== 'string' || !isUuid(b.read_id)) return json({ error: 'Which read?' }, 400);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  const r = await confirmRead(db, a, b.read_id, { id: s.user.id, name: s.profile.full_name || s.user.email || 'Office' });
  if (!r.ok) return json({ error: r.error }, 409);
  return json({ ok: true, review: await siteReview(db, a) });
}
