-- Solar estimator quotes: each "Send me my full quote" request from heliaxis.co.uk/solar-estimator.
-- Run once in Supabase → SQL Editor. Safe to run again.
--   reference     HX-EST-XXXXXX, what the customer, the PDF and the WhatsApp "Please send my estimate" message quote
--   inputs/result the answers the visitor gave and the figures the server worked out from them (never the browser's prices)
--   pdf_path      the PDF in the private documents bucket, under a non-guessable path
--   consent       what they agreed to, when, and the exact wording on screen (version string)
--   sends         a log of every email and WhatsApp sent for it: [{ channel, at, id, ok, error }]

create table if not exists public.estimator_quotes (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  enquiry_id  uuid references public.enquiries(id) on delete set null,
  created_at  timestamptz not null default now(),
  delivery    text not null default 'both',
  inputs      jsonb not null default '{}'::jsonb,
  result      jsonb not null default '{}'::jsonb,
  pdf_path    text,
  consent     jsonb not null default '{}'::jsonb,
  sends       jsonb not null default '[]'::jsonb,
  meta_event_id text
);
create index if not exists estimator_quotes_enquiry_idx on public.estimator_quotes (enquiry_id);
alter table public.estimator_quotes enable row level security;
