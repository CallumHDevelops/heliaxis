import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { appointmentIntent, INTENT_WORDS } from '@/lib/crm/appointment-reply';

/**
 * A customer with an appointment in the next three days replies "yes", "can we move it" or "I need to cancel": tell the person
 * whose diary it is, with the entry, so it is never missed. It only tells; the diary is changed by a person (or by Metis on
 * their say-so).
 */
type Notify = (title: string, body: string, href: string) => Promise<unknown>;

export async function appointmentReplyAlert(enquiryId: string, name: string, body: string, notify: Notify): Promise<boolean> {
  const intent = appointmentIntent(body);
  if (!intent) return false;
  const db = createAdminClient();
  const { data: projects } = await db.from('crm_projects').select('id').eq('enquiry_id', enquiryId);
  const ids = (projects ?? []).map((p) => p.id as string);
  if (!ids.length) return false;
  const now = Date.now();
  const { data: entries } = await db
    .from('diary_entries')
    .select('title, kind, starts_at, project_id')
    .in('project_id', ids)
    .is('deleted_at', null)
    .eq('all_day', false)
    .gte('starts_at', new Date(now - 2 * 3600_000).toISOString())
    .lte('starts_at', new Date(now + 3 * 86_400_000).toISOString())
    .order('starts_at')
    .limit(1);
  const e = entries?.[0];
  if (!e?.starts_at) return false;
  const when = new Date(e.starts_at as string).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const label = (e.title as string) || String(e.kind);
  const call = intent === 'confirm' ? 'Confirmed' : intent === 'cancel' ? 'Wants to cancel' : 'Wants to move';
  await notify(`${call}: ${name || 'customer'}`, `${label}, ${when}. “${body.slice(0, 100)}” (${INTENT_WORDS[intent]}). Ask Metis to change the diary and reply.`, '/admin/surveys');
  return true;
}
