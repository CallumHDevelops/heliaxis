-- Post Studio, inside HAP. Same tables the standalone studio had, prefixed studio_ and kept in this database.
-- Access: admins and anyone with the "Social media studio" tick (profiles.portals contains 'social').
-- Safe to run more than once.

create or replace function public.studio_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
      and (p.role = 'admin' or 'social' = any (coalesce(p.portals, '{}')))
  );
$$;
revoke all on function public.studio_ok() from public;
grant execute on function public.studio_ok() to authenticated;

create table if not exists public.studio_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  tpl text not null, size text not null, theme text not null,
  hatch boolean not null default true,
  data jsonb not null,
  headline text,
  source text not null default 'manual',
  photo text
);
create index if not exists studio_posts_created_at_idx on public.studio_posts (created_at desc);

create table if not exists public.studio_badge_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  icon text not null, label text not null default ''
);
create table if not exists public.studio_saved_ideas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  title text not null, brief text not null default ''
);
create table if not exists public.studio_brand_logos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  name text not null default '', data_url text not null
);
create table if not exists public.studio_image_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  name text not null default '', description text not null default '', data_url text not null
);
create table if not exists public.studio_reels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  name text not null default 'Untitled reel', size text not null default '9:16',
  scenes jsonb not null default '[]'::jsonb
);
create table if not exists public.studio_cta_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  label text not null
);
create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  name text not null default '', location text not null default '',
  panel_manufacturer text not null default '', panel_model text not null default '',
  panel_wattage text not null default '', panel_count text not null default '',
  system_size text not null default '', annual_generation text not null default '',
  inverter_brand text not null default '', inverter_model text not null default '',
  battery_brand text not null default '', battery_total text not null default '',
  annual_savings text not null default '', notes text not null default '',
  tg_chat_id text
);
create table if not exists public.studio_project_images (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid references public.studio_projects (id) on delete cascade,
  name text not null default '', data_url text not null
);
create index if not exists studio_project_images_project_idx on public.studio_project_images (project_id);
create table if not exists public.studio_brand_kit (
  id text primary key default 'default',
  updated_at timestamptz not null default now(),
  logo_light text not null default '', logo_dark text not null default '',
  color_accent text not null default '#F8BC1E', color_ink text not null default '#211F18',
  color_paper text not null default '#F7F2E7',
  font_heading text not null default '', font_body text not null default ''
);

do $$
declare t text;
begin
  foreach t in array array['studio_posts','studio_badge_library','studio_saved_ideas','studio_brand_logos','studio_image_library','studio_reels','studio_cta_library','studio_projects','studio_project_images','studio_brand_kit']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists studio_all on public.%I', t);
    execute format('create policy studio_all on public.%I for all to authenticated using (public.studio_ok()) with check (public.studio_ok())', t);
  end loop;
end $$;
