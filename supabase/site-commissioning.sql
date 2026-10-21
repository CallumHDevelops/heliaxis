-- 32. Site commissioning: the trades on a job (roofer, scaffolder, electrician, other), their no-login
--     job packs, answers, photos and sign-offs, one labour purchase order per sign-off, and the job
--     document registry the handover pack is built from.
--     Run after purchase-orders.sql and portal-v2.sql. Safe to run twice. Server-only tables (RLS on,
--     no policies): the site app reaches them through the server with its own device tokens.
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'purchase_order_lines') then
    raise exception 'Run purchase-orders.sql first, then this file.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subcontractor_operatives') then
    raise exception 'Run portal-v2.sql first, then this file.';
  end if;
end $$;

-- Job documents: which handover item a document is, versions of generated ones, and archiving.
alter table public.crm_documents add column if not exists handover_slot text;   -- src/lib/handover/slots.ts; null = not in the pack
alter table public.crm_documents add column if not exists release       text not null default 'now' check (release in ('now','with_pack'));
alter table public.crm_documents add column if not exists source        text check (source in ('upload','generated','library','site'));
alter table public.crm_documents add column if not exists generated_key text;   -- 'F43', 'RF_REPORT', 'PO-0123' …
alter table public.crm_documents add column if not exists version       int not null default 1;
alter table public.crm_documents add column if not exists inputs_hash   text;   -- what a generated document was made from
alter table public.crm_documents add column if not exists archived_at   timestamptz;
alter table public.crm_documents add column if not exists archived_by   uuid references public.profiles(id) on delete set null;
alter table public.crm_documents drop constraint if exists crm_documents_category_check;
alter table public.crm_documents add constraint crm_documents_category_check check (category in
  ('quote','invoice','dno','mcs','warranty','handover','design','contract','receipt','other','commissioning','certificate','po'));
create index if not exists crm_documents_slot_idx on public.crm_documents (project_id, handover_slot)
  where handover_slot is not null and archived_at is null;
create index if not exists crm_documents_generated_idx on public.crm_documents (project_id, generated_key, version desc)
  where generated_key is not null;

-- People who go to site: a firm's contact or operative, or a quick contact typed in on the spot.
create table if not exists public.site_contacts (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid references public.subcontractors(id) on delete set null,
  operative_id     uuid references public.subcontractor_operatives(id) on delete set null,
  name             text not null check (length(btrim(name)) between 1 and 120),
  company          text,
  email            text,
  mobile           text,
  wa_id            text,                                -- toWaId(mobile)
  whatsapp_ok      boolean not null default false,      -- agreed to job messages on WhatsApp
  whatsapp_ok_at   timestamptz,
  whatsapp_ok_by   uuid references public.profiles(id) on delete set null,
  trades           text[] not null default '{}',
  scheme           text,                                -- NAPIT / NICEIC …, for the EIC and Part P
  scheme_number    text,
  part_p_by        text check (part_p_by in ('self','heliaxis')),
  instruments      jsonb not null default '[]'::jsonb,  -- test instruments remembered from the last job
  vat_number       text,                                -- quick contacts (firms: subcontractors.details.vatNumber)
  cis_rate         text check (cis_rate in ('gross','net','higher')),  -- quick contacts once verified; null = not verified (30%)
  cis_verified_on  date,
  archived_at      timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists site_contacts_sub_idx on public.site_contacts (subcontractor_id) where subcontractor_id is not null;
create index if not exists site_contacts_wa_idx  on public.site_contacts (wa_id) where wa_id is not null and archived_at is null;

-- A phone signed in to the site app for one person. Only a hash of its token is stored.
create table if not exists public.site_devices (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.site_contacts(id) on delete cascade,
  token_hash   text not null unique,
  standalone   boolean not null default false,
  user_agent   text,
  ip           text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at   timestamptz not null,                    -- 90 days after last use
  revoked_at   timestamptz
);
create index if not exists site_devices_contact_idx on public.site_devices (contact_id);

-- One trade on one job.
create table if not exists public.site_assignments (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.crm_projects(id) on delete cascade,
  contact_id           uuid not null references public.site_contacts(id) on delete restrict,
  trade                text not null check (trade in ('roofer','scaffolder','electrician','other')),
  trade_label          text,
  scope                text,
  forms                text[] not null default '{}',     -- src/lib/site/forms (electrician paperwork)
  cert_route           text not null default 'eic' check (cert_route in ('eic','eic_single','meiwc','own')),
  starts_on            date,
  days                 numeric(5,1) check (days > 0),
  rate_pence           bigint check (rate_pence >= 0),   -- ex VAT; null = not agreed yet (the PO is held)
  rate_basis           text check (rate_basis in ('fixed','per_panel','per_day','per_hour')),
  rate_qty             numeric(10,2) check (rate_qty > 0),
  raise_po             boolean not null default true,
  vat_treatment        text check (vat_treatment in ('none','reverse_charge','standard','zero')),  -- null = not chosen yet (D9)
  vat_note             text,
  cis_override         text check (cis_override in ('gross','net','higher')),
  share_customer_phone boolean not null default true,
  note_to_trade        text,
  status               text not null default 'draft'
                       check (status in ('draft','sent','opened','started','signed','done','cancelled')),
  link_hash            text unique,
  link_generation      int not null default 0,
  link_created_at      timestamptz,
  sent_at              timestamptz,
  opened_at            timestamptz,
  started_at           timestamptz,
  signed_at            timestamptz,
  done_at              timestamptz,
  cancelled_at         timestamptz,
  answers              jsonb not null default '{}'::jsonb,  -- keyed by FORMS keys: {key: {v, src, at}}
  rev                  int not null default 0,
  answers_saved_at     timestamptz,
  flags                jsonb not null default '[]'::jsonb,
  schema_version       int not null default 1,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists site_assignments_project_idx on public.site_assignments (project_id, created_at);
create index if not exists site_assignments_contact_idx on public.site_assignments (contact_id, status);

-- Sign-offs. One per stage: a retried sign-off finds the first one.
create table if not exists public.site_signoffs (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.site_assignments(id) on delete cascade,
  stage          text not null check (stage in ('main','erection','strike')),
  signed_name    text not null,
  signature_path text not null,                -- crm-docs: signatures/{project}/site-{id}.png
  signed_at      timestamptz not null,         -- the phone's time (server time if more than 72 h out)
  received_at    timestamptz not null default now(),
  device_id      uuid references public.site_devices(id) on delete set null,
  ip             text,
  user_agent     text,
  declaration    text not null,
  answers_hash   text not null,                -- sha256 of canonical JSON of the answers + photo ids signed
  flags          jsonb not null default '[]'::jsonb,
  extra          jsonb not null default '{}'::jsonb,  -- customer signatures taken after it (F16E, G98)
  po_done_at     timestamptz,                  -- steps after the reply; the cron finishes any left
  docs_done_at   timestamptz,
  notified_at    timestamptz,
  unique (assignment_id, stage)
);

-- Phone operations already applied (replays are no-ops). Pruned after 60 days by /api/cron/site.
create table if not exists public.site_ops (
  assignment_id uuid not null references public.site_assignments(id) on delete cascade,
  op_id         uuid not null,
  kind          text not null,
  at            timestamptz not null default now(),
  primary key (assignment_id, op_id)
);

-- Label and data-badge photos read by Claude: suggestions until a person confirms.
create table if not exists public.site_reads (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.site_assignments(id) on delete cascade,
  photo_id      uuid not null unique references public.crm_photos(id) on delete cascade,
  key           text not null,                 -- SN_INV, RF12, RF7b …
  status        text not null default 'queued' check (status in ('queued','read','unreadable','failed')),
  result        jsonb,
  model         text,
  attempts      int not null default 0,
  read_at       timestamptz
);
-- Checked against the photo by someone in the office (the review drawer's Confirm).
alter table public.site_reads add column if not exists confirmed_at timestamptz;
alter table public.site_reads add column if not exists confirmed_by uuid references public.profiles(id) on delete set null;

-- What happened (opened, synced, overwritten values, flags, messages), for the Site tab and disputes.
create table if not exists public.site_events (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.site_assignments(id) on delete cascade,
  actor         text not null,                 -- 'trade' | staff email | 'system'
  type          text not null,
  detail        jsonb,
  ip            text,
  at            timestamptz not null default now()
);
create index if not exists site_events_assignment_idx on public.site_events (assignment_id, at desc);
create index if not exists site_events_ip_idx on public.site_events (ip, at desc) where type = 'open_failed';

-- Emails and WhatsApps to trades: each once (dedupe_key), held through the evening rule.
create table if not exists public.site_messages (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.site_assignments(id) on delete cascade,
  channel       text not null check (channel in ('email','whatsapp')),
  kind          text not null,                 -- job_pack | po | strike | clear_to_start | scaffold_hold
  dedupe_key    text not null unique,
  to_address    text not null,
  template      text,
  params        jsonb,
  status        text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  send_after    timestamptz not null default now(),
  sent_at       timestamptz,
  provider_id   text,                          -- Resend id / WhatsApp message id
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists site_messages_due_idx on public.site_messages (send_after) where status = 'queued';

-- Trade photos are ordinary job photos (category 'site'), tied to the assignment and the form's slot.
alter table public.crm_photos add column if not exists assignment_id uuid references public.site_assignments(id) on delete set null;
alter table public.crm_photos add column if not exists taken_at      timestamptz;
alter table public.crm_photos add column if not exists slot          text;   -- also added by surveys.sql, which may not have run
create index if not exists crm_photos_assignment_idx on public.crm_photos (assignment_id, slot) where assignment_id is not null;

-- Labour purchase orders in the same register and number series as supplier ones.
alter table public.purchase_orders add column if not exists kind          text not null default 'supply';
alter table public.purchase_orders alter column supplier_id drop not null;
alter table public.purchase_orders add column if not exists assignment_id uuid references public.site_assignments(id) on delete set null;
alter table public.purchase_orders add column if not exists signoff_id    uuid unique references public.site_signoffs(id) on delete set null;
alter table public.purchase_orders add column if not exists labour        jsonb;  -- everything printed, frozen at issue
alter table public.purchase_orders add column if not exists cis_pence     bigint check (cis_pence >= 0);
alter table public.purchase_orders add column if not exists payable_pence bigint check (payable_pence >= 0);
alter table public.purchase_orders add column if not exists changed_since_sent boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_kind_chk') then
    alter table public.purchase_orders add constraint purchase_orders_kind_chk
      check (kind in ('supply','labour') and (kind = 'labour' or supplier_id is not null));
  end if;
end $$;
alter table public.purchase_order_lines add column if not exists cis boolean not null default true;  -- labour lines; false = materials

-- Answers from a phone, applied per key without touching the others. Returns the new rev (null: locked
-- or gone). p_late: keys still open after a sign-off (the scaffold strike SS*, and SC3/SC3p "tagged
-- now"); the server only passes those keys with it.
create or replace function public.site_answers_patch(p_assignment uuid, p_set jsonb, p_unset text[], p_late boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare r int;
begin
  update public.site_assignments
     set answers = (answers - coalesce(p_unset, '{}')) || coalesce(p_set, '{}'::jsonb),
         rev = rev + 1, answers_saved_at = now(), updated_at = now(),
         started_at = coalesce(started_at, now()),
         status = case when status in ('sent','opened') then 'started' else status end
   where id = p_assignment
     and (status in ('sent','opened','started') or (p_late and status = 'signed'))
  returning rev into r;
  return r;
end $$;
revoke execute on function public.site_answers_patch(uuid, jsonb, text[], boolean) from public, anon, authenticated;
grant  execute on function public.site_answers_patch(uuid, jsonb, text[], boolean) to service_role;

alter table public.site_contacts    enable row level security;
alter table public.site_devices     enable row level security;
alter table public.site_assignments enable row level security;
alter table public.site_signoffs    enable row level security;
alter table public.site_ops         enable row level security;
alter table public.site_reads       enable row level security;
alter table public.site_events      enable row level security;
alter table public.site_messages    enable row level security;

-- Optional: send messages held overnight and chase scaffold strikes every 5 minutes, like whatsapp.sql.
-- select cron.schedule('heliaxis-site', '*/5 * * * *', $$ select net.http_get(
--   url := 'https://heliaxis.co.uk/api/cron/site', headers := '{"Authorization":"Bearer <CRON_SECRET>"}'::jsonb) $$);

notify pgrst, 'reload schema';
