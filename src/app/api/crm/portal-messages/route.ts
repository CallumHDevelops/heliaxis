import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';

export type PortalThread = {
  projectId: string;
  name: string;
  ref: string | null;
  last: { body: string; at: string; fromCustomer: boolean };
  /** Their messages we haven't opened. */
  unread: number;
  /** The last word is theirs. */
  needsReply: boolean;
};

/**
 * Customer portal conversations for the messages dock's Portal tab (next to WhatsApp): one row per job
 * with portal messages, newest first, with what's unread and who spoke last. The last 500 messages.
 */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const db = createAdminClient();
  const { data: msgs, error } = await db.from('portal_messages').select('project_id, direction, body, read_at, created_at').order('created_at', { ascending: false }).limit(500);
  if (error) return json({ threads: [], unread: 0 });
  const by = new Map<string, PortalThread & { enquiryId?: string }>();
  for (const m of msgs ?? []) {
    const id = String(m.project_id);
    let t = by.get(id);
    if (!t) {
      t = { projectId: id, name: '', ref: null, last: { body: String(m.body), at: String(m.created_at), fromCustomer: m.direction === 'in' }, unread: 0, needsReply: m.direction === 'in' };
      by.set(id, t);
    }
    if (m.direction === 'in' && !m.read_at) t.unread += 1;
  }
  const ids = [...by.keys()];
  if (ids.length) {
    const { data: projects } = await db.from('crm_projects').select('id, enquiry_id, project_ref, title').in('id', ids);
    const enq = [...new Set((projects ?? []).map((p) => String(p.enquiry_id)))];
    const { data: people } = enq.length ? await db.from('enquiries').select('id, name').in('id', enq) : { data: [] };
    const nameOf = new Map((people ?? []).map((e) => [String(e.id), String(e.name ?? '')]));
    for (const p of projects ?? []) {
      const t = by.get(String(p.id));
      if (!t) continue;
      t.name = nameOf.get(String(p.enquiry_id)) || String(p.title ?? '') || 'Customer';
      t.ref = (p.project_ref as string | null) ?? null;
    }
  }
  const threads = [...by.values()].filter((t) => t.name);
  return json({ threads, unread: threads.reduce((n, t) => n + (t.unread ? 1 : 0), 0) });
}
