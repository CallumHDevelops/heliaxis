import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { siteReview } from '@/lib/site/review';
import { sendAgain } from '@/lib/site/send';
import { blockedFirmProblem, notReady, readAssignment, siteReady, siteTabData } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * Send again a message to the trade that didn't go: { message_id }. The same message (a PO as the
 * version that's current, a return to site's written notice while it's still with them), so nothing
 * goes out as "updated" when the first never reached them. Replies with what happened to it, the
 * Site tab and the review.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { message_id?: unknown };
  const messageId = typeof b.message_id === 'string' && isUuid(b.message_id) ? b.message_id : null;
  if (!messageId) return json({ error: 'Which message?' }, 400);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  if (a.status === 'cancelled') return json({ error: 'This trade was taken off the job.' }, 409);
  // Nothing has reached them yet and their firm has been suspended or terminated since: it would be a new job.
  const { data: c } = await db.from('site_contacts').select('subcontractor_id').eq('id', a.contact_id).maybeSingle();
  const blocked = c ? await blockedFirmProblem(db, a, c) : null;
  if (blocked) return json({ error: blocked }, 422);
  const message = await sendAgain(db, messageId, a.id, s.user.email ?? s.user.id);
  if (!message) return json({ error: 'That message can’t be sent again: it went already, or something newer has replaced it.' }, 409);
  const now = (await readAssignment(db, id)) ?? a;
  return json({ ok: true, message, review: await siteReview(db, now), data: await siteTabData(db, a.project_id) });
}
