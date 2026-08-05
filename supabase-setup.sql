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

-- …update posts (needed for auto-save, which upserts a post by its id)…
create policy "authenticated can update posts"
  on public.posts for update
  to authenticated
  using (true)
  with check (true);

-- …and delete (used by "Clear all"). Tighten to (created_by = auth.uid())
-- if you'd rather each user only clear their own.
create policy "authenticated can delete posts"
  on public.posts for delete
  to authenticated
  using (true);

-- ============================================================
-- Saved badge library — custom accreditation badges (icon + label) that
-- your team saves and reuses (e.g. SSIP, NAPIT). Shared across all users.
-- ============================================================
create table if not exists public.badge_library (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  icon        text not null,
  label       text not null default ''
);

alter table public.badge_library enable row level security;

create policy "authenticated can read badge_library"
  on public.badge_library for select to authenticated using (true);

create policy "authenticated can insert badge_library"
  on public.badge_library for insert to authenticated with check (true);

create policy "authenticated can update badge_library"
  on public.badge_library for update to authenticated using (true) with check (true);

create policy "authenticated can delete badge_library"
  on public.badge_library for delete to authenticated using (true);

-- ============================================================
-- Saved post ideas — "save for later" from the Get Ideas generator.
-- Shared across all users.
-- ============================================================
create table if not exists public.saved_ideas (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  title       text not null,
  brief       text not null default ''
);

alter table public.saved_ideas enable row level security;

create policy "authenticated can read saved_ideas"
  on public.saved_ideas for select to authenticated using (true);

create policy "authenticated can insert saved_ideas"
  on public.saved_ideas for insert to authenticated with check (true);

create policy "authenticated can delete saved_ideas"
  on public.saved_ideas for delete to authenticated using (true);

-- ============================================================
-- Brand logo library — installer/partner logos (stored as data URLs) shown
-- bottom-right under "Trusted installers of". Shared across all users.
-- ============================================================
create table if not exists public.brand_logos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  name        text not null default '',
  data_url    text not null
);

alter table public.brand_logos enable row level security;

create policy "authenticated can read brand_logos"
  on public.brand_logos for select to authenticated using (true);

create policy "authenticated can insert brand_logos"
  on public.brand_logos for insert to authenticated with check (true);

create policy "authenticated can delete brand_logos"
  on public.brand_logos for delete to authenticated using (true);

-- ============================================================
-- Image library — background photos/images (stored as data URLs), shared,
-- for the "Select photo / image" picker.
-- ============================================================
create table if not exists public.image_library (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  name        text not null default '',
  description text not null default '',
  data_url    text not null
);
-- if the table already existed without it:
alter table public.image_library add column if not exists description text not null default '';

alter table public.image_library enable row level security;

create policy "authenticated can read image_library"
  on public.image_library for select to authenticated using (true);

create policy "authenticated can insert image_library"
  on public.image_library for insert to authenticated with check (true);

create policy "authenticated can update image_library"
  on public.image_library for update to authenticated using (true) with check (true);

create policy "authenticated can delete image_library"
  on public.image_library for delete to authenticated using (true);

-- ============================================================
-- Auth note: in Dashboard → Authentication → Providers, keep Email enabled.
-- For an invite-only agency tool, turn OFF "Allow new users to sign up"
-- once you've created the accounts you need, and invite users instead
-- (Authentication → Users → Invite). That stops the public /register route
-- creating accounts.
-- ============================================================
