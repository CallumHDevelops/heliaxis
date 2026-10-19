-- 27. Surveys: solar surveys done in the app (and heat pump surveys linked to SimpliHeat), with their
--     photos and drawings. Run after crm-v3.sql. Safe to re-run. Server-only (RLS on, no policies).

create table if not exists public.crm_surveys (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.crm_projects(id) on delete cascade,
  enquiry_id           uuid not null references public.enquiries(id) on delete cascade,
  type                 text not null check (type in ('solar','ashp')),
  status               text not null default 'booked' check (status in ('booked','draft','complete','cancelled')),
  surveyor_id          uuid references public.profiles(id) on delete set null,
  booking_id           uuid,                                 -- survey_bookings.id (FK added in survey-booking.sql)
  schema_version       int not null default 1,
  answers              jsonb not null default '{}'::jsonb,   -- keyed by field id (src/lib/surveys/solar-schema.ts)
  rev                  int not null default 0,               -- +1 on every saved change; saves send the rev they started from
  answers_saved_at     timestamptz,                          -- the phone's save time, for display only
  flags                text[] not null default '{}',
  summary              jsonb,
  simpliheat_url       text,
  notes                text,
  started_at           timestamptz,
  finished_on_site_at  timestamptz,                          -- when "Finish on site" was tapped (may be before upload)
  completed_at         timestamptz,
  completed_by         uuid references public.profiles(id) on delete set null,
  customer_signed_name text,
  customer_signature   text,                                 -- crm-docs path: signatures/{project}/survey-{id}.png
  customer_signed_at   timestamptz,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists crm_surveys_project_idx on public.crm_surveys (project_id, created_at desc);
create index if not exists crm_surveys_enquiry_idx on public.crm_surveys (enquiry_id);
create index if not exists crm_surveys_status_idx  on public.crm_surveys (status, updated_at desc);
-- One open survey of each type per job (two tabs or a booking and a tap can't make two).
create unique index if not exists crm_surveys_one_open on public.crm_surveys (project_id, type) where status in ('booked','draft');

alter table public.crm_photos add column if not exists survey_id   uuid references public.crm_surveys(id) on delete set null;
alter table public.crm_photos add column if not exists slot        text;   -- field id, e.g. B1, R4:r1, E1
alter table public.crm_photos add column if not exists markup      jsonb;  -- drawing (vector, 0..1 coordinates)
alter table public.crm_photos add column if not exists markup_path text;   -- flattened JPEG of photo + drawing
create index if not exists crm_photos_survey_idx on public.crm_photos (survey_id, slot) where survey_id is not null;

alter table public.crm_documents add column if not exists survey_id uuid references public.crm_surveys(id) on delete set null;

alter table public.crm_surveys enable row level security;
notify pgrst, 'reload schema';
