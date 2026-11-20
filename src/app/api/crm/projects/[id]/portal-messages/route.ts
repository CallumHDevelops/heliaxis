import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { notifyCustomer } from '@/lib/crm/portal-notify';
import { listPortalMessages, MAX_MESSAGE } from '@/lib/portal-messages';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The portal conversation on this job. Opening it marks the customer's messages as read. */
export async function GET(_: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const messages = await listPortalMessages(id);
  await createAdminClient().from('portal_messages').update({ read_at: new Date().toISOString() }).eq('project_id', id).eq('direction', 'in').is('read_at', null).then(() => null, () => null);
  return json({ messages });
}

/**
 * Reply to the customer in their portal: { body }. It is logged on their record, and they are emailed and
 * texted a short note with their link (whichever we have for them) so they know to look.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const text = String(b.body || '').trim().slice(0, MAX_MESSAGE);
  if (!text) return json({ error: 'Write your reply first.' }, 400);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, title').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const { error } = await db.from('portal_messages').insert({ project_id: id, enquiry_id: p.enquiry_id, direction: 'out', body: text, sent_by: s.user.id });
  if (error) return json({ error: error.message }, 500);
  await logActivity({ enquiryId: p.enquiry_id, projectId: id, kind: 'note', body: `💬 Reply sent in the customer’s portal: ${text.length > 400 ? `${text.slice(0, 400)}…` : text}`, byId: s.user.id });

  // They're told by email and text, with their link (src/lib/crm/portal-notify.ts).
  const told = await notifyCustomer(db, id, { kind: 'reply' });
  return json({ ok: true, emailed: told.emailed, texted: told.texted });
}
