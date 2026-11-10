-- Minimal stand-ins for what Supabase provides
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- storage stand-in (Supabase provides the real one)
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;

-- Heliaxis's users table, as far as ProspectPV's role check reads it (supabase/schema.sql, user-portals.sql)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  portals text[] not null default '{}'
);
