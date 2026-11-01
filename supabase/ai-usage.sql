-- AI cost log: one row per model call, from every feature (quote proposal reading, the quote writers, handover and photo reading,
-- the blog and the assistant). The Analytics > AI costs page adds these up. Safe to re-run. Server-only: RLS on, no policies.
create table if not exists public.ai_usage (
  id                 bigint generated always as identity primary key,
  at                 timestamptz not null default now(),
  feature            text not null,            -- proposal_read | quote_intro | quote_included | mcs_read | label_read | blog | assistant
  ref                text,                     -- what it was for (a quote's id, for the quote features)
  model              text not null,
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd           numeric(12,6) not null default 0
);
create index if not exists ai_usage_at on public.ai_usage (at desc);
create index if not exists ai_usage_ref on public.ai_usage (ref) where ref is not null;
alter table public.ai_usage enable row level security;
