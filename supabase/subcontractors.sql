-- 10. Subcontractor portal (subcontractor.heliaxis.co.uk).
--     Heliaxis adds a subcontractor in /admin/subcontractors → they get an emailed
--     magic link → fill in Schedule B details, e-sign the Framework Agreement and
--     upload ID / qualifications / cards / insurance → Heliaxis countersigns.
--     Files live in the PRIVATE storage bucket 'subcontractor-docs' (auto-created).
create table if not exists public.subcontractors (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,               -- HLX-SC-2026-001
  company_name     text not null,
  contact_name     text not null,
  email            text not null,
  phone            text,
  trade            text,
  status           text not null default 'invited'
                   check (status in ('invited','in_progress','awaiting_countersign','active','suspended','terminated')),
  rate_option      text not null default 'default' check (rate_option in ('default','bespoke')),
  bespoke_rates    jsonb not null default '[]'::jsonb, -- [{trade, rate, basis}]
  details          jsonb not null default '{}'::jsonb, -- Schedule B + bank + operatives
  details_completed_at timestamptz,
  docs_submitted_at    timestamptz,
  token_hash       text unique,                        -- sha256 of the magic-link token
  token_created_at timestamptz,
  invited_at       timestamptz,
  last_seen_at     timestamptz,
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now()
);

create table if not exists public.subcontractor_agreements (
  id                uuid primary key default gen_random_uuid(),
  subcontractor_id  uuid not null references public.subcontractors(id) on delete cascade,
  version           text not null,
  content_hash      text not null,                     -- sha256 of the exact agreement as signed
  snapshot          jsonb not null,                    -- party details + rates at signing
  sub_name          text not null,
  sub_title         text,
  sub_signature     text not null,                     -- PNG data URL
  sub_signed_at     timestamptz not null default now(),
  sub_ip            text,
  sub_user_agent    text,
  hlx_name          text,
  hlx_title         text,
  hlx_signature     text,
  hlx_signed_at     timestamptz,
  hlx_signed_by     text,                              -- admin email
  hlx_ip            text,
  created_at        timestamptz not null default now()
);
create index if not exists subcontractor_agreements_sub_idx
  on public.subcontractor_agreements (subcontractor_id, created_at desc);

create table if not exists public.subcontractor_documents (
  id                uuid primary key default gen_random_uuid(),
  subcontractor_id  uuid not null references public.subcontractors(id) on delete cascade,
  category          text not null,
  label             text,
  operative_name    text,
  reference         text,
  cover_amount      text,
  expires_on        date,
  storage_path      text not null,
  file_name         text not null,
  mime              text,
  size_bytes        bigint,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note       text,
  reviewed_by       text,
  reviewed_at       timestamptz,
  uploaded_at       timestamptz not null default now()
);
create index if not exists subcontractor_documents_sub_idx
  on public.subcontractor_documents (subcontractor_id, uploaded_at desc);

create table if not exists public.subcontractor_events (
  id                uuid primary key default gen_random_uuid(),
  subcontractor_id  uuid not null references public.subcontractors(id) on delete cascade,
  actor             text not null,                     -- 'subcontractor' | admin email | 'system'
  type              text not null,
  detail            jsonb,
  ip                text,
  created_at        timestamptz not null default now()
);
create index if not exists subcontractor_events_sub_idx
  on public.subcontractor_events (subcontractor_id, created_at desc);

alter table public.subcontractors           enable row level security;
alter table public.subcontractor_agreements enable row level security;
alter table public.subcontractor_documents  enable row level security;
alter table public.subcontractor_events     enable row level security;
-- No policies: only the service-role key (server code) can read/write. Subcontractors
-- never touch Supabase directly — every portal request is checked against their token.
