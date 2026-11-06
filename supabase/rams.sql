-- RAMS in HAP (docs/RAMS-INTO-HAP.md). Brings the RAMS app's records into this database: a project's
-- RAMS documents and who they were written, reviewed and signed by, the people and certificates they
-- print, the trades on them and each trade's signature, and the queue that writes a RAMS when a job
-- becomes a project. Server-only (service role); RLS on with no policies, like the other tables, so the
-- rules in src/lib/rams/workflow.ts decide who may do what and the triggers here are the backstop that
-- keeps a signed-off RAMS a compliance record. Additive and safe to re-run: nothing is dropped.
-- Run after crm-v3.sql, customer-refs.sql and subcontractors.sql. supabase/rams-rollback.sql undoes it.
--
-- Not in this file (they arrive with the RAMS screens): share links, client signature requests and
-- their audit tables, NTP appointments, certificate-expiry reminders.

-- 1. People: what a RAMS prints for whoever prepared and signed it off (the RAMS app's profile fields).
alter table public.profiles add column if not exists job_title      text;
alter table public.profiles add column if not exists phone          text;
alter table public.profiles add column if not exists signature_path text;

-- 2. The site details a RAMS needs that a CRM project does not hold: one row per job. A RAMS prints
--    its own snapshot of the customer and site, so tidying the CRM later cannot rewrite an issued one.
create table if not exists public.rams_sites (
  project_id           uuid primary key references public.crm_projects(id) on delete cascade,
  sector               text not null default 'residential' check (sector in ('residential','commercial')),
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
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.rams_sites enable row level security;

-- 3. The company's own details a RAMS prints (one row).
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

-- 4. The people who work on site (the operative book) and the certificates they and the company hold.
create table if not exists public.operatives (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (btrim(full_name) <> ''),
  job_title      text,
  employer       text,
  phone          text,
  email          text,
  profile_id     uuid references public.profiles(id) on delete set null,
  signature_path text,
  notes          text,
  archived_at    timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists operatives_name_idx on public.operatives (lower(full_name));
create index if not exists operatives_archived_idx on public.operatives (archived_at);
create unique index if not exists operatives_profile_unique on public.operatives (profile_id) where profile_id is not null;
alter table public.operatives enable row level security;

create table if not exists public.certifications (
  id            uuid primary key default gen_random_uuid(),
  owner_type    text not null check (owner_type in ('company','user')),
  profile_id    uuid references public.profiles(id) on delete set null,
  operative_id  uuid references public.operatives(id) on delete set null,
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
  constraint certifications_owner_shape check (
    (owner_type = 'user'    and nullif(holder_name, '') is not null) or
    (owner_type = 'company' and profile_id is null)
  )
);
create index if not exists certifications_profile_idx on public.certifications (profile_id);
create index if not exists certifications_operative_idx on public.certifications (operative_id);
create index if not exists certifications_expiry_idx on public.certifications (expiry_date);
alter table public.certifications enable row level security;

-- Who is on a job (crew list), carried onto each RAMS written for it.
create table if not exists public.project_operatives (
  project_id   uuid not null references public.crm_projects(id) on delete cascade,
  operative_id uuid not null references public.operatives(id) on delete cascade,
  role         text,
  sort_order   integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (project_id, operative_id)
);
alter table public.project_operatives enable row level security;

-- 5. The RAMS documents. A reference is `<job reference>/RAMS-01`, numbered per job; a revision keeps its
--    reference and takes version + 1 (rams/workflow.ts). References already issued are never rewritten.
create table if not exists public.rams_ref_counters (
  project_id uuid primary key references public.crm_projects(id) on delete cascade,
  last_value integer not null default 0
);
alter table public.rams_ref_counters enable row level security;

-- The next number for a job, taken atomically so two documents never share one.
create or replace function public.rams_next_number(p_project uuid) returns integer
language sql set search_path = public as $$
  insert into public.rams_ref_counters as c (project_id, last_value) values (p_project, 1)
  on conflict (project_id) do update set last_value = c.last_value + 1
  returning last_value;
$$;

create table if not exists public.rams_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.crm_projects(id) on delete cascade,
  reference     text not null,
  title         text not null,
  technology    text not null,
  sector        text not null default 'residential' check (sector in ('residential','commercial')),
  document_type text not null default 'rams' check (document_type in ('rams','risk_assessment','method_statement')),
  version       integer not null default 1 check (version >= 1),
  status        text not null default 'draft' check (status in ('draft','in_review','approved','issued','archived')),
  content       jsonb not null default '{}'::jsonb,
  review_date   date,
  -- Written by the system when it was made automatically (no author), so the project's owner can sign it off.
  author_id     uuid references public.profiles(id) on delete set null,
  -- Who was asked to review it (the project's owner, else an admin), and how it was made.
  reviewer_id   uuid references public.profiles(id) on delete set null,
  source        text not null default 'manual' check (source in ('auto','manual')),
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  issued_at     timestamptz,
  -- Who prepared and who approved it, as they stood on the day, and the marks they signed with: copies, so
  -- the record reads the same in five years whatever happens to their account.
  author_name              text,
  author_job_title         text,
  author_signature_path    text,
  approved_by_name         text,
  approved_by_job_title    text,
  approved_signature_path  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, reference, version)
);
create index if not exists rams_documents_project_idx on public.rams_documents (project_id);
create index if not exists rams_documents_status_idx on public.rams_documents (status);
alter table public.rams_documents enable row level security;

-- The backstop for a compliance record, whatever the application does:
--   * a signed-off, issued or superseded RAMS cannot be deleted (a cascade from a deleted job included);
--   * a status only moves along the allowed path: draft, in review, approved, issued, superseded;
--   * once approved or issued its wording cannot change (only taking it back to draft reopens it);
--   * approved and issued carry who approved it and when; a draft or one in review carries no approval.
create or replace function public.rams_documents_guard() returns trigger
language plpgsql set search_path = public as $$
declare ok boolean;
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','issued','archived') then
      raise exception 'RAMS % is a compliance record (%): it cannot be deleted.', old.reference, old.status using errcode = '23001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'archived' then
      raise exception 'RAMS % version % has been superseded and cannot be changed.', old.reference, old.version using errcode = '23001';
    end if;
    if new.status <> old.status then
      ok := (old.status, new.status) in (
        ('draft','in_review'), ('in_review','draft'), ('in_review','approved'),
        ('approved','issued'), ('approved','draft'), ('issued','draft'), ('issued','archived')
      );
      if not ok then
        raise exception 'RAMS % cannot go from % to %.', old.reference, old.status, new.status using errcode = '23001';
      end if;
    end if;
    if old.status in ('approved','issued') and new.status in ('approved','issued','archived') and (
         new.content is distinct from old.content or new.title is distinct from old.title
      or new.reference is distinct from old.reference or new.version is distinct from old.version
      or new.technology is distinct from old.technology or new.sector is distinct from old.sector
      or new.document_type is distinct from old.document_type or new.project_id is distinct from old.project_id) then
      raise exception 'RAMS % is signed off: take it back to draft to change it, or revise it.', old.reference using errcode = '23001';
    end if;
    new.updated_at := now();
  end if;

  if new.status in ('draft','in_review') then
    new.approved_by := null; new.approved_at := null; new.issued_at := null;
    new.approved_by_name := null; new.approved_by_job_title := null; new.approved_signature_path := null;
  elsif new.approved_by is null or new.approved_at is null then
    raise exception 'RAMS % is % but has no approver or approval time.', new.reference, new.status using errcode = '23001';
  end if;
  return new;
end $$;
drop trigger if exists rams_documents_guard on public.rams_documents;
create trigger rams_documents_guard before insert or update or delete on public.rams_documents
  for each row execute function public.rams_documents_guard();

-- Who is on each RAMS (competence appendix).
create table if not exists public.rams_operatives (
  rams_id      uuid not null references public.rams_documents(id) on delete cascade,
  operative_id uuid not null references public.operatives(id) on delete cascade,
  role         text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  primary key (rams_id, operative_id)
);
alter table public.rams_operatives enable row level security;

-- 6. Trades. Which trades are on which RAMS, and each one's request to read and sign a version of it.
--    A trade is a subcontractor from the trade portal; nothing is mirrored.
create table if not exists public.rams_trades (
  rams_id          uuid not null references public.rams_documents(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id),
  scope            text,
  added_by         uuid references public.profiles(id) on delete set null,
  added_at         timestamptz not null default now(),
  primary key (rams_id, subcontractor_id)
);
create index if not exists rams_trades_sub_idx on public.rams_trades (subcontractor_id);
alter table public.rams_trades enable row level security;

create table if not exists public.rams_trade_requests (
  id                   uuid primary key default gen_random_uuid(),
  rams_id              uuid not null references public.rams_documents(id) on delete cascade,
  subcontractor_id     uuid not null references public.subcontractors(id),
  sent_at              timestamptz,
  signed_at            timestamptz,
  signed_name          text,
  signature_path       text,
  signature_ip_hash    text,
  signature_user_agent text,
  revoked_at           timestamptz,
  created_at           timestamptz not null default now()
);
-- One live request per trade per version; a withdrawn one can be sent again.
create unique index if not exists rams_trade_requests_live on public.rams_trade_requests (rams_id, subcontractor_id) where revoked_at is null;
create index if not exists rams_trade_requests_sub_idx on public.rams_trade_requests (subcontractor_id);
alter table public.rams_trade_requests enable row level security;

-- A signature, once given, is the record: it cannot be changed or withdrawn, and a withdrawn request
-- cannot be revived.
create or replace function public.rams_trade_requests_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.signed_at is not null and (to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'A signed RAMS request cannot be changed.' using errcode = '23001';
  end if;
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'A withdrawn RAMS request cannot be revived: send a new one.' using errcode = '23001';
  end if;
  return new;
end $$;
drop trigger if exists rams_trade_requests_guard on public.rams_trade_requests;
create trigger rams_trade_requests_guard before update on public.rams_trade_requests
  for each row execute function public.rams_trade_requests_guard();

-- 7. Briefings: who has been briefed on a RAMS and signed it (a toolbox talk, a link, or the trade portal).
create table if not exists public.rams_briefings (
  id                   uuid primary key default gen_random_uuid(),
  rams_id              uuid not null references public.rams_documents(id) on delete cascade,
  profile_id           uuid references public.profiles(id) on delete set null,
  subcontractor_id     uuid references public.subcontractors(id),
  trade_request_id     uuid references public.rams_trade_requests(id) on delete set null,
  person_name          text not null,
  person_role          text,
  company              text,
  briefed_by           text,
  briefed_by_id        uuid references public.profiles(id) on delete set null,
  signed_at            timestamptz,
  signature            text,
  signature_path       text,
  signature_ip_hash    text,
  signature_user_agent text,
  signed_via           text not null default 'in_person' check (signed_via in ('in_person','link','portal')),
  created_at           timestamptz not null default now()
);
create index if not exists rams_briefings_rams_idx on public.rams_briefings (rams_id);
alter table public.rams_briefings enable row level security;

-- Who was briefed is the first thing an inspector asks for: a briefing on an issued or superseded RAMS
-- cannot be removed (a RAMS being deleted takes its own briefings with it, which only a draft allows).
create or replace function public.rams_briefings_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.rams_documents d where d.id = old.rams_id and d.status in ('issued','archived')) then
    raise exception 'A briefing on an issued RAMS is part of the record and cannot be removed.' using errcode = '23001';
  end if;
  return old;
end $$;
drop trigger if exists rams_briefings_guard on public.rams_briefings;
create trigger rams_briefings_guard before delete on public.rams_briefings
  for each row execute function public.rams_briefings_guard();

-- 8. Writing a RAMS when a job becomes a project, and only then. A CRM row is an opportunity until it
--    reaches Won; the trigger crm_projects_start sets project_started_at at that moment, once. This
--    queues the job (a job is queued once, ever) and the app writes its RAMS from the queue. A job that
--    arrives already Complete or Lost (an import, a record of a finished job) is not queued.
create table if not exists public.rams_autocreate_queue (
  project_id   uuid primary key references public.crm_projects(id) on delete cascade,
  queued_at    timestamptz not null default now(),
  processed_at timestamptz,
  result       text,
  error        text
);
alter table public.rams_autocreate_queue enable row level security;

create or replace function public.crm_projects_queue_rams() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_started_at is not null
     and new.stage not in ('complete','lost')
     and (tg_op = 'INSERT' or old.project_started_at is null) then
    insert into public.rams_autocreate_queue (project_id) values (new.id) on conflict (project_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists crm_projects_queue_rams on public.crm_projects;
create trigger crm_projects_queue_rams after insert or update on public.crm_projects
  for each row execute function public.crm_projects_queue_rams();

-- A trigger function is never meant to be called over the API: take execute away from the public and the
-- API roles (the trigger still fires, which does not check the caller's execute right).
do $$
begin
  revoke execute on function public.crm_projects_queue_rams() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.crm_projects_queue_rams() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.crm_projects_queue_rams() from authenticated;
  end if;
end $$;

-- 9. Private storage for signatures and certificate files (created here if the storage schema is present).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('rams-signatures', 'rams-signatures', false) on conflict (id) do nothing;
    insert into storage.buckets (id, name, public) values ('rams-certifications', 'rams-certifications', false) on conflict (id) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
