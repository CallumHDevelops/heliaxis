import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { greenLight, returnToSite, type ReturnInput } from '@/lib/site/returns';
import { siteReview } from '@/lib/site/review';
import { notReady, readAssignment, siteReady, siteTabData } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * The office's review of one signed submission, after the PO has gone:
 * - { action: 'green', signoff_id }: Green light (the trade is told; the PO's hold lifts).
 * - { action: 'return', signoff_id, what, photo_ids, fix_by, safety }: Return to site required, sent
 *   at once by email and WhatsApp as the written notice; the PO goes on hold.
 * Replies with the review, the Site tab, and what was sent (or why not).
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as ReturnInput & { action?: unknown; signoff_id?: unknown };
  const signoffId = typeof b.signoff_id === 'string' && isUuid(b.signoff_id) ? b.signoff_id : null;
  if (!signoffId) return json({ error: 'Which sign-off?' }, 400);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  if (a.status === 'cancelled') return json({ error: 'This trade was taken off the job.' }, 409);
  const by = { id: s.user.id, name: s.profile.full_name || s.user.email || 'Office' };
  const origin = new URL(req.url).origin;
  const r = b.action === 'green' ? await greenLight(db, a, signoffId, by, origin) : b.action === 'return' ? await returnToSite(db, a, signoffId, b, by, origin) : null;
  if (!r) return json({ error: 'Green light, or return to site?' }, 400);
  if (!r.ok) return json({ error: r.error }, r.status);
  const now = (await readAssignment(db, id)) ?? a;
  return json({ ok: true, messages: r.messages, notes: r.notes, review: await siteReview(db, now), data: await siteTabData(db, a.project_id) });
}
