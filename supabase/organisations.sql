-- 35. Organisations and their contacts: commercial customers, landlords and housing associations,
--     schools and the public sector, partners who refer work (builders, architects, letting agents),
--     suppliers. Each has its people (one of them the primary contact), and a job can be linked to an
--     organisation and to the contact you deal with there.
--     Contacts are their own rows, not customer records (enquiries): they never appear in the leads
--     lists, never get an opportunity, a reference or automatic WhatsApps (src/lib/organisations/shared.ts).
--     Run after crm.sql. Safe to run twice. Server-only tables (RLS on, no policies).
-- Adding the job's columns briefly locks crm_projects: if something holds it, stop after 5 seconds
-- (nothing is changed) rather than queue every read of the jobs behind it. Just run it again.
set lock_timeout = '5s';

do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'crm_projects') then
    raise exception 'Run crm.sql first, then this file.';
  end if;
end $$;

create table if not exists public.organisations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 160),
  type            text not null default 'commercial'
                  check (type in ('commercial','landlord','public_sector','partner','supplier','other')),
  phone           text,
  email           text,
  website         text,
  address         text,
  postcode        text,
  company_number  text,                          -- Companies House, e.g. 01234567 or SC123456
  vat_number      text,                          -- GB123456789
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists organisations_name_idx on public.organisations (lower(name));

create table if not exists public.organisation_contacts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 120),
  role             text,                         -- job title: "Facilities manager"
  mobile           text,
  email            text,
  notes            text,
  is_primary       boolean not null default false,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists organisation_contacts_org_idx on public.organisation_contacts (organisation_id, created_at);
-- One primary contact per organisation.
create unique index if not exists organisation_contacts_one_primary on public.organisation_contacts (organisation_id) where is_primary;

-- A job's organisation, and the contact there it's dealt with through. Deleting either leaves the job.
alter table public.crm_projects add column if not exists organisation_id         uuid references public.organisations(id) on delete set null;
alter table public.crm_projects add column if not exists organisation_contact_id uuid references public.organisation_contacts(id) on delete set null;
create index if not exists crm_projects_organisation_idx on public.crm_projects (organisation_id) where organisation_id is not null;
create index if not exists crm_projects_organisation_contact_idx on public.crm_projects (organisation_contact_id) where organisation_contact_id is not null;

alter table public.organisations         enable row level security;
alter table public.organisation_contacts enable row level security;
notify pgrst, 'reload schema';
