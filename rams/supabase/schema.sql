-- ============================================================================
-- Heliaxis RAMS — database schema
-- Run once in Supabase → SQL Editor → New query. Safe to re-run (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles — one row per registered user, holding role + approval status.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  job_title     text,
  phone         text,
  role          text not null default 'member'  check (role in ('member','manager','admin')),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  signature_url text,
  created_at    timestamptz not null default now()
);

alter table public.profiles add column if not exists job_title     text;
alter table public.profiles add column if not exists phone         text;
alter table public.profiles add column if not exists signature_url text;

alter table public.profiles enable row level security;

-- Approved-admin check. SECURITY DEFINER so it reads profiles without
-- re-entering RLS (which would recurse).
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin' and status = 'approved'
  );
$$;

-- Any approved user (member, manager or admin). The bar for reading/writing
-- operational data.
create or replace function public.is_approved(uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = uid and status = 'approved'
  );
$$;

-- Manager or admin — may approve/issue RAMS and manage company records.
create or replace function public.is_manager(uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role in ('manager','admin') and status = 'approved'
  );
$$;

drop policy if exists "read own profile"     on public.profiles;
drop policy if exists "approved read all"    on public.profiles;
drop policy if exists "update own profile"   on public.profiles;
drop policy if exists "admins update all"    on public.profiles;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
-- Approved staff can see each other: needed to pick operatives for a RAMS.
create policy "approved read all" on public.profiles
  for select using (public.is_approved(auth.uid()));
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "admins update all" on public.profiles
  for update using (public.is_admin(auth.uid()));

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- ---------------------------------------------------------------------------
-- 2. Company settings — a single row (id = 1) shown on every report header.
-- ---------------------------------------------------------------------------
create table if not exists public.company_settings (
  id                   integer primary key default 1 check (id = 1),
  name                 text not null default 'Heliaxis Ltd',
  trading_name         text,
  registration_number  text,
  vat_number           text,
  address              text,
  postcode             text,
  phone                text,
  email                text,
  website              text,
  logo_url             text,
  hs_policy_statement  text,
  competent_person     text,
  insurer              text,
  policy_number        text,
  policy_expiry        date,
  emergency_contact    text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles(id) on delete set null
);

insert into public.company_settings (id) values (1) on conflict (id) do nothing;

alter table public.company_settings enable row level security;

drop policy if exists "approved read company"  on public.company_settings;
drop policy if exists "managers write company" on public.company_settings;

create policy "approved read company" on public.company_settings
  for select using (public.is_approved(auth.uid()));
create policy "managers write company" on public.company_settings
  for update using (public.is_manager(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Certifications — company accreditations and individual competencies.
--    owner_type 'company' → company-wide (MCS, NICEIC, CHAS, insurance…)
--    owner_type 'user'    → held by a person (IOSH, ECS, PASMA, IPAF, F-Gas…)
-- ---------------------------------------------------------------------------
create table if not exists public.certifications (
  id            uuid primary key default gen_random_uuid(),
  owner_type    text not null check (owner_type in ('company','user')),
  profile_id    uuid references public.profiles(id) on delete cascade,
  holder_name   text,
  title         text not null,
  category      text,
  issuing_body  text,
  reference     text,
  issue_date    date,
  expiry_date   date,
  file_path     text,
  file_name     text,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A user certificate must name its holder; a company one must not.
  constraint certifications_owner_shape check (
    (owner_type = 'user'    and profile_id is not null) or
    (owner_type = 'company' and profile_id is null)
  )
);

create index if not exists certifications_profile_idx on public.certifications (profile_id);
create index if not exists certifications_expiry_idx  on public.certifications (expiry_date);

alter table public.certifications enable row level security;

drop policy if exists "approved read certs"  on public.certifications;
drop policy if exists "approved write certs" on public.certifications;
drop policy if exists "owner or manager update certs" on public.certifications;
drop policy if exists "owner or manager delete certs" on public.certifications;

create policy "approved read certs" on public.certifications
  for select using (public.is_approved(auth.uid()));
-- Anyone approved may add their own; only managers may add company-wide ones.
create policy "approved write certs" on public.certifications
  for insert with check (
    public.is_approved(auth.uid())
    and (owner_type = 'user' or public.is_manager(auth.uid()))
  );
create policy "owner or manager update certs" on public.certifications
  for update using (profile_id = auth.uid() or public.is_manager(auth.uid()));
create policy "owner or manager delete certs" on public.certifications
  for delete using (profile_id = auth.uid() or public.is_manager(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Projects.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id                   uuid primary key default gen_random_uuid(),
  reference            text unique not null,
  name                 text not null,
  status               text not null default 'planning'
                       check (status in ('planning','active','on_hold','complete','cancelled')),
  sector               text not null default 'residential'
                       check (sector in ('residential','commercial')),
  technologies         text[] not null default '{}',
  client_name          text,
  client_contact       text,
  client_phone         text,
  client_email         text,
  site_address         text,
  site_postcode        text,
  site_contact         text,
  site_contact_phone   text,
  what3words           text,
  site_lat             double precision,
  site_lng             double precision,
  principal_contractor text,
  principal_designer   text,
  cdm_notifiable       boolean not null default false,
  f10_reference        text,
  start_date           date,
  end_date             date,
  access_notes         text,
  welfare_notes        text,
  nearest_hospital     text,
  notes                text,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.projects add column if not exists site_lat double precision;
alter table public.projects add column if not exists site_lng double precision;

create index if not exists projects_status_idx  on public.projects (status);
create index if not exists projects_created_idx on public.projects (created_at desc);

alter table public.projects enable row level security;

drop policy if exists "approved read projects"   on public.projects;
drop policy if exists "approved insert projects" on public.projects;
drop policy if exists "approved update projects" on public.projects;
drop policy if exists "managers delete projects" on public.projects;

create policy "approved read projects"   on public.projects
  for select using (public.is_approved(auth.uid()));
create policy "approved insert projects" on public.projects
  for insert with check (public.is_approved(auth.uid()));
create policy "approved update projects" on public.projects
  for update using (public.is_approved(auth.uid()));
create policy "managers delete projects" on public.projects
  for delete using (public.is_manager(auth.uid()));

-- Human-readable project references: HX-2026-0001, allocated per calendar year.
create sequence if not exists public.project_ref_seq;

create or replace function public.next_project_reference()
returns text language sql volatile as $$
  select 'HX-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.project_ref_seq')::text, 4, '0');
$$;

-- ---------------------------------------------------------------------------
-- 5. Project files — surveys, drawings, photos, permits (Storage objects).
-- ---------------------------------------------------------------------------
create table if not exists public.project_files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text,
  kind        text not null default 'other'
              check (kind in ('survey','drawing','photo','permit','spec','other')),
  file_path   text not null,
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists project_files_project_idx on public.project_files (project_id);

alter table public.project_files enable row level security;

drop policy if exists "approved read project files"   on public.project_files;
drop policy if exists "approved write project files"  on public.project_files;
drop policy if exists "approved delete project files" on public.project_files;

create policy "approved read project files"   on public.project_files
  for select using (public.is_approved(auth.uid()));
create policy "approved write project files"  on public.project_files
  for insert with check (public.is_approved(auth.uid()));
create policy "approved delete project files" on public.project_files
  for delete using (uploaded_by = auth.uid() or public.is_manager(auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. RAMS documents. The body is JSONB so the builder can evolve without a
--    migration; the columns below are the fields we filter and sort on.
-- ---------------------------------------------------------------------------
create table if not exists public.rams_documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  reference    text not null,
  title        text not null,
  technology   text not null,
  sector       text not null default 'residential'
               check (sector in ('residential','commercial')),
  version      integer not null default 1,
  status       text not null default 'draft'
               check (status in ('draft','in_review','approved','issued','archived')),
  content      jsonb not null default '{}'::jsonb,
  review_date  date,
  author_id    uuid references public.profiles(id) on delete set null,
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  issued_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, reference, version)
);

create index if not exists rams_project_idx on public.rams_documents (project_id);
create index if not exists rams_status_idx  on public.rams_documents (status);
create index if not exists rams_updated_idx on public.rams_documents (updated_at desc);

alter table public.rams_documents enable row level security;

drop policy if exists "approved read rams"    on public.rams_documents;
drop policy if exists "approved insert rams"  on public.rams_documents;
drop policy if exists "approved update rams"  on public.rams_documents;
drop policy if exists "managers delete rams"  on public.rams_documents;

create policy "approved read rams"   on public.rams_documents
  for select using (public.is_approved(auth.uid()));
create policy "approved insert rams" on public.rams_documents
  for insert with check (public.is_approved(auth.uid()));
-- Issued documents are a compliance record: only a manager may reopen one.
create policy "approved update rams" on public.rams_documents
  for update using (
    public.is_approved(auth.uid())
    and (status in ('draft','in_review') or public.is_manager(auth.uid()))
  );
create policy "managers delete rams" on public.rams_documents
  for delete using (public.is_manager(auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. Certificates attached to a RAMS (appendix of competencies).
-- ---------------------------------------------------------------------------
create table if not exists public.rams_certifications (
  rams_id          uuid not null references public.rams_documents(id) on delete cascade,
  certification_id uuid not null references public.certifications(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (rams_id, certification_id)
);

alter table public.rams_certifications enable row level security;

drop policy if exists "approved read rams certs"  on public.rams_certifications;
drop policy if exists "approved write rams certs" on public.rams_certifications;
drop policy if exists "approved del rams certs"   on public.rams_certifications;

create policy "approved read rams certs"  on public.rams_certifications
  for select using (public.is_approved(auth.uid()));
create policy "approved write rams certs" on public.rams_certifications
  for insert with check (public.is_approved(auth.uid()));
create policy "approved del rams certs"   on public.rams_certifications
  for delete using (public.is_approved(auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. Operative briefing record — who was briefed on the document, and when.
-- ---------------------------------------------------------------------------
create table if not exists public.rams_briefings (
  id           uuid primary key default gen_random_uuid(),
  rams_id      uuid not null references public.rams_documents(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete set null,
  person_name  text not null,
  person_role  text,
  company      text,
  briefed_by   text,
  signed_at    timestamptz,
  signature    text,
  created_at   timestamptz not null default now()
);

create index if not exists rams_briefings_rams_idx on public.rams_briefings (rams_id);

alter table public.rams_briefings enable row level security;

drop policy if exists "approved read briefings"  on public.rams_briefings;
drop policy if exists "approved write briefings" on public.rams_briefings;
drop policy if exists "approved del briefings"   on public.rams_briefings;

create policy "approved read briefings"  on public.rams_briefings
  for select using (public.is_approved(auth.uid()));
create policy "approved write briefings" on public.rams_briefings
  for insert with check (public.is_approved(auth.uid()));
create policy "approved del briefings"   on public.rams_briefings
  for delete using (public.is_approved(auth.uid()));

-- ---------------------------------------------------------------------------
-- 9. Share links — time-limited, revocable public access to a RAMS.
--    Only the SHA-256 of the token is stored, so a database leak does not
--    hand out working links. Reads go through the service-role key.
-- ---------------------------------------------------------------------------
create table if not exists public.share_links (
  id              uuid primary key default gen_random_uuid(),
  rams_id         uuid not null references public.rams_documents(id) on delete cascade,
  token_hash      text unique not null,
  label           text,
  recipient_email text,
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  max_views       integer,
  view_count      integer not null default 0,
  last_viewed_at  timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists share_links_rams_idx    on public.share_links (rams_id);
create index if not exists share_links_expires_idx on public.share_links (expires_at);

alter table public.share_links enable row level security;

drop policy if exists "approved read share links"   on public.share_links;
drop policy if exists "approved write share links"  on public.share_links;
drop policy if exists "approved revoke share links" on public.share_links;

-- Staff can see and manage links; the anon key gets nothing, so a token can
-- never be looked up from the browser.
create policy "approved read share links"   on public.share_links
  for select using (public.is_approved(auth.uid()));
create policy "approved write share links"  on public.share_links
  for insert with check (public.is_approved(auth.uid()));
create policy "approved revoke share links" on public.share_links
  for update using (public.is_approved(auth.uid()));

-- Audit trail of every view of a shared link.
create table if not exists public.share_link_views (
  id            uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  viewed_at     timestamptz not null default now(),
  ip_hash       text,
  user_agent    text
);

create index if not exists share_link_views_link_idx on public.share_link_views (share_link_id, viewed_at desc);

alter table public.share_link_views enable row level security;

drop policy if exists "approved read share views" on public.share_link_views;
create policy "approved read share views" on public.share_link_views
  for select using (public.is_approved(auth.uid()));
-- Inserts happen server-side with the service-role key.

-- Atomically record a view and return the new count, so two simultaneous
-- viewers can't both slip past a max_views cap.
create or replace function public.register_share_view(link_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  new_count integer;
begin
  update public.share_links
     set view_count = view_count + 1,
         last_viewed_at = now()
   where id = link_id
  returning view_count into new_count;
  return new_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. updated_at maintenance.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch  on public.projects;
drop trigger if exists rams_touch      on public.rams_documents;
drop trigger if exists certs_touch     on public.certifications;
drop trigger if exists company_touch   on public.company_settings;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger rams_touch     before update on public.rams_documents
  for each row execute function public.touch_updated_at();
create trigger certs_touch    before update on public.certifications
  for each row execute function public.touch_updated_at();
create trigger company_touch  before update on public.company_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Storage buckets — both private; files are served via signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('certifications', 'certifications', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "approved read certification files"   on storage.objects;
drop policy if exists "approved write certification files"  on storage.objects;
drop policy if exists "approved delete certification files" on storage.objects;
drop policy if exists "approved read project files obj"     on storage.objects;
drop policy if exists "approved write project files obj"    on storage.objects;
drop policy if exists "approved delete project files obj"   on storage.objects;

create policy "approved read certification files" on storage.objects
  for select using (bucket_id = 'certifications' and public.is_approved(auth.uid()));
create policy "approved write certification files" on storage.objects
  for insert with check (bucket_id = 'certifications' and public.is_approved(auth.uid()));
create policy "approved delete certification files" on storage.objects
  for delete using (bucket_id = 'certifications' and public.is_approved(auth.uid()));

create policy "approved read project files obj" on storage.objects
  for select using (bucket_id = 'project-files' and public.is_approved(auth.uid()));
create policy "approved write project files obj" on storage.objects
  for insert with check (bucket_id = 'project-files' and public.is_approved(auth.uid()));
create policy "approved delete project files obj" on storage.objects
  for delete using (bucket_id = 'project-files' and public.is_approved(auth.uid()));

-- ---------------------------------------------------------------------------
-- 12. Seed the first admin. Register at /register first, then run:
--       update public.profiles
--          set role = 'admin', status = 'approved'
--        where email = 'callum@heliaxis.co.uk';
-- ---------------------------------------------------------------------------
