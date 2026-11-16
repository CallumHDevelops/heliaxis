import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { cleanTaskInput, TASK_COLUMNS } from '@/lib/tasks';
import { after } from 'next/server';
import { rearmDueReminder } from '@/lib/tasks-server';
import { syncTaskCalendar } from '@/lib/tasks-timed';

export const dynamic = 'force-dynamic';

/** Tick off (or reopen / edit) a task that belongs to an opportunity. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const input = cleanTaskInput((await req.json().catch(() => ({}))) ?? {});
  const db = createAdminClient();
  const { data: before } = await db.from('tasks').select('id, title, status, crm_project_id, due_date, due_time, remind').eq('id', id).maybeSingle();
  if (!before?.crm_project_id) return json({ error: 'Not found' }, 404);
  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
  if (input.status) patch.completed_at = input.status === 'done' ? new Date().toISOString() : null;
  const { data: task, error } = await db.from('tasks').update(patch).eq('id', id).select(TASK_COLUMNS).single();
  if (error) return json({ error: error.message }, 500);
  const bt = before as { due_date: string | null; due_time?: string | null; remind?: string | null };
  if (('due_date' in input && bt.due_date !== task.due_date) || ('due_time' in input && (bt.due_time ?? null) !== (task.due_time ?? null)) || ('remind' in input && bt.remind !== task.remind)) await rearmDueReminder(id);
  after(() => syncTaskCalendar(id));
  if (input.status === 'done' && before.status !== 'done') {
    const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', before.crm_project_id).maybeSingle();
    if (p) await logActivity({ enquiryId: p.enquiry_id, projectId: before.crm_project_id, kind: 'system', body: `✓ Task done: ${before.title}`, byId: s.user.id });
  }
  return json({ task });
}
