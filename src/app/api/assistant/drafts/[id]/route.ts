import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';

/** { subject?, body? } edits a draft; { status: 'sent' | 'discarded' } closes it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if (typeof b.subject === 'string') u.subject = b.subject.slice(0, 200);
  if (typeof b.body === 'string') u.body = b.body.slice(0, 8000);
  if (b.status === 'sent' || b.status === 'discarded') {
    u.status = b.status;
    if (b.status === 'sent') u.sent_at = new Date().toISOString();
  }
  const { error } = await createAdminClient().from('assistant_drafts').update(u).eq('id', id).eq('status', 'draft');
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}
