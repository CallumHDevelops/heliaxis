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
