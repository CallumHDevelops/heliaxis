-- 19. Tasks: a shared to-do list (/admin/tasks). Create a task, assign it to someone
--     with an account (or just a name, for people outside the system), give it a deadline.
--     Only the server (service role) reads/writes it — access is the 'tasks' portal.
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  notes         text,
  assignee_id   uuid references public.profiles(id) on delete set null,
  assignee_name text,               -- free-text assignee when they have no account
  due_date      date,
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status        text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists tasks_open_idx on public.tasks (status, due_date);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

alter table public.tasks enable row level security;
