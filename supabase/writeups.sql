-- Documents (CRM › Documents): tenders and other written documents built in the app from sections, text, pictures and tables, assigned to a
-- customer or organisation, downloaded as PDF or Word. Safe to run more than once. Server-only: RLS on, no policies.
create sequence if not exists public.crm_writeups_seq;
create table if not exists public.crm_writeups (
  id              uuid primary key default gen_random_uuid(),
  number          text unique not null default ('DOC-' || lpad(nextval('public.crm_writeups_seq')::text, 4, '0')),
  kind            text not null default 'tender',
  title           text not null default 'Untitled document',
  enquiry_id      uuid references public.enquiries(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  project_id      uuid references public.crm_projects(id) on delete set null,
  content         jsonb not null default '{"blocks":[]}'::jsonb,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists crm_writeups_enquiry_idx on public.crm_writeups (enquiry_id) where enquiry_id is not null;
create index if not exists crm_writeups_org_idx on public.crm_writeups (organisation_id) where organisation_id is not null;
create index if not exists crm_writeups_updated_idx on public.crm_writeups (updated_at desc);
alter table public.crm_writeups enable row level security;

-- The section library: sections (one block or a few) saved from a document to drop into any other. Safe to run more than once.
create table if not exists public.crm_writeup_library (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  blocks      jsonb not null default '[]'::jsonb,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists crm_writeup_library_name_idx on public.crm_writeup_library (lower(name));
alter table public.crm_writeup_library enable row level security;
