-- Native Android notifications (Firebase Cloud Messaging) for the Heliaxis app.
-- The app passes its FCM token to the site when it opens; src/lib/notify.ts sends to it.
-- Server-only (service role); no RLS policies. Safe to run twice.
create table if not exists public.native_push_tokens (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  token                 text not null unique,
  platform              text not null default 'android',
  app_version           int,
  notifications_enabled boolean not null default true,
  created_at            timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  last_used_at          timestamptz
);
create index if not exists native_push_tokens_user_idx on public.native_push_tokens (user_id);

alter table public.native_push_tokens enable row level security;
