-- 24. CRM: projects, their timeline, and site photos. Customers are the existing enquiries.
--     Server-only (service role); RLS on with no policies, like the other tables.
--     Photos live in the private "crm-photos" storage bucket (created by the app on first upload).

-- A job for a customer, from first contact to completion.
create table if not exists public.crm_projects (
  id              uuid primary key default gen_random_uuid(),
  enquiry_id      uuid not null references public.enquiries(id) on delete cascade, -- the customer
  title           text not null,
  stage           text not null default 'lead',  -- see src/lib/crm/stages.ts
  products        text[] not null default '{}',  -- solar | battery | heatpump | ev | infrared | led | other
  value           numeric(12,2),                 -- quoted / agreed price, £ inc. VAT
  owner_id        uuid references public.profiles(id) on delete set null,
  address         text,
  postcode        text,
  survey_at       timestamptz,                   -- booked survey
  install_at      timestamptz,                   -- booked install
  simpliheat_url  text,
  opensolar_url   text,
  lost_reason     text,
  notes           text,
  stage_changed_at timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists crm_projects_enquiry_idx on public.crm_projects (enquiry_id);
create index if not exists crm_projects_stage_idx on public.crm_projects (stage, updated_at desc);

-- Everything that happened with a customer: notes, calls, visits, emails, stage moves, photo uploads.
-- (WhatsApp messages stay in whatsapp_messages and are merged into the timeline when shown.)
create table if not exists public.crm_activities (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references public.enquiries(id) on delete cascade,
  project_id  uuid references public.crm_projects(id) on delete cascade,
  kind        text not null check (kind in ('note','call','visit','email','stage','photo','system')),
  body        text,
  meta        jsonb,                              -- e.g. {from:'lead', to:'survey_booked'} or {count:4, category:'snag'}
  by_id       uuid references public.profiles(id) on delete set null,
  at          timestamptz not null default now()
);
create index if not exists crm_activities_enquiry_idx on public.crm_activities (enquiry_id, at desc);
create index if not exists crm_activities_project_idx on public.crm_activities (project_id, at desc);

-- Site photos, filed by type.
create table if not exists public.crm_photos (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.crm_projects(id) on delete cascade,
  category      text not null check (category in ('survey','site','progress','snag','completion','other')),
  storage_path  text not null unique,
  caption       text,
  width         int,
  height        int,
  taken_at      timestamptz,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists crm_photos_project_idx on public.crm_photos (project_id, category, created_at desc);

-- Next step (Pipedrive-style: every live deal should have one). Safe to re-run this file.
alter table public.crm_projects add column if not exists next_step             text;
alter table public.crm_projects add column if not exists next_step_at          timestamptz;
alter table public.crm_projects add column if not exists next_step_notified_at timestamptz;
create index if not exists crm_projects_next_step_idx on public.crm_projects (next_step_at) where next_step_at is not null;

alter table public.crm_projects   enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_photos     enable row level security;

-- First run only: turn the CRM on for everyone who already has Enquiries (then manage it on the
-- Users page — re-running this file never re-grants access you've removed).
update public.profiles
   set portals = array_append(portals, 'crm')
 where portals is not null and 'enquiries' = any(portals) and not ('crm' = any(portals))
   and not exists (select 1 from public.profiles p2 where p2.portals is not null and 'crm' = any(p2.portals));
