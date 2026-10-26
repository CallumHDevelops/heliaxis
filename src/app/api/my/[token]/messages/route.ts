import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectByToken } from '@/lib/crm/portal';
import { logActivity } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { HOURLY_LIMIT, listPortalMessages, MAX_MESSAGE, recentFromCustomer } from '@/lib/portal-messages';
import { canAccess } from '@/lib/portals';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The conversation with Heliaxis on this job, for the customer's portal. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return reply({ error: 'Not found' }, 404);
  const messages = await listPortalMessages(p.id);
  // What we sent them is now read.
  await createAdminClient().from('portal_messages').update({ read_at: new Date().toISOString() }).eq('project_id', p.id).eq('direction', 'out').is('read_at', null).then(() => null, () => null);
  return reply({ messages: messages.map((m) => ({ ...m, by: m.direction === 'out' ? m.by || 'Heliaxis' : null })) });
}

/**
 * The customer sends us a message (a question about their quote, say). It is saved against their record, shown
 * in the opportunity's activity, stops any automatic follow-ups (a person is talking to us) and the team is notified.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p) return reply({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const text = String(b.body || '').trim().slice(0, MAX_MESSAGE);
  if (!text) return reply({ error: 'Write your message first.' }, 400);
  if ((await recentFromCustomer(p.id)) >= HOURLY_LIMIT) return reply({ error: 'You have sent a lot of messages in a short time. Please wait a little, or call us.' }, 429);
  const db = createAdminClient();
  const { error } = await db.from('portal_messages').insert({ project_id: p.id, enquiry_id: p.enquiry_id, direction: 'in', body: text });
  if (error) return reply({ error: 'Couldn’t send your message just now. Please try again, or message us on WhatsApp.' }, 500);
  await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'note', body: `💬 Message from the customer (portal): ${text.length > 400 ? `${text.slice(0, 400)}…` : text}` });
  await db.from('crm_projects').update({ sequence_stopped_at: new Date().toISOString() }).eq('id', p.id).is('sequence_stopped_at', null).then(() => null, () => null);
  after(async () => {
    const { data: people } = await db.from('profiles').select('*').eq('status', 'approved');
    const team = (people ?? []).filter((x) => canAccess(x, 'crm')).map((x) => x.id as string);
    await Promise.all(team.map((userId) => notify({ userId, kind: 'crm_portal_message', title: `💬 Message from ${p.title}`, body: text.slice(0, 140), href: `/admin/crm/${p.id}`, tag: `crm-msg-${p.id}` })));
  });
  return reply({ ok: true });
}
