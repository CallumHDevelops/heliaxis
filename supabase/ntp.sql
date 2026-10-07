-- 14. NTP (Nominated Technical Person) agreements — per technology, renewed yearly.
create table if not exists public.subcontractor_ntp_agreements (
  id                  uuid primary key default gen_random_uuid(),
  subcontractor_id    uuid not null references public.subcontractors(id) on delete cascade,
  ref                 text not null unique,                  -- HLX-NTP-2026-001
  status              text not null default 'awaiting_signature'
                      check (status in ('awaiting_signature','awaiting_countersign','active','expired','superseded','cancelled')),
  technologies        text[] not null,
  operative_id        uuid references public.subcontractor_operatives(id) on delete set null,
  ntp_name            text not null,
  min_days_per_month  numeric,
  supervision         jsonb not null default '{}'::jsonb,
  fee                 text,
  renewal_of          uuid references public.subcontractor_ntp_agreements(id) on delete set null,
  snapshot            jsonb not null,
  content_hash        text not null,
  sub_name            text,
  sub_title           text,
  sub_signature       text,
  sub_signed_at       timestamptz,
  sub_ip              text,
  sub_user_agent      text,
  hlx_name            text,
  hlx_title           text,
  hlx_signature       text,
  hlx_signed_at       timestamptz,
  hlx_signed_by       text,
  hlx_ip              text,
  valid_from          date,
  expires_on          date,
  requested_by        text,
  created_at          timestamptz not null default now()
);
create index if not exists sc_ntp_sub_idx on public.subcontractor_ntp_agreements (subcontractor_id, created_at desc);
create index if not exists sc_ntp_expiry_idx on public.subcontractor_ntp_agreements (status, expires_on);

create table if not exists public.subcontractor_ntp_reminders (
  id              uuid primary key default gen_random_uuid(),
  ntp_id          uuid not null references public.subcontractor_ntp_agreements(id) on delete cascade,
  threshold_days  integer not null,
  sent_at         timestamptz not null default now(),
  unique (ntp_id, threshold_days)
);

alter table public.subcontractor_ntp_agreements enable row level security;
alter table public.subcontractor_ntp_reminders  enable row level security;
