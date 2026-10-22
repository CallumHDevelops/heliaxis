import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { reopenSignoff } from '@/lib/site/signoff';
import { notReady, readAssignment, siteReady, siteTabData } from '@/lib/site/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * Reopen a trade's latest sign-off, so they can change answers and sign again from the same link.
 * The PO stays: the new sign-off updates it, and one that had gone shows Issue again when the money
 * changed. Replies with the Site tab.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await siteReady())) return notReady();
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const a = await readAssignment(db, id);
  if (!a) return json({ error: 'That trade isn’t on the job any more.' }, 404);
  if (a.status === 'cancelled') return json({ error: 'This trade was taken off the job.' }, 409);
  const r = await reopenSignoff(db, a, s.user.id, s.profile.full_name ?? s.user.email ?? null);
  if (!r.ok) return json({ error: r.error }, 409);
  return json({ ok: true, stage: r.stage, data: await siteTabData(db, a.project_id) });
}
