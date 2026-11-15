-- The business's test instruments (Operations › Test instruments): what each is, its serial and asset number, when it was calibrated and
-- when that runs out. The EIC picks from here, and warns when an instrument used is out of calibration. Safe to run more than once. Server-only: RLS on, no policies.
create table if not exists public.test_instruments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  kind            text not null default 'mft' check (kind in ('mft', 'continuity', 'ir', 'efli', 'rcd', 'earth', 'pat', 'other')),
  make            text not null default '',
  model           text not null default '',
  serial          text not null default '',
  asset_no        text not null default '',
  calibrated_on   date,
  calibration_due date,
  cert_no         text not null default '',
  calibrated_by   text not null default '',
  assigned_to     text not null default '',
  status          text not null default 'active' check (status in ('active', 'retired')),
  notes           text not null default '',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists test_instruments_due_idx on public.test_instruments (calibration_due);
alter table public.test_instruments enable row level security;
