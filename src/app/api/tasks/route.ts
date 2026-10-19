import { after, NextRequest, NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanTaskInput, TASK_COLUMNS, type Task, type TaskJob } from '@/lib/tasks';
import { notify } from '@/lib/notify';
import { rearmDueReminder } from '@/lib/tasks-server';
import { canAccess } from '@/lib/portals';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function dueText(due: string | null) {
  if (!due) return null;
  const d = new Date(`${due}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `Due ${d}`;
}

/** Tell people about a task change: new assignee, or the person who set it that it's done. */
async function notifyTaskChange(before: Task | null, task: Task, actor: { id: string; name: string }) {
  const href = `/admin/tasks?task=${task.id}`;
  const sends: Promise<void>[] = [];
  if (task.assignee_id && task.assignee_id !== actor.id && task.assignee_id !== before?.assignee_id) {
    sends.push(notify({
      userId: task.assignee_id,
      kind: 'task_assigned',
      title: `New task from ${actor.name}`,
      body: [task.title, dueText(task.due_date)].filter(Boolean).join(' · '),
      href,
    }));
  }
  if (before && before.status !== 'done' && task.status === 'done' && task.created_by && task.created_by !== actor.id) {
    sends.push(notify({
      userId: task.created_by,
      kind: 'task_done',
      title: `${actor.name} completed a task`,
      body: task.title,
      href,
    }));
  }
  await Promise.all(sends);
}

function actorOf(session: { user: { id: string; email?: string | null }; profile: { full_name: string | null; email: string | null } }) {
  return { id: session.user.id, name: session.profile.full_name || session.profile.email || 'Someone' };
}

const fail = (error: string, status = 500) => NextResponse.json({ error }, { status, headers: NO_STORE });

/** The jobs these tasks belong to: { [projectId]: { ref, name } }. Batched; empty if anything fails. */
async function jobsFor(tasks: { crm_project_id?: string | null }[]): Promise<Record<string, TaskJob>> {
  const ids = [...new Set(tasks.map((t) => t.crm_project_id).filter((x): x is string => !!x))];
  const out: Record<string, TaskJob> = {};
  if (!ids.length) return out;
  try {
    const db = createAdminClient();
    const rows: { id: string; enquiry_id: string; title: string | null; project_ref?: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      // project_ref arrives with crm-v3.sql: read without it if it isn't there yet.
      let r = await db.from('crm_projects').select('id, enquiry_id, title, project_ref').in('id', batch);
      if (r.error) r = (await db.from('crm_projects').select('id, enquiry_id, title').in('id', batch)) as typeof r;
      rows.push(...((r.data ?? []) as typeof rows));
    }
    const enquiryIds = [...new Set(rows.map((p) => p.enquiry_id))];
    const names = new Map<string, string>();
    for (let i = 0; i < enquiryIds.length; i += 100) {
      const { data } = await db.from('enquiries').select('id, name').in('id', enquiryIds.slice(i, i + 100));
      for (const e of data ?? []) names.set(e.id as string, (e.name as string) || '');
    }
    for (const p of rows) out[p.id] = { ref: p.project_ref ?? null, name: names.get(p.enquiry_id) || p.title || 'Customer' };
  } catch {
    // The chip is a nicety: the list still loads.
  }
  return out;
}

export async function GET() {
  const session = await requirePortal('tasks');
  if (!session) return unauthorized();
  const { data, error } = await createAdminClient()
    .from('tasks')
    .select(TASK_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) return fail(error.message);
  // Customer names are CRM data: only people who can open the CRM get the job chips.
  const jobs = canAccess(session.profile, 'crm') ? await jobsFor(data ?? []) : {};
  return NextResponse.json({ tasks: data ?? [], jobs }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const session = await requirePortal('tasks');
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const input = cleanTaskInput(body ?? {});
  if (!input.title) return fail('A task needs a title', 400);

  // Offline-created tasks bring their own id, so a retried create can't duplicate.
  const id = typeof body?.id === 'string' && UUID.test(body.id) ? body.id : undefined;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tasks')
    .insert({ ...input, ...(id ? { id } : {}), created_by: session.user.id })
    .select(TASK_COLUMNS)
    .single();
  if (error?.code === '23505' && id) {
    const existing = await admin.from('tasks').select(TASK_COLUMNS).eq('id', id).single();
    if (existing.data) return NextResponse.json({ task: existing.data }, { headers: NO_STORE });
  }
  if (error) return fail(error.message);
  after(() => notifyTaskChange(null, data as Task, actorOf(session)));
  return NextResponse.json({ task: data }, { headers: NO_STORE });
}

export async function PATCH(req: NextRequest) {
  const session = await requirePortal('tasks');
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const id = String(body?.id || '').trim();
  if (!id) return fail('id required', 400);
  const input = cleanTaskInput(body ?? {});
  if ('title' in input && !input.title) return fail('A task needs a title', 400);

  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
  if (input.status) patch.completed_at = input.status === 'done' ? new Date().toISOString() : null;

  const admin = createAdminClient();
  const { data: before } = await admin.from('tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle();
  const { data, error } = await admin
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail('That task no longer exists', 404);
  if ('due_date' in input && before && before.due_date !== data.due_date) await rearmDueReminder(id);
  after(() => notifyTaskChange(before as Task | null, data as Task, actorOf(session)));
  return NextResponse.json({ task: data }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  if (!(await requirePortal('tasks'))) return unauthorized();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return fail('id required', 400);
  const { error } = await createAdminClient().from('tasks').delete().eq('id', id);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
