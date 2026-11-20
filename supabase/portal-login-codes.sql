-- Customer portal sign-in codes (src/lib/crm/portal-codes.ts). Signing in at portal.heliaxis.co.uk with
-- a postcode and a project number / surname / serial now also needs a 6-digit code, sent by text (The SMS
-- Works) or email to the contact details already on the job. One row per code sent. Only a keyed hash of
-- the code is kept; a code lasts 10 minutes, allows 5 tries and works once. The private link we send
-- customers needs no code. Safe to run again.

create table if not exists public.portal_login_codes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.crm_projects(id) on delete cascade,
  code_hash   text not null,
  channel     text not null check (channel in ('sms', 'email')),
  sent_to     text not null,            -- masked, as shown to the customer (07••• •••123)
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  used_at     timestamptz,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists portal_login_codes_project_idx on public.portal_login_codes (project_id, created_at desc);
create index if not exists portal_login_codes_ip_idx on public.portal_login_codes (ip, created_at desc);

-- Server only (service role): no policies, so nothing can be read or written from a browser.
alter table public.portal_login_codes enable row level security;
notify pgrst, 'reload schema';
