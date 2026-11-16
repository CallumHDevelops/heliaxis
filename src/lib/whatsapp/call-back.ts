import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { callBackWhen, dueDay, taskTitle, type CallBackWhen } from './call-back-shared';

type Db = ReturnType<typeof createAdminClient>;

/**
 * A customer answers "Call me today" / "Call me tomorrow" (the buttons on our welcome message, or typed): put a call task on their job
 * for that day, assigned to whoever owns it, and tell them. Once per message (the task's source_key), so a retried webhook adds nothing.
 * `tellTeam` is used when the job has no owner. Never throws; returns what it did, for the log.
 */
export async function callBackTask(
  db: Db,
  x: { enquiry: { id: string; name: string | null }; body: string; messageId: string; at: string },
  tellTeam: (title: string, body: string, href: string) => Promise<unknown>
): Promise<{ created: boolean; when?: CallBackWhen }> {
  const when = callBackWhen(x.body);
  if (!when) return { created: false };
  try {
    // Their job: the newest one still open (a lost or finished one isn't where a call back belongs), else the newest.
    const { data: jobs } = await db.from('crm_projects').select('id, title, stage, owner_id, created_at').eq('enquiry_id', x.enquiry.id).order('created_at', { ascending: false }).limit(20);
    const job = (jobs ?? []).find((j) => j.stage !== 'complete' && j.stage !== 'lost') ?? (jobs ?? [])[0] ?? null;
    const due = dueDay(when, new Date(x.at));
    const title = taskTitle(x.enquiry.name, when);
    const { data: task, error } = await db
      .from('tasks')
      .insert({
        title,
        notes: `They answered “${x.body.trim().slice(0, 60)}” on WhatsApp.`,
        assignee_id: (job?.owner_id as string | null) ?? null,
        due_date: due,
        // "Tomorrow": first thing, so it reminds and lands in their calendar. "Today" stays all day (there's no knowing when).
        due_time: when === 'tomorrow' ? '09:00' : null,
        priority: 'high',
        status: 'todo',
        crm_project_id: job?.id ?? null,
        source_key: job ? `callback:${x.messageId}` : null,
      })
      .select('id')
      .single();
    // The same message again (a retried webhook): the unique source_key refuses it, and nothing more is done.
    if (error || !task) return { created: false, when };
    const href = job ? `/admin/crm/${job.id}` : `/admin/enquiries/inbox/${x.enquiry.id}`;
    if (job) await logActivity({ enquiryId: x.enquiry.id, projectId: job.id as string, kind: 'system', body: `They asked for a call ${when}: task added (${title})` }).catch(() => null);
    const heading = `Call ${when}: ${x.enquiry.name || 'a customer'}`;
    const text = `They asked for a call ${when}. A task is on their job for ${when === 'today' ? 'today' : 'tomorrow'}.`;
    if (job?.owner_id) await notify({ userId: job.owner_id as string, kind: 'task_assigned', title: heading, body: text, href });
    else await tellTeam(heading, text, href);
    return { created: true, when };
  } catch {
    return { created: false, when };
  }
}
