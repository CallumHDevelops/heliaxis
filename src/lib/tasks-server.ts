import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukDay } from '@/lib/bank-holidays';
import { getCrmSettings } from '@/lib/crm/crm-settings';
import { notify } from '@/lib/notify';
import { getSettings } from '@/lib/whatsapp/settings';
import { isQuiet, londonHour } from '@/lib/whatsapp/schedule';

/** Task reminders (server only). The task list itself is in tasks.ts. */

/** A new due date gets a new morning reminder. due_reminded_on comes with crm-v3.sql; until then this does nothing. */
export async function rearmDueReminder(taskId: string) {
  try {
    await createAdminClient().from('tasks').update({ due_reminded_on: null }).eq('id', taskId);
  } catch {
    // Never stops the task being saved.
  }
}

type DueTask = {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  assignee_id: string | null;
  created_by: string | null;
  crm_project_id: string | null;
};

const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const PRIORITY: Record<string, number> = { high: 0, normal: 1, low: 2 };

/**
 * The morning round-up: one push per person ("Tasks: 2 due today, 1 overdue") for open tasks due
 * today or before, sent once the CRM reminder hour has passed and outside quiet hours (UK time),
 * and not again that day. A task is reminded once per day until it's done; changing its due date
 * re-arms it. Tasks on jobs that are on hold are skipped. The person is the assignee, or else
 * whoever made the task (approved accounts only). Runs with the every-minute cron; returns how many
 * people were told. Never throws.
 */
export async function remindDueTasks(now = new Date()): Promise<number> {
  try {
    const [crm, wa] = await Promise.all([getCrmSettings(), getSettings()]);
    if (londonHour(now) < crm.reminderHour || isQuiet(now, wa.quietFrom, wa.quietTo)) return 0;
    const today = ukDay(now);
    const notToday = `due_reminded_on.is.null,due_reminded_on.lt.${today}`;
    const db = createAdminClient();
    const { data, error } = await db
      .from('tasks')
      .select('id, title, due_date, priority, assignee_id, created_by, crm_project_id')
      .neq('status', 'done')
      .lte('due_date', today)
      .or(notToday)
      .order('due_date', { ascending: true })
      .limit(500);
    // An error here is usually crm-v3.sql not run yet: with nowhere to note the reminder, send nothing.
    if (error || !data?.length) return 0;
    const tasks = data as DueTask[];

    // Jobs on hold (crm-v3.sql column; if it can't be read, nothing counts as on hold).
    const onHold = new Set<string>();
    const jobIds = [...new Set(tasks.map((t) => t.crm_project_id).filter((x): x is string => !!x))];
    for (const batch of chunks(jobIds)) {
      const { data: held } = await db.from('crm_projects').select('id').in('id', batch).eq('on_hold', true);
      for (const p of held ?? []) onHold.add(p.id as string);
    }

    // The assignee, or else whoever made it; approved accounts only. One round-up each per UK day.
    const ids = [...new Set(tasks.flatMap((t) => [t.assignee_id, t.created_by]).filter((x): x is string => !!x))];
    const approved = new Set<string>();
    for (const batch of chunks(ids)) {
      const { data: people } = await db.from('profiles').select('id').eq('status', 'approved').in('id', batch);
      for (const p of people ?? []) approved.add(p.id as string);
    }
    const who = (t: DueTask) => [t.assignee_id, t.created_by].find((x): x is string => !!x && approved.has(x)) ?? null;
    const hadToday = new Set<string>();
    const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
    for (const batch of chunks([...approved])) {
      const { data: sent } = await db.from('notifications').select('user_id, created_at').eq('kind', 'task_due').in('user_id', batch).gte('created_at', since);
      for (const n of sent ?? []) if (ukDay(n.created_at as string) === today) hadToday.add(n.user_id as string);
    }

    // Note today's reminder on every task first (only rows not already noted), so two overlapping
    // runs can't both send. Tasks skipped below (on hold, nobody to tell) wait until tomorrow.
    const claimed = new Set<string>();
    for (const batch of chunks(tasks.map((t) => t.id))) {
      const { data: rows } = await db.from('tasks').update({ due_reminded_on: today }).in('id', batch).or(notToday).select('id');
      for (const r of rows ?? []) claimed.add(r.id as string);
    }

    const byPerson = new Map<string, DueTask[]>();
    for (const t of tasks) {
      const to = who(t);
      if (!claimed.has(t.id) || !to || hadToday.has(to)) continue;
      if (t.crm_project_id && onHold.has(t.crm_project_id)) continue;
      byPerson.set(to, [...(byPerson.get(to) ?? []), t]);
    }

    for (const [userId, list] of byPerson) {
      list.sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || a.due_date.localeCompare(b.due_date));
      const dueToday = list.filter((t) => t.due_date === today).length;
      const overdue = list.length - dueToday;
      const jobs = new Set(list.map((t) => t.crm_project_id));
      const [onlyJob] = [...jobs];
      await notify({
        userId,
        kind: 'task_due',
        title: `Tasks: ${[dueToday ? `${dueToday} due today` : '', overdue ? `${overdue} overdue` : ''].filter(Boolean).join(', ')}`,
        body: list
          .slice(0, 3)
          .map((t) => t.title)
          .join(' · ') + (list.length > 3 ? ` · and ${list.length - 3} more` : ''),
        // All from one job: open that job (it shows its tasks). Otherwise the task list.
        href: jobs.size === 1 && onlyJob ? `/admin/crm/${onlyJob}` : '/admin/tasks',
        tag: `tasks-${today}`,
      });
    }
    return byPerson.size;
  } catch {
    return 0;
  }
}
