-- 20. Notifications: the bell in the admin header, plus Web Push to phones/browsers.
--     Server-only (service role); no RLS policies.
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,            -- task_assigned | task_done | …
  title       text not null,
  body        text,
  href        text,                     -- where tapping it goes, e.g. /admin/tasks?task=<id>
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- One row per device/browser that turned on notifications.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;
