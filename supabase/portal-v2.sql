-- 13. Subcontractor portal v2: secure sign-in, the firm's own team, job
--     assignments from RAMS, and a fingerprint ledger of every document RAMS pulls.
--     Safe to re-run. All tables are service-role only (RLS on, no policies).

-- Sign-in: a 6-digit code emailed to the subcontractor's address, exchanged for
-- an httpOnly session cookie. Only hashes are stored.
create table if not exists public.subcontractor_login_codes (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid references public.subcontractors(id) on delete cascade,
  email            text not null,
  code_hash        text not null,
  expires_at       timestamptz not null,
  attempts         integer not null default 0,
  used_at          timestamptz,
  ip               text,
  created_at       timestamptz not null default now()
);
create index if not exists sc_login_codes_email_idx on public.subcontractor_login_codes (lower(email), created_at desc);
create index if not exists sc_login_codes_ip_idx    on public.subcontractor_login_codes (ip, created_at desc);

create table if not exists public.subcontractor_sessions (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  token_hash       text not null unique,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  last_seen_at     timestamptz,
  revoked_at       timestamptz,
  ip               text,
  user_agent       text
);
create index if not exists sc_sessions_sub_idx on public.subcontractor_sessions (subcontractor_id);

-- The people a firm sends to site, managed by the firm itself.
create table if not exists public.subcontractor_operatives (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  full_name        text not null check (btrim(full_name) <> ''),
  role             text,
  phone            text,
  email            text,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists sc_operatives_sub_idx on public.subcontractor_operatives (subcontractor_id);

alter table public.subcontractor_documents
  add column if not exists operative_id uuid references public.subcontractor_operatives(id) on delete set null;

-- One-off migration from the old free-text "operatives" box and operative names on documents.
insert into public.subcontractor_operatives (subcontractor_id, full_name)
select distinct s.id, btrim(n)
  from public.subcontractors s,
       regexp_split_to_table(coalesce(s.details->>'operatives', ''), E'\n') as n
 where btrim(n) <> ''
   and not exists (select 1 from public.subcontractor_operatives o
                    where o.subcontractor_id = s.id and lower(o.full_name) = lower(btrim(n)));
insert into public.subcontractor_operatives (subcontractor_id, full_name)
select distinct d.subcontractor_id, btrim(d.operative_name)
  from public.subcontractor_documents d
 where btrim(coalesce(d.operative_name, '')) <> ''
   and not exists (select 1 from public.subcontractor_operatives o
                    where o.subcontractor_id = d.subcontractor_id and lower(o.full_name) = lower(btrim(d.operative_name)));
update public.subcontractor_documents d
   set operative_id = o.id
  from public.subcontractor_operatives o
 where d.operative_id is null
   and o.subcontractor_id = d.subcontractor_id
   and lower(o.full_name) = lower(btrim(d.operative_name));

-- A firm booked onto a RAMS document; the firm chooses its crew.
create table if not exists public.subcontractor_assignments (
  id                  uuid primary key default gen_random_uuid(),
  subcontractor_id    uuid not null references public.subcontractors(id) on delete cascade,
  status              text not null default 'awaiting_crew'
                      check (status in ('awaiting_crew','crew_confirmed','declined','cancelled')),
  rams_project_id     text not null,
  rams_project_ref    text,
  rams_project_name   text not null,
  site_address        text,
  rams_document_id    text not null,
  rams_document_title text,
  scope               text,
  start_date          date,
  crew                uuid[] not null default '{}',
  decline_reason      text,
  requested_by_name   text,
  requested_by_email  text,
  confirmed_at        timestamptz,
  webhook_status      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (subcontractor_id, rams_document_id)
);
create index if not exists sc_assignments_doc_idx on public.subcontractor_assignments (rams_document_id);

-- Append-only record of every document handed to RAMS: which file (sha256 of
-- its bytes), for which project and RAMS document, when and for whom.
create table if not exists public.subcontractor_document_pulls (
  id                  uuid primary key default gen_random_uuid(),
  subcontractor_id    uuid not null references public.subcontractors(id) on delete cascade,
  document_id         uuid references public.subcontractor_documents(id) on delete set null,
  assignment_id       uuid references public.subcontractor_assignments(id) on delete set null,
  category            text,
  title               text,
  file_name           text,
  sha256              text not null,
  rams_project_id     text,
  rams_project_ref    text,
  rams_project_name   text,
  rams_document_id    text,
  rams_document_title text,
  pulled_by_name      text,
  pulled_by_email     text,
  ip                  text,
  pulled_at           timestamptz not null default now()
);
create index if not exists sc_pulls_sub_idx on public.subcontractor_document_pulls (subcontractor_id, pulled_at desc);
create index if not exists sc_pulls_doc_idx on public.subcontractor_document_pulls (document_id);

alter table public.subcontractor_login_codes    enable row level security;
alter table public.subcontractor_sessions       enable row level security;
alter table public.subcontractor_operatives     enable row level security;
alter table public.subcontractor_assignments    enable row level security;
alter table public.subcontractor_document_pulls enable row level security;

-- Expiry chasers: one row per (document, threshold) so each reminder goes once.
create table if not exists public.subcontractor_reminders (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  document_id      uuid not null references public.subcontractor_documents(id) on delete cascade,
  threshold_days   integer not null,
  expires_on       date not null,
  sent_to          text,
  sent_at          timestamptz not null default now(),
  unique (document_id, threshold_days, expires_on)
);
alter table public.subcontractor_reminders enable row level security;
