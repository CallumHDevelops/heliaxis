-- Quote builder (Sales > Quotes). Run once in the Supabase SQL editor.
-- A quote belongs to an opportunity (crm_projects). Sending it makes a PDF (a crm_documents "quote"
-- row) and uses the existing send-for-signing flow: customer link, signature, deposit, Won.

create sequence if not exists public.crm_quote_seq;

create table if not exists public.crm_quotes (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('Q-' || lpad(nextval('public.crm_quote_seq')::text, 4, '0')),
  project_id    uuid not null references public.crm_projects(id) on delete cascade,
  enquiry_id    uuid not null references public.enquiries(id) on delete cascade,
  title         text not null default 'Your Heliaxis quote',
  status        text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired')),
  content       jsonb not null default '{}'::jsonb,   -- { intro, blocks: [...] } (src/lib/quotes/types.ts)
  valid_until   date,
  deposit_pence integer,                              -- asked for once they sign (crm_projects.deposit_amount)
  document_id   uuid references public.crm_documents(id) on delete set null,
  sent_at       timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_quotes_project_idx on public.crm_quotes (project_id, created_at desc);
create index if not exists crm_quotes_status_idx  on public.crm_quotes (status, updated_at desc);
alter table public.crm_quotes enable row level security;

-- The installation dates a customer asks for after accepting (portal: "Choose your installation date").
-- { dates: ['2026-12-01', ...], flexible: bool, notes: text, at: iso }. The office confirms the real date.
alter table public.crm_projects add column if not exists install_pref jsonb;
