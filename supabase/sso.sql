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

-- Wrong-code limits that a resend can't reset, and atomic checks (so parallel requests can't
-- get extra guesses or extra emails).
alter table public.sso_email_codes add column if not exists failures       int not null default 0;
alter table public.sso_email_codes add column if not exists failures_since timestamptz not null default now();

-- Store a new code unless one went out in the last 2 minutes or the person is locked out
-- (10 wrong codes in 24 hours). Returns true when stored.
create or replace function public.sso_store_code(p_user uuid, p_email text, p_hash text, p_expires timestamptz)
returns boolean language sql security definer set search_path = public as $$
  with saved as (
    insert into public.sso_email_codes as c (user_id, email, code_hash, expires_at, attempts, sent_at, failures, failures_since)
    values (p_user, p_email, p_hash, p_expires, 0, now(), 0, now())
    on conflict (user_id) do update
      set email = excluded.email, code_hash = excluded.code_hash, expires_at = excluded.expires_at,
          attempts = 0, sent_at = now(),
          failures = case when c.failures_since < now() - interval '24 hours' then 0 else c.failures end,
          failures_since = case when c.failures_since < now() - interval '24 hours' then now() else c.failures_since end
      where c.sent_at < now() - interval '2 minutes'
        and not (c.failures >= 10 and c.failures_since >= now() - interval '24 hours')
    returning 1
  )
  select exists (select 1 from saved);
$$;

-- Use up one try before comparing, and count it as a failure up front (given back on a correct
-- code), so parallel guesses can't exceed 5 per code or 10 wrong codes per 24 hours. Nothing
-- comes back once those are used, the code has expired, or the person is locked out.
drop function if exists public.sso_take_attempt(uuid);
create or replace function public.sso_take_attempt(p_user uuid)
returns table (code_hash text, email text, attempts int) language sql security definer set search_path = public as $$
  update public.sso_email_codes c
     set attempts = c.attempts + 1,
         failures = case when c.failures_since < now() - interval '24 hours' then 1 else c.failures + 1 end,
         failures_since = case when c.failures_since < now() - interval '24 hours' then now() else c.failures_since end
   where c.user_id = p_user and c.attempts < 5 and c.expires_at > now()
     and not (c.failures >= 10 and c.failures_since >= now() - interval '24 hours')
  returning c.code_hash, c.email, c.attempts;
$$;

-- A correct code: give back the failure counted for it, and retire the code.
create or replace function public.sso_code_used(p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.sso_email_codes
     set failures = greatest(failures - 1, 0), expires_at = now()
   where user_id = p_user;
$$;

drop function if exists public.sso_record_failure(uuid);

-- Server only: not callable by signed-in users or the public API.
revoke all on function public.sso_store_code(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sso_take_attempt(uuid) from public, anon, authenticated;
revoke all on function public.sso_code_used(uuid) from public, anon, authenticated;
grant execute on function public.sso_store_code(uuid, text, text, timestamptz) to service_role;
grant execute on function public.sso_take_attempt(uuid) to service_role;
grant execute on function public.sso_code_used(uuid) to service_role;
