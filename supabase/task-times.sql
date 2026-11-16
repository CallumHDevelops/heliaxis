-- Task times, reminders and the Outlook copy. Safe to run more than once.
alter table public.tasks add column if not exists due_time time;                 -- UK time of day; null = no time (all day)
alter table public.tasks add column if not exists remind text not null default 'both';  -- both | 30 | 15 | none
alter table public.tasks add column if not exists remind30_sent_at timestamptz;
alter table public.tasks add column if not exists remind15_sent_at timestamptz;
alter table public.tasks add column if not exists outlook_event_id text;
alter table public.tasks add column if not exists outlook_mailbox text;
alter table public.tasks add column if not exists outlook_hash text;
create index if not exists tasks_timed_idx on public.tasks (due_date, due_time) where due_time is not null and status <> 'done';
