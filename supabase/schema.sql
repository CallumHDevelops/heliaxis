-- Heliaxis admin auth schema
-- Run this in Supabase → SQL Editor (once) after creating your project.

-- 1. Profiles table: one row per registered user, holding role + approval status.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'member'  check (role in ('member','admin')),
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Helper: is the given user an approved admin?
--    SECURITY DEFINER so it can read profiles without triggering RLS recursion.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin' and status = 'approved'
  );
$$;

-- 3. RLS policies
drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "admins read all"    on public.profiles;
drop policy if exists "admins update all"  on public.profiles;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "admins read all" on public.profiles
  for select using (public.is_admin(auth.uid()));

create policy "admins update all" on public.profiles
  for update using (public.is_admin(auth.uid()));

-- 4. Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Seed the FIRST admin (you). Register once at /register first, then run:
--    update public.profiles set role = 'admin', status = 'approved'
--    where email = 'callum@heliaxis.co.uk';

-- 6. Enquiries: captured from the website "free quote" form.
create table if not exists public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  phone         text,
  postcode      text,
  interest      text,
  property_type text,
  source        text not null default 'quote-form',
  status        text not null default 'new'
                check (status in ('new','contacted','qualified','won','lost')),
  created_at    timestamptz not null default now()
);

alter table public.enquiries enable row level security;
-- No policies: only the service-role key (server code) can read/write.
-- The public/anon key has no access, so leads can't be scraped from the browser.

-- 7. CMS key/value store: holds the page-builder document(s) as JSON text.
--    key 'heliaxis-cms-v1' = working draft, 'heliaxis-cms-published' = live snapshot.
create table if not exists public.cms_kv (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.cms_kv enable row level security;
-- No policies: only the service-role key (server code) can read/write.

-- 8. Feedback: bug reports & feature requests raised from the CMS.
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'bug'  check (type in ('bug','feature')),
  title      text not null,
  detail     text,
  page_url   text,
  status     text not null default 'open'
             check (status in ('open','in_progress','fixed','wontfix')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
-- No policies: only the service-role key (server code) can read/write.

-- 9. Click heatmap: anonymised click positions from public pages (heatmap.js viewer).
create table if not exists public.heatmap_clicks (
  id         uuid primary key default gen_random_uuid(),
  path       text not null,
  x_pct      real not null check (x_pct >= 0 and x_pct <= 100),
  y_pct      real not null check (y_pct >= 0 and y_pct <= 100),
  vw         integer,
  vh         integer,
  doc_h      integer,
  created_at timestamptz not null default now()
);

create index if not exists heatmap_clicks_path_created_idx
  on public.heatmap_clicks (path, created_at desc);

create index if not exists heatmap_clicks_created_idx
  on public.heatmap_clicks (created_at desc);

alter table public.heatmap_clicks enable row level security;
-- No policies: only the service-role key (server code) can read/write.

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

-- 11. Per-portal access for the main users database (/admin/users).
--     Admins can open every portal; members only the ones listed here.
--     Keys: cms, enquiries, analytics, subcontractors, social, rams (see src/lib/portals.ts).
alter table public.profiles
  add column if not exists portals text[] not null default '{}';

-- Keep existing approved members' current access (CMS + enquiries) — only rows never set.
update public.profiles
   set portals = array['cms','enquiries']
 where role = 'member' and status = 'approved' and portals = '{}';

-- 12. Subcontractor → RAMS sync. Remembers which RAMS rows each portal record
--     became, so re-syncing updates rather than duplicates.
alter table public.subcontractors
  add column if not exists rams_id         uuid,
  add column if not exists rams_synced_at  timestamptz,
  add column if not exists rams_sync_error text;

alter table public.subcontractor_documents
  add column if not exists rams_table     text,
  add column if not exists rams_row_id    uuid,
  add column if not exists rams_path      text,
  add column if not exists rams_synced_at timestamptz;

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
