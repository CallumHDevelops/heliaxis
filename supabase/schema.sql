-- Heliaxis admin auth schema
-- Run this in Supabase → SQL Editor (once) after creating your project.

-- 1. Profiles table: one row per registered user, holding role + approval status.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'member'  check (role in ('member','admin')),
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Helper: is the given user an approved admin?
--    SECURITY DEFINER so it can read profiles without triggering RLS recursion.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin' and status = 'approved'
  );
$$;

-- 3. RLS policies
drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "admins read all"    on public.profiles;
drop policy if exists "admins update all"  on public.profiles;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "admins read all" on public.profiles
  for select using (public.is_admin(auth.uid()));

create policy "admins update all" on public.profiles
  for update using (public.is_admin(auth.uid()));

-- 4. Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Seed the FIRST admin (you). Register once at /register first, then run:
--    update public.profiles set role = 'admin', status = 'approved'
--    where email = 'callum@heliaxis.co.uk';

-- 6. Enquiries: captured from the website "free quote" form.
create table if not exists public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  phone         text,
  postcode      text,
  interest      text,
  property_type text,
  source        text not null default 'quote-form',
  status        text not null default 'new'
                check (status in ('new','contacted','qualified','won','lost')),
  created_at    timestamptz not null default now()
);

alter table public.enquiries enable row level security;
-- No policies: only the service-role key (server code) can read/write.
-- The public/anon key has no access, so leads can't be scraped from the browser.

-- 7. CMS key/value store: holds the page-builder document(s) as JSON text.
--    key 'heliaxis-cms-v1' = working draft, 'heliaxis-cms-published' = live snapshot.
create table if not exists public.cms_kv (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.cms_kv enable row level security;
-- No policies: only the service-role key (server code) can read/write.

-- 8. Feedback: bug reports & feature requests raised from the CMS.
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'bug'  check (type in ('bug','feature')),
  title      text not null,
  detail     text,
  page_url   text,
  status     text not null default 'open'
             check (status in ('open','in_progress','fixed','wontfix')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
-- No policies: only the service-role key (server code) can read/write.

-- 9. Click heatmap: anonymised click positions from public pages (heatmap.js viewer).
create table if not exists public.heatmap_clicks (
  id         uuid primary key default gen_random_uuid(),
  path       text not null,
  x_pct      real not null check (x_pct >= 0 and x_pct <= 100),
  y_pct      real not null check (y_pct >= 0 and y_pct <= 100),
  vw         integer,
  vh         integer,
  doc_h      integer,
  created_at timestamptz not null default now()
);

create index if not exists heatmap_clicks_path_created_idx
  on public.heatmap_clicks (path, created_at desc);

create index if not exists heatmap_clicks_created_idx
  on public.heatmap_clicks (created_at desc);

alter table public.heatmap_clicks enable row level security;
-- No policies: only the service-role key (server code) can read/write.
