-- EIC certificates made by hand in the office (Operations › EIC certificates): the same certificate as the site app's, written up from the
-- electrician's figures, assigned to a customer, a job or both. Safe to run more than once. Server-only: RLS on, no policies.
create sequence if not exists public.eic_manual_seq;
create table if not exists public.eic_manual (
  id          uuid primary key default gen_random_uuid(),
  number      text unique not null default ('EIC-' || lpad(nextval('public.eic_manual_seq')::text, 4, '0')),
  route       text not null default 'eic_single' check (route in ('eic', 'eic_single', 'meiwc')),
  title       text not null default '',
  enquiry_id  uuid references public.enquiries(id) on delete set null,
  project_id  uuid references public.crm_projects(id) on delete set null,
  address     text not null default '',
  -- { key: { v, src, at } }, the same keys the site app's certificate uses (eic_earthing, eic_db:c-…).
  answers     jsonb not null default '{}'::jsonb,
  -- { eic_sig_one: { png: base64, at } } and the design part's signature.
  sigs        jsonb not null default '{}'::jsonb,
  status      text not null default 'draft' check (status in ('draft', 'issued')),
  issued_on   date,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists eic_manual_enquiry_idx on public.eic_manual (enquiry_id) where enquiry_id is not null;
create index if not exists eic_manual_project_idx on public.eic_manual (project_id) where project_id is not null;
create index if not exists eic_manual_updated_idx on public.eic_manual (updated_at desc);
alter table public.eic_manual enable row level security;
