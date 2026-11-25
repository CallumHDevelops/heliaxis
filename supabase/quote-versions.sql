-- 29. Quote versions: every change Metis makes to a draft quote is saved as a new version and the old one is kept.
--     Quotes are never overwritten without a copy. Additive and safe to re-run. Server-only (RLS on, no policies).
--     Run after quotes.sql.
--
-- One row per version of a quote: its content as it was, what the design inputs were (so a change to the panel count can
-- re-run the design checks), a short summary and the exact list of changes from the version before.

create table if not exists public.crm_quote_versions (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references public.crm_quotes(id) on delete cascade,
  version          integer not null check (version >= 1),
  title            text not null,
  content          jsonb not null,
  valid_until      date,
  meta             jsonb not null default '{}'::jsonb,
  summary          text,
  changes          jsonb not null default '[]'::jsonb,
  total_gross_pence integer,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (quote_id, version)
);
create index if not exists crm_quote_versions_quote_idx on public.crm_quote_versions (quote_id, version desc);
alter table public.crm_quote_versions enable row level security;
