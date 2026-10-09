-- 15. Subcontractor reminders: one daily digest per firm, each chase step sent once.
create table if not exists public.subcontractor_nudges (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  kind             text not null,     -- onboarding | missing_docs | rejected | expired | crew | ntp_sign | countersign | escalation
  subject_key      text not null,     -- what it's about (firm, document, job …) so steps don't repeat
  step             integer not null,  -- which chase in the sequence (e.g. day 3, 7, 14)
  sent_to          text,
  sent_at          timestamptz not null default now(),
  unique (kind, subject_key, step)
);
create index if not exists sc_nudges_sub_idx on public.subcontractor_nudges (subcontractor_id, sent_at desc);

-- Admin switch per firm.
alter table public.subcontractors add column if not exists reminders_paused boolean not null default false;

-- Heartbeat for scheduled jobs, so admin can see they're running.
create table if not exists public.cron_runs (
  id       uuid primary key default gen_random_uuid(),
  job      text not null,
  ok       boolean not null,
  summary  jsonb,
  ran_at   timestamptz not null default now()
);
create index if not exists cron_runs_job_idx on public.cron_runs (job, ran_at desc);

alter table public.subcontractor_nudges enable row level security;
alter table public.cron_runs            enable row level security;

-- NTP signing links: the named NTP (usually one of the firm's team) signs from a
-- personal emailed link — no portal login. Only a hash of the link is stored.
alter table public.subcontractor_ntp_agreements
  add column if not exists ntp_email             text,
  add column if not exists sign_token_hash       text unique,
  add column if not exists sign_token_created_at timestamptz;
