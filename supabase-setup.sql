-- ============================================================
-- Heliaxis Post Studio — Supabase setup
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- ============================================================

-- Shared post history. Every signed-in user (you + your agency) sees the
-- same history, so nobody generates a duplicate. If you later want to scope
-- history per organisation, add an org_id column and adjust the policies.

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  tpl         text not null,
  size        text not null,
  theme       text not null,
  hatch       boolean not null default true,
  data        jsonb not null,
  headline    text,
  source      text not null default 'manual'  -- 'manual' | 'ai'
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

-- Any authenticated user can read the shared history…
create policy "authenticated can read posts"
  on public.posts for select
  to authenticated
  using (true);

-- …insert new posts (created_by defaults to their id)…
create policy "authenticated can insert posts"
  on public.posts for insert
  to authenticated
  with check (true);

-- …and delete (used by "Clear all"). Tighten to (created_by = auth.uid())
-- if you'd rather each user only clear their own.
create policy "authenticated can delete posts"
  on public.posts for delete
  to authenticated
  using (true);

-- ============================================================
-- Auth note: in Dashboard → Authentication → Providers, keep Email enabled.
-- For an invite-only agency tool, turn OFF "Allow new users to sign up"
-- once you've created the accounts you need, and invite users instead
-- (Authentication → Users → Invite). That stops the public /register route
-- creating accounts.
-- ============================================================
