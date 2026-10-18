import type { Metadata } from 'next';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { TASK_COLUMNS, type Assignee, type Task } from '@/lib/tasks';
import { FromClaude } from '@/components/admin/FromClaude';
import { visibleSetupTodos } from '@/lib/setup-checks';
import { TasksBoard } from './TasksBoard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tasks · Heliaxis',
  robots: { index: false, follow: false },
};

export default async function TasksPage() {
  const { user, profile } = await getSessionProfile();
  const isAdmin = profile?.role === 'admin';
  const admin = createAdminClient();
  const [tasksRes, peopleRes, setup] = await Promise.all([
    admin.from('tasks').select(TASK_COLUMNS).order('created_at', { ascending: false }),
    admin.from('profiles').select('id, full_name, email').eq('status', 'approved'),
    user ? visibleSetupTodos(user.id, isAdmin) : null,
  ]);

  const people: Assignee[] = ((peopleRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => ({ id: p.id, name: p.full_name || p.email || 'Unnamed' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AdminShell active="tasks" wide>
      <FromClaude
        todos={setup?.mine ?? []}
        admin={isAdmin && user ? { others: setup?.others ?? [], people, meId: user.id } : undefined}
      />
      <TasksBoard
        initialTasks={(tasksRes.data ?? []) as Task[]}
        people={people}
        meId={user?.id ?? null}
        setupNeeded={!!tasksRes.error}
      />
    </AdminShell>
  );
}
