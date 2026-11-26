import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { runLookup } from './lookup-tools';
import { todayISO } from '@/lib/tasks';

/**
 * The morning briefing, pushed at 07:30 (UK, weekdays) to each active admin once a day: today's diary, what is overdue and
 * what is waiting on them, worked out from the same data as Metis's briefing tool (no AI cost). Tapping it opens Metis,
 * ready to ask for the full spoken briefing. Called from the every-minute cron; does nothing at any other time.
 */
export async function sendMorningBriefings(now = new Date()): Promise<number> {
  const uk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const day = uk.getDay();
  const minutes = uk.getHours() * 60 + uk.getMinutes();
  if (day === 0 || day === 6 || minutes < 7 * 60 + 30 || minutes > 9 * 60) return 0;
  const db = createAdminClient();
  const { data: people } = await db.from('profiles').select('id, full_name, email').eq('role', 'admin').eq('status', 'active');
  const midnight = new Date(`${todayISO()}T00:00:00Z`).toISOString();
  let sent = 0;
  for (const p of people ?? []) {
    const { count } = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', p.id).eq('kind', 'metis_briefing').gte('created_at', midnight);
    if (count) continue;
    const name = String(p.full_name || p.email || '').split(/[\s@]/)[0];
    const b = JSON.parse(await runLookup('briefing', {}, { id: p.id as string, name })) as {
      today: string;
      diary: { title?: string; kind: string; starts_at?: string | null }[];
      overdue: { overdue_tasks: unknown[]; overdue_follow_ups: unknown[] };
      emails_needing_reply: { priority?: string }[];
      unread_whatsapp: unknown[];
    };
    const todays = b.diary.filter((e) => e.starts_at && new Date(e.starts_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === b.today);
    const first = todays[0];
    const at = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    const parts = [
      todays.length ? `${todays.length} in the diary today${first?.starts_at ? `, first ${first.title || first.kind} at ${at(first.starts_at)}` : ''}` : 'Nothing in the diary today',
      b.overdue.overdue_follow_ups.length + b.overdue.overdue_tasks.length ? `${b.overdue.overdue_follow_ups.length + b.overdue.overdue_tasks.length} overdue` : '',
      b.emails_needing_reply.length ? `${b.emails_needing_reply.length} email${b.emails_needing_reply.length === 1 ? '' : 's'} waiting` : '',
      b.unread_whatsapp.length ? `${b.unread_whatsapp.length} unread WhatsApp${b.unread_whatsapp.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    await notify({ userId: p.id as string, kind: 'metis_briefing', title: `Morning${name ? ` ${name}` : ''}: your briefing`, body: `${parts.join(' · ')}. Tap for Metis to talk you through it.`, href: '/admin/assistant/chat?q=Give%20me%20my%20briefing' });
    sent++;
  }
  return sent;
}
