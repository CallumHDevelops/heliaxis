-- One-tap sign-in to RAMS (src/lib/sso.ts). Heliaxis sign-ups don't confirm email addresses,
-- so before the CRM vouches for someone to RAMS they prove the address once with a code
-- emailed to it and typed in while signed in. Server-only (service role); no RLS policies.
-- Safe to run twice.
create table if not exists public.sso_email_proofs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  proven_at  timestamptz not null default now()
);

create table if not exists public.sso_email_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  sent_at    timestamptz not null default now()
);

alter table public.sso_email_proofs enable row level security;
alter table public.sso_email_codes  enable row level security;
