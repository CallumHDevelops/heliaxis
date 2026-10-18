import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { cleanTaskInput, TASK_COLUMNS } from '@/lib/tasks';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';

export const dynamic = 'force-dynamic';

/**
 * Add a task to an opportunity. It's a normal task (shows on the Tasks page and in My day), linked
 * to the opportunity; anyone with the CRM can add one, even without the Tasks portal.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const input = cleanTaskInput((await req.json().catch(() => ({}))) ?? {});
  if (!input.title) return json({ error: 'Give the task a title.' }, 400);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('enquiry_id, title').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const { data: task, error } = await db
    .from('tasks')
    .insert({ ...input, status: 'todo', crm_project_id: id, created_by: s.user.id })
    .select(TASK_COLUMNS)
    .single();
  if (error || !task) return json({ error: error?.message || 'Not saved' }, 500);

  const who = s.profile.full_name || s.profile.email || 'Someone';
  await Promise.all([
    logActivity({ enquiryId: p.enquiry_id, projectId: id, kind: 'system', body: `Task added: ${task.title}`, byId: s.user.id }),
    db.from('crm_projects').update({ updated_at: new Date().toISOString() }).eq('id', id),
  ]);
  if (task.assignee_id && task.assignee_id !== s.user.id) {
    // Send them to the opportunity if they can open the CRM, otherwise to their Tasks page.
    const { data: who2 } = await db.from('profiles').select('*').eq('id', task.assignee_id).maybeSingle();
    const href = who2 && canAccess(who2, 'crm') ? `/admin/crm/${id}` : `/admin/tasks?task=${task.id}`;
    after(() =>
      notify({
        userId: task.assignee_id!,
        kind: 'task_assigned',
        title: `New task from ${who}`,
        body: `${task.title} · ${p.title}`,
        href,
      })
    );
  }
  return json({ task });
}
