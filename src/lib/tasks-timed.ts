import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { londonIso } from '@/app/admin/crm/crm-shared';
import { siteUrl } from '@/lib/crm/server';
import { notify } from '@/lib/notify';
import { CalendarNotFound, createCalendarEvent, deleteCalendarEvent, mailbox as msMailbox, msConfigured, updateCalendarEvent, type CalWrite } from '@/lib/ms365';
import { remindMinutes } from '@/lib/tasks';
import { defaultOwnerId } from '@/lib/crm/default-owner';

/**
 * Tasks with a time: reminders 30 and 15 minutes before (a push to the person), and a copy in their Outlook calendar, so it pops up on
 * their phone and desktop like any appointment. Run every minute from the cron; the task routes also sync the one that changed.
 * Needs supabase/task-times.sql. Never throws.
 */
const MIN = 60_000;
export const EVENT_MINUTES = 15;

type Row = {
  id: string;
  title: string;
  notes: string | null;
  due_date: string;
  due_time: string;
  remind: string | null;
  assignee_id: string | null;
  created_by: string | null;
  crm_project_id: string | null;
  remind30_sent_at: string | null;
  remind15_sent_at: string | null;
};

/** When the task falls due: its day and time in the UK. */
export const dueAt = (t: { due_date: string; due_time: string }) => new Date(londonIso(t.due_date, t.due_time.slice(0, 5)));

/**
 * Which reminders are owed now: each wanted offset whose moment has come, while the task hasn't started, and not already sent. Pure.
 * One message covers them all (a task made 10 minutes ahead gets one "in 10 minutes", not two).
 */
export function remindersOwed(t: Pick<Row, 'due_date' | 'due_time' | 'remind' | 'remind30_sent_at' | 'remind15_sent_at'>, now: Date): { offsets: number[]; minutesLeft: number } | null {
  const due = dueAt(t).getTime();
  const left = Math.ceil((due - now.getTime()) / MIN);
  if (left <= 0) return null;
  const sent: Record<number, boolean> = { 30: !!t.remind30_sent_at, 15: !!t.remind15_sent_at };
  const offsets = remindMinutes(t.remind).filter((m) => left <= m && !sent[m]);
  return offsets.length ? { offsets, minutesLeft: left } : null;
}

export const minutesWords = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} hour${n >= 120 ? 's' : ''}${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`);

/** Push the reminders that are due. Returns how many tasks were reminded. */
export async function remindTimedTasks(now = new Date()): Promise<number> {
  try {
    const db = createAdminClient();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const tomorrow = new Date(now.getTime() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const { data, error } = await db
      .from('tasks')
      .select('id, title, notes, due_date, due_time, remind, assignee_id, created_by, crm_project_id, remind30_sent_at, remind15_sent_at')
      .neq('status', 'done')
      .not('due_time', 'is', null)
      .in('due_date', [today, tomorrow])
      .neq('remind', 'none')
      .limit(300);
    if (error || !data?.length) return 0;
    let n = 0;
    for (const t of data as Row[]) {
      const owed = remindersOwed(t, now);
      if (!owed) continue;
      // Claim first (only a row not yet marked), so two overlapping runs can't both send.
      const stamp = now.toISOString();
      const patch: Record<string, string> = {};
      for (const m of owed.offsets) patch[m === 30 ? 'remind30_sent_at' : 'remind15_sent_at'] = stamp;
      let claim = db.from('tasks').update(patch).eq('id', t.id);
      for (const m of owed.offsets) claim = claim.is(m === 30 ? 'remind30_sent_at' : 'remind15_sent_at', null);
      const { data: won } = await claim.select('id');
      if (!won?.length) continue;
      const to = await personFor(db, t);
      if (!to) continue;
      const when = dueAt(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
      await notify({
        userId: to,
        kind: 'task_due',
        title: `In ${minutesWords(owed.minutesLeft)}: ${t.title}`,
        body: `Due at ${when}${t.notes ? ` · ${t.notes.slice(0, 80)}` : ''}`,
        href: t.crm_project_id ? `/admin/crm/${t.crm_project_id}` : '/admin/tasks',
        tag: `task-${t.id}`,
      });
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}

type Db = ReturnType<typeof createAdminClient>;
/** The assignee, or else whoever made it, if they're approved. */
async function personFor(db: Db, t: Pick<Row, 'assignee_id' | 'created_by'>): Promise<string | null> {
  // Nobody's task (no assignee, no maker): it goes to whoever's diary it is, so a reminder is never lost.
  const fallback = !t.assignee_id && !t.created_by ? await defaultOwnerId(db) : null;
  for (const id of [t.assignee_id, t.created_by, fallback]) {
    if (!id) continue;
    const { data } = await db.from('profiles').select('id').eq('id', id).eq('status', 'approved').maybeSingle();
    if (data) return id;
  }
  return null;
}

/* ── Outlook ─────────────────────────────────────────────────────────────────── */

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);

/** Whose calendar: the assignee's (or the maker's) own mailbox when it's in the company's domain, else none. */
async function mailboxFor(db: Db, t: Pick<Row, 'assignee_id' | 'created_by'>): Promise<string | null> {
  const domain = msMailbox().split('@')[1]?.toLowerCase();
  if (!domain) return null;
  const fallback = !t.assignee_id && !t.created_by ? await defaultOwnerId(db) : null;
  for (const id of [t.assignee_id, t.created_by, fallback]) {
    if (!id) continue;
    const { data } = await db.from('profiles').select('email').eq('id', id).eq('status', 'approved').maybeSingle();
    const email = String(data?.email ?? '').trim().toLowerCase();
    if (email.endsWith(`@${domain}`)) return email;
  }
  return null;
}

type Full = Row & { status: string; outlook_event_id: string | null; outlook_mailbox: string | null; outlook_hash: string | null };

async function contactLines(db: Db, projectId: string | null): Promise<string[]> {
  if (!projectId) return [];
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', projectId).maybeSingle();
  const { data: e } = p ? await db.from('enquiries').select('name, phone, email').eq('id', p.enquiry_id as string).maybeSingle() : { data: null };
  return [e?.name ? `Customer: ${e.name}` : '', e?.phone ? `Phone: ${e.phone}` : '', e?.email ? `Email: ${e.email}` : '', `In the CRM: ${siteUrl()}/admin/crm/${projectId}`].filter(Boolean);
}

/** Make the Outlook copy of one task match: made, moved or removed. Returns true if it's in step. */
export async function syncTaskCalendar(taskId: string, now = new Date()): Promise<boolean> {
  if (!msConfigured()) return false;
  try {
    const db = createAdminClient();
    const { data } = await db.from('tasks').select('id, title, notes, due_date, due_time, remind, assignee_id, created_by, crm_project_id, status, outlook_event_id, outlook_mailbox, outlook_hash, remind30_sent_at, remind15_sent_at').eq('id', taskId).maybeSingle();
    if (!data) return false;
    const t = data as unknown as Full;
    const save = (p: Record<string, unknown>) => db.from('tasks').update(p).eq('id', taskId);
    const gone = () => save({ outlook_event_id: null, outlook_mailbox: null, outlook_hash: null });
    const future = t.due_time && t.due_date ? dueAt({ due_date: t.due_date, due_time: t.due_time }).getTime() > now.getTime() - 6 * 60 * MIN : false;

    // No longer wanted (done, no time, or long past): remove ours.
    if (t.status === 'done' || !t.due_time || !t.due_date || !future) {
      if (t.outlook_event_id && t.outlook_mailbox && t.status === 'done') await deleteCalendarEvent(t.outlook_mailbox, t.outlook_event_id).catch(() => null);
      else if (t.outlook_event_id && t.outlook_mailbox && (!t.due_time || !t.due_date)) await deleteCalendarEvent(t.outlook_mailbox, t.outlook_event_id).catch(() => null);
      if (t.outlook_event_id) await gone();
      return true;
    }

    const mailbox = await mailboxFor(db, t);
    if (!mailbox) return false;
    const start = dueAt({ due_date: t.due_date, due_time: t.due_time });
    const want: CalWrite = {
      subject: `Task: ${t.title}`,
      start,
      end: new Date(start.getTime() + EVENT_MINUTES * MIN),
      body: [t.notes || '', ...(await contactLines(db, t.crm_project_id))].filter(Boolean).join('\n'),
      categories: ['Heliaxis task'],
      // Free, so a task never blocks a survey slot.
      showAs: 'free',
      reminderMinutes: 15,
    };
    const h = hash({ mailbox, subject: want.subject, start: start.getTime(), body: want.body });
    if (t.outlook_event_id && t.outlook_hash === h && t.outlook_mailbox === mailbox) return true;

    // Moved to another person's calendar: the old copy goes.
    if (t.outlook_event_id && t.outlook_mailbox && t.outlook_mailbox !== mailbox) {
      await deleteCalendarEvent(t.outlook_mailbox, t.outlook_event_id).catch(() => null);
      t.outlook_event_id = null;
    }
    let id = t.outlook_event_id;
    if (id) {
      try {
        await updateCalendarEvent(mailbox, id, want);
      } catch (e) {
        if (!(e instanceof CalendarNotFound)) throw e;
        id = null; // deleted in Outlook: make it again
      }
    }
    id ??= (await createCalendarEvent(mailbox, { ...want, transactionId: `hx-t-${t.id.replace(/-/g, '').slice(0, 20)}-${h.slice(0, 8)}` })).id;
    await save({ outlook_event_id: id, outlook_mailbox: mailbox, outlook_hash: h });
    return true;
  } catch {
    return false;
  }
}

/** The safety net, every minute: any task whose Outlook copy is out of step (a few at a time). */
export async function syncTimedTasks(now = new Date()): Promise<number> {
  if (!msConfigured()) return 0;
  try {
    const db = createAdminClient();
    const since = new Date(now.getTime() - 6 * 60 * MIN).toISOString().slice(0, 10);
    const [{ data: open }, { data: stale }] = await Promise.all([
      db.from('tasks').select('id, outlook_hash').neq('status', 'done').not('due_time', 'is', null).gte('due_date', since).limit(200),
      // Done, or lost their time, but still have a copy.
      db.from('tasks').select('id').not('outlook_event_id', 'is', null).or('status.eq.done,due_time.is.null').limit(20),
    ]);
    const ids = [...(open ?? []).filter((t) => !t.outlook_hash).map((t) => t.id as string), ...(stale ?? []).map((t) => t.id as string)].slice(0, 10);
    let n = 0;
    for (const id of ids) if (await syncTaskCalendar(id, now)) n++;
    return n;
  } catch {
    return 0;
  }
}

/** Remove a task's Outlook copy before the task is deleted. */
export async function removeTaskCalendar(taskId: string): Promise<void> {
  if (!msConfigured()) return;
  try {
    const { data } = await createAdminClient().from('tasks').select('outlook_event_id, outlook_mailbox').eq('id', taskId).maybeSingle();
    if (data?.outlook_event_id && data.outlook_mailbox) await deleteCalendarEvent(data.outlook_mailbox as string, data.outlook_event_id as string).catch(() => null);
  } catch {
    // The task still goes.
  }
}
