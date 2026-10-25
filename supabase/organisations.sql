-- 35. Organisations and contacts: commercial customers, landlords and housing associations,
--     schools and the public sector, partners who refer work (builders, architects, letting agents),
--     suppliers. Contacts are the people we deal with: each is either part of an organisation (one of
--     an organisation's contacts is its primary contact) or on their own (a builder who works alone, an
--     architect, a landlord). A job can be linked to an organisation and to the contact it's dealt with
--     through.
--     Contacts are their own rows, not customer records (enquiries): adding one never puts them in the
--     leads lists, or gives them an opportunity, a reference or automatic WhatsApps. (A contact who
--     WhatsApps the business number still arrives as a new chat, as any new number does today.)
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

create table if not exists public.crm_contacts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid references public.organisations(id) on delete set null,   -- none: on their own (and if the organisation is deleted)
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
-- (A contact first made by an earlier version of this file had to belong to an organisation.)
alter table public.crm_contacts alter column organisation_id drop not null;
create index if not exists crm_contacts_org_idx on public.crm_contacts (organisation_id, created_at);
create index if not exists crm_contacts_name_idx on public.crm_contacts (lower(name));
-- One primary contact per organisation (a contact on their own is never primary: the app never sets it).
create unique index if not exists crm_contacts_one_primary on public.crm_contacts (organisation_id) where is_primary;

-- A job's organisation, and the contact it's dealt with through (in that organisation, or on their
-- own). Deleting either leaves the job.
alter table public.crm_projects add column if not exists organisation_id uuid references public.organisations(id) on delete set null;
alter table public.crm_projects add column if not exists contact_id      uuid references public.crm_contacts(id) on delete set null;
create index if not exists crm_projects_organisation_idx on public.crm_projects (organisation_id) where organisation_id is not null;
create index if not exists crm_projects_contact_idx on public.crm_projects (contact_id) where contact_id is not null;

alter table public.organisations         enable row level security;
alter table public.crm_contacts enable row level security;
notify pgrst, 'reload schema';
