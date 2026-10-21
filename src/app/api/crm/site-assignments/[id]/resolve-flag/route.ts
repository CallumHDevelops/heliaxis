import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { resolveFlag, siteReview } from '@/lib/site/review';
import { notReady, readAssignment, siteReady, siteTabData } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Resolve a trade's flag with a note: { code, note }. Replies with the review and the Site tab. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { code?: unknown; note?: unknown };
  const code = typeof b.code === 'string' ? b.code.slice(0, 40) : '';
  if (!code) return json({ error: 'Which flag?' }, 400);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  const r = await resolveFlag(db, a, code, String(b.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 500), { id: s.user.id, name: s.profile.full_name || s.user.email || 'Office' });
  if (!r.ok) return json({ error: r.error }, 409);
  const now = (await readAssignment(db, id)) ?? a;
  return json({ ok: true, review: await siteReview(db, now), data: await siteTabData(db, a.project_id) });
}
