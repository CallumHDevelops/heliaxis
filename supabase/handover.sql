-- 33. Handover pack: Not-needed marks per item, the combined PDF and when it went to the customer,
--     library documents per product model, and payments recorded against a job.
--     Run after site-commissioning.sql. Safe to run twice. Server-only tables (RLS on, no policies).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'crm_documents' and column_name = 'handover_slot') then
    raise exception 'Run site-commissioning.sql first, then this file.';
  end if;
end $$;

-- Per job: an item marked Not needed (with why), or a note.
create table if not exists public.handover_slots (
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  slot       text not null,
  na         boolean not null default false,
  na_reason  text,
  note       text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, slot)
);

-- Per job: the combined PDF as last built, and when it went to the customer.
create table if not exists public.handover_packs (
  project_id          uuid primary key references public.crm_projects(id) on delete cascade,
  version             int not null default 0,
  document_id         uuid references public.crm_documents(id) on delete set null,
  contents            jsonb,                   -- [{slot, document_id, first_page, pages} | {slot, separate: true}]
  built_at            timestamptz,
  built_by            uuid references public.profiles(id) on delete set null,
  sent_at             timestamptz,
  sent_by             uuid references public.profiles(id) on delete set null,
  sent_via            text[] not null default '{}',
  invoice_prompted_at timestamptz
);

-- Library documents that belong in packs: which item, which technologies, which product models.
alter table public.crm_library add column if not exists kind          text check (kind in ('datasheet','manual','warranty','procedure','guide'));
alter table public.crm_library add column if not exists handover_slot text;
alter table public.crm_library add column if not exists technologies  text[] not null default '{}';
alter table public.crm_library add column if not exists models        text[] not null default '{}';
alter table public.crm_library add column if not exists details       jsonb not null default '{}'::jsonb;  -- per model: ENA product id, service interval + source, aliases
alter table public.crm_library add column if not exists compact_path  text;
alter table public.crm_library add column if not exists every_pack    boolean not null default false;
alter table public.crm_library add column if not exists archived_at   timestamptz;

-- Payments the office records against a job (the Stripe deposit stays on crm_projects). Amounts are
-- typed from the invoice; the app never works one out.
create table if not exists public.crm_payments (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.crm_projects(id) on delete cascade,
  kind                text not null check (kind in ('stage','final','other')),
  amount_pence        bigint not null check (amount_pence > 0),
  paid_on             date not null,
  method              text not null check (method in ('card','bank_transfer','other')),
  reference           text,
  invoice_document_id uuid references public.crm_documents(id) on delete set null,
  recorded_by         uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists crm_payments_project_idx on public.crm_payments (project_id, paid_on);

alter table public.handover_slots enable row level security;
alter table public.handover_packs enable row level security;
alter table public.crm_payments   enable row level security;
notify pgrst, 'reload schema';
