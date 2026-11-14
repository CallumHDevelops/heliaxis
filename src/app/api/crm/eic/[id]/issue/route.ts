import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { issue, readEic, viewOf } from '@/lib/eic-manual/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** { action: 'issue' } makes it final, dates it and files it in the job's Docs (when it has a job); { action: 'reopen' } unlocks it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  const db = createAdminClient();
  const row = await readEic(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  const who = { name: s.profile.full_name || '' };
  if (b.action === 'reopen') {
    await db.from('eic_manual').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', id);
  } else if (b.action === 'issue') {
    if (row.status === 'issued') return json({ error: 'Already issued.' }, 409);
    const r = await issue(db, row, who, s.user.id);
    if (!r.ok) return json({ error: r.error }, 422);
  } else return json({ error: 'Unknown action' }, 400);
  const next = await readEic(db, id);
  return json(await viewOf(db, next!, who));
}
