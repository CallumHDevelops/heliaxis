-- 28. Survey booking and the diary: holds and bookings with a no-overlap rule, a per-day change counter
--     (so two customers can't take neighbouring times), Callum's own diary entries, the Outlook copy of
--     surveys, installs and diary entries, a postcode cache and rate limits for the public form.
--     Run after surveys.sql. Safe to re-run.

-- The triggers below read crm-v3.sql's columns: without them every save of a job would fail.
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'crm_projects' and column_name = 'install_team')
     or to_regclass('public.crm_surveys') is null then
    raise exception 'Run crm-v3.sql and then surveys.sql first, then this file.';
  end if;
end $$;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.survey_bookings (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.crm_projects(id) on delete cascade,   -- null while a website hold has no customer yet
  enquiry_id    uuid references public.enquiries(id) on delete cascade,
  surveyor_key  text not null,                     -- the surveyor's Outlook address, lower case
  surveyor_id   uuid references public.profiles(id) on delete set null,
  status        text not null check (status in ('held','requested','confirmed','cancelled','expired')),
  survey_type   text not null check (survey_type in ('solar','ashp','solar_ashp')),
  minutes       int  not null check (minutes between 15 and 480),
  onsite        tstzrange not null,                -- [start, end) at the customer's
  day           date not null,                     -- UK date of the start, set by the functions below
  postcode      text not null,
  lat           double precision,
  lng           double precision,
  address       text,
  source        text not null default 'link' check (source in ('link','website','staff')),
  expires_at    timestamptz,                       -- holds, and requests nobody confirmed
  confirmed_at  timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,
  booked_by     uuid references public.profiles(id) on delete set null,
  overridden    boolean not null default false,    -- staff "Book anyway" (outside the usual rules)
  would_confirm boolean,                           -- request mode: would instant booking have accepted it?
  duplicate_of  uuid references public.enquiries(id) on delete set null,   -- website booking that matched an existing customer
  reminded_at   timestamptz,
  client_ip     text,                              -- HMAC of the IP (/64 for IPv6)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists survey_bookings_project_idx on public.survey_bookings (project_id, created_at desc);
create index if not exists survey_bookings_day_idx     on public.survey_bookings (surveyor_key, day) where status in ('held','requested','confirmed');
create index if not exists survey_bookings_exp_idx     on public.survey_bookings (expires_at) where status in ('held','requested');
create unique index if not exists survey_bookings_one_live on public.survey_bookings (project_id)
  where status in ('requested','confirmed') and project_id is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'survey_bookings_no_overlap') then
    alter table public.survey_bookings add constraint survey_bookings_no_overlap
      exclude using gist (surveyor_key with =, onsite with &&) where (status in ('held','requested','confirmed'));
  end if;
end $$;

-- One counter per UK day (all surveyors). Bumped whenever time is TAKEN on that day: a booking, a survey or
-- install date set by staff, a diary entry. A booking worked out on an older view of the day is refused.
create table if not exists public.survey_booking_days (
  day     date   primary key,
  version bigint not null default 0
);
create or replace function public.survey_days_bump(p_days date[]) returns void
language sql security definer set search_path = public as $$
  insert into public.survey_booking_days (day, version)
  select distinct d, 1 from unnest(p_days) as d where d is not null
  on conflict (day) do update set version = public.survey_booking_days.version + 1;
$$;

-- Booking link, survey length/type/surveyor, and the Outlook copy on each job.
alter table public.crm_projects add column if not exists booking_token         text unique;
alter table public.crm_projects add column if not exists survey_type           text;  -- solar | ashp | solar_ashp
alter table public.crm_projects add column if not exists survey_minutes        int;
alter table public.crm_projects add column if not exists survey_mailbox        text;
alter table public.crm_projects add column if not exists survey_booking_id     uuid references public.survey_bookings(id) on delete set null;
alter table public.crm_projects add column if not exists survey_event_id       text;
alter table public.crm_projects add column if not exists survey_event_mailbox  text;
alter table public.crm_projects add column if not exists survey_event_hash     text;
alter table public.crm_projects add column if not exists survey_event_at       timestamptz;  -- the start written to Outlook (past copies are left alone)
alter table public.crm_projects add column if not exists install_event_ids     text[] not null default '{}';  -- one all-day event per run of working days
alter table public.crm_projects add column if not exists install_event_mailbox text;
alter table public.crm_projects add column if not exists install_event_hash    text;
alter table public.crm_projects add column if not exists install_event_until   date;         -- last install day written to Outlook
alter table public.crm_projects add column if not exists calendar_dirty_at     timestamptz;  -- set by trigger; the sync clears it
alter table public.crm_projects add column if not exists calendar_claim_at     timestamptz;  -- 2-minute lease so two runs can't both write
alter table public.crm_projects add column if not exists calendar_error        text;
alter table public.crm_projects add column if not exists calendar_error_at     timestamptz;
create index if not exists crm_projects_cal_dirty_idx on public.crm_projects (calendar_dirty_at) where calendar_dirty_at is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_surveys_booking_fk') then
    alter table public.crm_surveys add constraint crm_surveys_booking_fk
      foreign key (booking_id) references public.survey_bookings(id) on delete set null;
  end if;
end $$;

-- Callum's own diary: site visits, installs not in the CRM, meetings, personal time.
create table if not exists public.diary_entries (
  id                uuid primary key default gen_random_uuid(),
  surveyor_key      text not null,                 -- whose diary (lower-case mailbox)
  kind              text not null check (kind in ('site_visit','install','meeting','personal','other')),
  title             text not null default '',
  all_day           boolean not null default false,
  starts_at         timestamptz,                   -- timed entries
  ends_at           timestamptz,
  day_from          date,                          -- all-day entries (inclusive)
  day_to            date,
  where_kind        text not null default 'address' check (where_kind in ('address','home','online')),
  address           text,
  postcode          text,
  lat               double precision,
  lng               double precision,
  project_id        uuid references public.crm_projects(id) on delete set null,
  outlook_event_id  text,
  outlook_mailbox   text,
  outlook_hash      text,
  calendar_dirty_at timestamptz default now(),
  calendar_claim_at timestamptz,
  calendar_error    text,
  deleted_at        timestamptz,                   -- soft delete, so the sync can remove the Outlook copy first
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint diary_entries_when_chk check (
    (all_day and day_from is not null and day_to is not null and day_to >= day_from)
    or (not all_day and starts_at is not null and ends_at is not null and ends_at > starts_at)),
  constraint diary_entries_where_chk check (where_kind <> 'address' or postcode is not null)
);
create index if not exists diary_entries_range_idx on public.diary_entries (surveyor_key, starts_at) where deleted_at is null;
create index if not exists diary_entries_days_idx  on public.diary_entries (surveyor_key, day_from, day_to) where deleted_at is null and all_day;
create index if not exists diary_entries_dirty_idx on public.diary_entries (calendar_dirty_at) where calendar_dirty_at is not null;

-- UK days a job takes up: the survey day and a superset of the install days (weekends included; harmless).
create or replace function public.crm_project_days(p_survey timestamptz, p_install timestamptz, p_days int) returns date[]
language sql stable set search_path = public as $$
  select array_remove(
    array[(p_survey at time zone 'Europe/London')::date]
    || coalesce((select array_agg(d::date) from generate_series(
          (p_install at time zone 'Europe/London')::date,
          (p_install at time zone 'Europe/London')::date + (coalesce(p_days,1) * 2 + 3),
          interval '1 day') as d), '{}'),
    null);
$$;

-- Time taken by staff dates bumps the day (old dates aren't bumped: freeing time never spoils a search).
create or replace function public.crm_projects_days_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.survey_at, new.survey_minutes, new.survey_mailbox, new.install_at, new.install_days, new.install_team, new.stage)
       is not distinct from (old.survey_at, old.survey_minutes, old.survey_mailbox, old.install_at, old.install_days, old.install_team, old.stage) then
    return null;
  end if;
  -- A booking function writing its own survey fields has already handled the day under its lock.
  if tg_op = 'UPDATE' and new.survey_booking_id is not null and new.survey_booking_id is distinct from old.survey_booking_id
     and (new.install_at, new.install_days, new.install_team) is not distinct from (old.install_at, old.install_days, old.install_team) then
    return null;
  end if;
  if new.stage <> 'lost' then
    perform public.survey_days_bump(public.crm_project_days(new.survey_at, new.install_at, new.install_days));
  end if;
  return null;
end $$;
drop trigger if exists crm_projects_days_changed on public.crm_projects;
create trigger crm_projects_days_changed after insert or update on public.crm_projects
  for each row execute function public.crm_projects_days_changed();

-- Only when the entry takes time or moves (the Outlook sync's own updates don't count).
create or replace function public.diary_entries_days_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.surveyor_key, new.all_day, new.starts_at, new.ends_at, new.day_from, new.day_to,
       new.where_kind, new.postcode, new.lat, new.lng, new.deleted_at)
     is not distinct from (old.surveyor_key, old.all_day, old.starts_at, old.ends_at, old.day_from, old.day_to,
       old.where_kind, old.postcode, old.lat, old.lng, old.deleted_at) then
    return null;
  end if;
  if new.deleted_at is null then
    perform public.survey_days_bump(case when new.all_day
      then array(select d::date from generate_series(new.day_from, new.day_to, interval '1 day') d)
      else array(select d::date from generate_series((new.starts_at at time zone 'Europe/London')::date,
                                                      (new.ends_at at time zone 'Europe/London')::date, interval '1 day') d) end);
  end if;
  return null;
end $$;
drop trigger if exists diary_entries_days_changed on public.diary_entries;
create trigger diary_entries_days_changed after insert or update on public.diary_entries
  for each row execute function public.diary_entries_days_changed();

-- Mark a job for the Outlook sync when anything that appears in its Outlook copy changes.
create or replace function public.crm_projects_calendar_dirty() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.survey_at is not null or new.install_at is not null then new.calendar_dirty_at := now(); end if;
  elsif (new.survey_at, new.survey_minutes, new.survey_type, new.survey_mailbox, new.install_at, new.install_days,
         new.install_team, new.address, new.postcode, new.stage, new.title)
        is distinct from
        (old.survey_at, old.survey_minutes, old.survey_type, old.survey_mailbox, old.install_at, old.install_days,
         old.install_team, old.address, old.postcode, old.stage, old.title) then
    new.calendar_dirty_at := now();
  end if;
  return new;
end $$;
drop trigger if exists crm_projects_calendar_dirty on public.crm_projects;
create trigger crm_projects_calendar_dirty before insert or update on public.crm_projects
  for each row execute function public.crm_projects_calendar_dirty();

create or replace function public.diary_entries_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' or (new.kind, new.title, new.all_day, new.starts_at, new.ends_at, new.day_from, new.day_to,
       new.where_kind, new.address, new.postcode, new.deleted_at, new.surveyor_key)
     is distinct from (old.kind, old.title, old.all_day, old.starts_at, old.ends_at, old.day_from, old.day_to,
       old.where_kind, old.address, old.postcode, old.deleted_at, old.surveyor_key) then
    new.calendar_dirty_at := now();
  end if;
  return new;
end $$;
drop trigger if exists diary_entries_touch on public.diary_entries;
create trigger diary_entries_touch before insert or update on public.diary_entries
  for each row execute function public.diary_entries_touch();

-- Outlook events to delete after their job or diary entry was deleted.
create table if not exists public.calendar_tombstones (
  id         bigserial primary key,
  mailbox    text not null,
  event_id   text not null,
  created_at timestamptz not null default now(),
  unique (mailbox, event_id)
);
create or replace function public.calendar_tombstone_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'crm_projects' then
    -- Skipped without a mailbox: the insert would fail and stop the job being deleted.
    if old.survey_event_id is not null and old.survey_event_mailbox is not null and old.survey_event_at > now() then
      insert into public.calendar_tombstones (mailbox, event_id) values (old.survey_event_mailbox, old.survey_event_id) on conflict do nothing;
    end if;
    if old.install_event_until >= (now() at time zone 'Europe/London')::date then
      insert into public.calendar_tombstones (mailbox, event_id)
        select old.install_event_mailbox, e from unnest(old.install_event_ids) e where old.install_event_mailbox is not null
        on conflict do nothing;
    end if;
  elsif old.outlook_event_id is not null and old.outlook_mailbox is not null then
    insert into public.calendar_tombstones (mailbox, event_id) values (old.outlook_mailbox, old.outlook_event_id) on conflict do nothing;
  end if;
  return old;
end $$;
drop trigger if exists crm_projects_tombstone on public.crm_projects;
create trigger crm_projects_tombstone before delete on public.crm_projects for each row execute function public.calendar_tombstone_row();
drop trigger if exists diary_entries_tombstone on public.diary_entries;
create trigger diary_entries_tombstone before delete on public.diary_entries for each row execute function public.calendar_tombstone_row();

-- Postcode / place → coordinates (postcodes.io, OS OpenData). Postcodes don't move, so keep them.
create table if not exists public.geo_cache (
  key        text primary key,          -- 'pc:NP204AB' | 'oc:NP20' | 'place:cwmbran'
  lat        double precision not null,
  lng        double precision not null,
  quality    int,
  town       text,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_rate_limits (
  key    text not null,
  bucket timestamptz not null,
  hits   int not null default 0,
  primary key (key, bucket)
);

-- Take a time (hold, request, confirm, or move with p.replaces). Locks the UK day, refuses if the day
-- changed since it was checked, and for a confirmed booking writes the job's survey fields in the same step.
create or replace function public.survey_slot_take(p jsonb, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  k  text := lower(p->>'surveyor_key');
  s  timestamptz := (p->>'start')::timestamptz;
  e  timestamptz := (p->>'end')::timestamptz;
  d  date := ((p->>'start')::timestamptz at time zone 'Europe/London')::date;
  st text := p->>'status';
  v  bigint; new_id uuid; old public.survey_bookings%rowtype;
begin
  if st not in ('held','requested','confirmed') then return jsonb_build_object('ok', false, 'reason', 'bad_status'); end if;
  perform pg_advisory_xact_lock(hashtext('survey-day|' || d::text));
  insert into public.survey_booking_days (day) values (d) on conflict do nothing;
  select version into v from public.survey_booking_days where day = d for update;
  if p_expected_version is not null and v <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'changed', 'version', v);
  end if;
  update public.survey_bookings set status = 'expired', cancelled_at = now(), updated_at = now()
   where surveyor_key = k and day = d and status = 'held' and expires_at < now();
  if nullif(p->>'replaces', '') is not null then
    select * into old from public.survey_bookings where id = (p->>'replaces')::uuid and status in ('held','requested','confirmed') for update;
  end if;
  begin
    if old.id is not null then
      update public.survey_bookings set status = 'cancelled', cancel_reason = 'moved', cancelled_at = now(), updated_at = now() where id = old.id;
    end if;
    insert into public.survey_bookings
      (project_id, enquiry_id, surveyor_key, surveyor_id, status, survey_type, minutes, onsite, day,
       postcode, lat, lng, address, source, expires_at, booked_by, overridden, would_confirm, client_ip, confirmed_at)
    values
      (nullif(p->>'project_id','')::uuid, nullif(p->>'enquiry_id','')::uuid, k, nullif(p->>'surveyor_id','')::uuid,
       st, p->>'survey_type', (p->>'minutes')::int, tstzrange(s, e, '[)'), d,
       p->>'postcode', (p->>'lat')::float8, (p->>'lng')::float8, p->>'address',
       coalesce(p->>'source','link'), nullif(p->>'expires_at','')::timestamptz, nullif(p->>'booked_by','')::uuid,
       coalesce((p->>'overridden')::boolean, false), (p->>'would_confirm')::boolean, p->>'client_ip',
       case when st = 'confirmed' then now() end)
    returning id into new_id;
  exception
    when exclusion_violation then return jsonb_build_object('ok', false, 'reason', 'overlap', 'version', v);
    when unique_violation    then return jsonb_build_object('ok', false, 'reason', 'already_booked', 'version', v);
  end;
  if st = 'confirmed' and new_id is not null and nullif(p->>'project_id','') is not null then
    update public.crm_projects set survey_at = s, survey_minutes = (p->>'minutes')::int, survey_type = p->>'survey_type',
           survey_mailbox = k, survey_booking_id = new_id, updated_at = now()
     where id = (p->>'project_id')::uuid;
  elsif old.id is not null and old.status = 'confirmed' then      -- a confirmed survey moved into "requested"
    update public.crm_projects set survey_at = null, survey_booking_id = null, updated_at = now()
     where id = old.project_id and survey_booking_id = old.id;
  end if;
  update public.survey_booking_days set version = version + 1 where day = d;
  return jsonb_build_object('ok', true, 'id', new_id, 'version', v + 1, 'day', d);
end $$;

-- Turn a hold (or an expired hold, or a request) into a request or a confirmed booking, under the same lock.
create or replace function public.survey_slot_confirm(p_id uuid, p_expected_version bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare b public.survey_bookings%rowtype; v bigint; st text := p->>'status'; was text;
begin
  if st not in ('requested','confirmed') then return jsonb_build_object('ok', false, 'reason', 'bad_status'); end if;
  select * into b from public.survey_bookings where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  perform pg_advisory_xact_lock(hashtext('survey-day|' || b.day::text));
  insert into public.survey_booking_days (day) values (b.day) on conflict do nothing;
  select version into v from public.survey_booking_days where day = b.day for update;
  if p_expected_version is not null and v <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'changed', 'version', v);
  end if;
  select * into b from public.survey_bookings where id = p_id for update;
  was := b.status;
  if was not in ('held','expired','requested') then return jsonb_build_object('ok', false, 'reason', 'not_open', 'status', was); end if;
  begin
    update public.survey_bookings set
      status        = st,
      project_id    = coalesce(nullif(p->>'project_id','')::uuid, project_id),
      enquiry_id    = coalesce(nullif(p->>'enquiry_id','')::uuid, enquiry_id),
      address       = coalesce(p->>'address', address),
      postcode      = coalesce(p->>'postcode', postcode),
      lat           = coalesce((p->>'lat')::float8, lat),
      lng           = coalesce((p->>'lng')::float8, lng),
      duplicate_of  = coalesce(nullif(p->>'duplicate_of','')::uuid, duplicate_of),
      would_confirm = coalesce((p->>'would_confirm')::boolean, would_confirm),
      booked_by     = coalesce(nullif(p->>'booked_by','')::uuid, booked_by),
      expires_at    = case when st = 'requested' then nullif(p->>'expires_at','')::timestamptz else null end,
      confirmed_at  = case when st = 'confirmed' then now() else confirmed_at end,
      cancelled_at  = null,
      cancel_reason = null,
      updated_at    = now()
    where id = p_id returning * into b;
  exception
    when exclusion_violation then return jsonb_build_object('ok', false, 'reason', 'overlap', 'version', v);
    when unique_violation    then return jsonb_build_object('ok', false, 'reason', 'already_booked', 'version', v);
  end;
  if st = 'confirmed' and b.project_id is not null then
    update public.crm_projects set survey_at = lower(b.onsite), survey_minutes = b.minutes, survey_type = b.survey_type,
           survey_mailbox = b.surveyor_key, survey_booking_id = b.id, updated_at = now()
     where id = b.project_id;
  end if;
  if was = 'expired' then   -- re-taking expired time takes time again; hold → request/confirmed doesn't
    update public.survey_booking_days set version = version + 1 where day = b.day;
    v := v + 1;
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'version', v);
end $$;

-- Cancel a booking; if the job points at it, clear the job's survey date in the same step. No version bump.
create or replace function public.survey_slot_cancel(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.survey_bookings%rowtype;
begin
  update public.survey_bookings set status = 'cancelled', cancel_reason = p_reason, cancelled_at = now(), updated_at = now()
   where id = p_id and status in ('held','requested','confirmed') returning * into b;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_open'); end if;
  update public.crm_projects set survey_at = null, survey_booking_id = null, updated_at = now()
   where id = b.project_id and survey_booking_id = b.id;
  return jsonb_build_object('ok', true, 'project_id', b.project_id);
end $$;

-- Every minute: expire holds and unconfirmed requests. Returns the requests that expired (the job tells staff).
create or replace function public.survey_slot_expire() returns jsonb
language plpgsql security definer set search_path = public as $$
declare holds int; reqs jsonb;
begin
  update public.survey_bookings set status = 'expired', cancelled_at = now(), updated_at = now()
   where status = 'held' and expires_at < now();
  get diagnostics holds = row_count;
  with x as (
    update public.survey_bookings set status = 'expired', cancelled_at = now(), cancel_reason = 'not confirmed in time', updated_at = now()
     where status = 'requested' and expires_at < now()
     returning id, project_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'project_id', project_id)), '[]'::jsonb) into reqs from x;
  return jsonb_build_object('holds', holds, 'requests', reqs);
end $$;

create or replace function public.rate_hit(p_key text, p_window_secs int, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare b timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs); n int;
begin
  insert into public.public_rate_limits (key, bucket, hits) values (p_key, b, 1)
  on conflict (key, bucket) do update set hits = public.public_rate_limits.hits + 1
  returning hits into n;
  return n <= p_limit;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.survey_slot_take(jsonb, bigint)', 'public.survey_slot_confirm(uuid, bigint, jsonb)',
    'public.survey_slot_cancel(uuid, text)', 'public.survey_slot_expire()', 'public.rate_hit(text, int, int)',
    'public.survey_days_bump(date[])', 'public.crm_project_days(timestamptz, timestamptz, int)']
  loop
    execute 'revoke execute on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $$;

alter table public.survey_bookings     enable row level security;
alter table public.survey_booking_days enable row level security;
alter table public.diary_entries       enable row level security;
alter table public.calendar_tombstones enable row level security;
alter table public.geo_cache           enable row level security;
alter table public.public_rate_limits  enable row level security;
notify pgrst, 'reload schema';
