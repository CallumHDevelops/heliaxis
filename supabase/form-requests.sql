-- Requests for installer information (src/lib/requests): the office asks an installer (a site
-- contact) to fill in a pack item's form on their phone, one question at a time, by a private link.
-- Only the link's sha256 is kept. Safe to run more than once.
create table if not exists public.form_requests (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.crm_projects(id) on delete cascade,
  -- The pack item asked about: a form template's code (HX-HP-02) or a handover item (HX-HO-09).
  target        text not null,
  contact_id    uuid references public.site_contacts(id) on delete set null,
  contact_name  text not null,
  link_hash     text not null unique,
  note          text,
  sent_via      text[] not null default '{}',
  requested_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  opened_at     timestamptz,
  submitted_at  timestamptz,
  cancelled_at  timestamptz,
  expires_at    timestamptz not null default (now() + interval '30 days')
);
create index if not exists form_requests_project_idx on public.form_requests (project_id, target);
alter table public.form_requests enable row level security;
-- No policies: only the server (service role) reads and writes it.
