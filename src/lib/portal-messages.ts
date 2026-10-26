import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type PortalMessage = { id: string; direction: 'in' | 'out'; body: string; created_at: string; by: string | null; read: boolean };

export const MAX_MESSAGE = 2000;
/** A customer can send this many in an hour (stops a runaway page or a bad actor filling the record). */
export const HOURLY_LIMIT = 20;

/** The conversation on a job, oldest first. `by` is the team member's first name on a message from us. */
export async function listPortalMessages(projectId: string): Promise<PortalMessage[]> {
  const db = createAdminClient();
  const { data, error } = await db.from('portal_messages').select('id, direction, body, sent_by, read_at, created_at').eq('project_id', projectId).order('created_at', { ascending: true }).limit(300);
  if (error || !data) return [];
  const ids = [...new Set(data.map((m) => m.sent_by as string | null).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await db.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const first = new Map((people ?? []).map((p) => [p.id as string, String(p.full_name || '').split(/\s+/)[0] || null]));
  return data.map((m) => ({ id: m.id as string, direction: m.direction as 'in' | 'out', body: m.body as string, created_at: m.created_at as string, by: m.sent_by ? (first.get(m.sent_by as string) ?? null) : null, read: !!m.read_at }));
}

export async function recentFromCustomer(projectId: string): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await createAdminClient().from('portal_messages').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('direction', 'in').gte('created_at', since);
  return count ?? 0;
}
