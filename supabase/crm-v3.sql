-- 26. CRM v3: Projects (the delivery side of an opportunity), delivery checklists and paperwork,
--     task due reminders and de-duplication, WhatsApp permission records, signed-quote evidence,
--     and two helpers so parallel code can't overwrite each other's lists.
--     Run after crm-v2.sql. Safe to re-run. Server-only tables (RLS on, no policies).

alter table public.crm_projects add column if not exists project_ref          text unique;   -- HX-0042, given when the job starts
alter table public.crm_projects add column if not exists project_started_at   timestamptz;
alter table public.crm_projects add column if not exists on_hold              boolean not null default false;
alter table public.crm_projects add column if not exists hold_reason          text;
alter table public.crm_projects add column if not exists install_days         int not null default 1;   -- WORKING days from install_at
alter table public.crm_projects add column if not exists install_team         uuid[] not null default '{}';
alter table public.crm_projects add column if not exists scaffold_up_on       date;
alter table public.crm_projects add column if not exists scaffold_down_on     date;
alter table public.crm_projects add column if not exists commissioned_at      timestamptz;
alter table public.crm_projects add column if not exists handover_at          timestamptz;
alter table public.crm_projects add column if not exists rams_project_id      text;
alter table public.crm_projects add column if not exists system               jsonb not null default '{}'::jsonb;
alter table public.crm_projects add column if not exists paperwork            jsonb not null default '{}'::jsonb;
alter table public.crm_projects add column if not exists checklist            jsonb not null default '{}'::jsonb; -- {item: {done_at, by_id, by, na}}
alter table public.crm_projects add column if not exists site_lat             double precision;
alter table public.crm_projects add column if not exists site_lng             double precision;
alter table public.crm_projects add column if not exists accepted_hash        text;      -- sha256 of the quote file that was signed
alter table public.crm_projects add column if not exists accepted_start_early boolean;   -- "Please start within the 14 days" ticked when signing
create index if not exists crm_projects_started_idx on public.crm_projects (project_started_at desc) where project_started_at is not null;
create index if not exists crm_projects_install_idx on public.crm_projects (install_at) where install_at is not null;
create index if not exists crm_projects_survey_idx  on public.crm_projects (survey_at)  where survey_at  is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_projects_install_days_chk') then
    alter table public.crm_projects add constraint crm_projects_install_days_chk check (install_days between 1 and 30);
  end if;
end $$;

create sequence if not exists public.crm_project_ref_seq;

-- Keep this stage list in step with PROJECT_STAGES in src/lib/crm/stages.ts.
create or replace function public.crm_projects_start() returns trigger
language plpgsql set search_path = public as $$
declare n bigint;
begin
  if new.project_started_at is null
     and new.stage in ('won','design','ready','install_booked','installing','commissioning','handover','complete') then
    new.project_started_at := now();
  end if;
  if new.project_started_at is not null and new.project_ref is null then
    n := nextval('public.crm_project_ref_seq');
    new.project_ref := 'HX-' || lpad(n::text, greatest(4, length(n::text)), '0');   -- HX-0042 … HX-10000
  end if;
  return new;
end $$;
drop trigger if exists crm_projects_start on public.crm_projects;
create trigger crm_projects_start
  before insert or update of stage, project_started_at on public.crm_projects
  for each row execute function public.crm_projects_start();

-- Backfill: every job already at Won or later becomes a project, numbered in won order. Re-running changes nothing.
do $$
declare r record;
begin
  for r in
    select id, coalesce(accepted_at, stage_changed_at, created_at) as started
      from public.crm_projects
     where project_started_at is null
       and stage in ('won','design','ready','install_booked','installing','commissioning','handover','complete')
     order by coalesce(accepted_at, stage_changed_at, created_at), created_at
  loop
    update public.crm_projects set project_started_at = r.started where id = r.id;
  end loop;
end $$;

-- Coordinates come from the postcode: clear them when the site moves, unless the same update sets new ones.
create or replace function public.crm_projects_site_moved() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.postcode is distinct from old.postcode or new.address is distinct from old.address)
     and new.site_lat is not distinct from old.site_lat and new.site_lng is not distinct from old.site_lng then
    new.site_lat := null; new.site_lng := null;
  end if;
  return new;
end $$;
drop trigger if exists crm_projects_site_moved on public.crm_projects;
create trigger crm_projects_site_moved before update of postcode, address on public.crm_projects
  for each row execute function public.crm_projects_site_moved();

-- Tasks: due reminders, and one task per source (deadline, survey follow-up) per job.
alter table public.tasks add column if not exists due_reminded_on date;
alter table public.tasks add column if not exists source_key      text;   -- deadline:mcs:2026-11-06 | survey-drawings:<id> | survey-send:<id>:E14
create unique index if not exists tasks_project_source_key on public.tasks (crm_project_id, source_key) where source_key is not null;

-- WhatsApp permission: when and how it was given or taken away.
alter table public.enquiries add column if not exists whatsapp_opt_in_at     timestamptz;
alter table public.enquiries add column if not exists whatsapp_opt_in_source text;  -- website-form | booking-form | meta-lead-form | inbound | import | staff:<name> | stop-reply

-- Documents: a fingerprint made when the file is saved, and a "Signed" tick for contracts signed outside the portal.
alter table public.crm_documents add column if not exists sha256              text;
alter table public.crm_documents add column if not exists signed_outside_at   timestamptz;
alter table public.crm_documents add column if not exists signed_outside_by   uuid references public.profiles(id) on delete set null;
alter table public.crm_documents add column if not exists signed_outside_note text;   -- "Signed on paper at the survey"

-- Add a key to reminders_sent once, without rewriting the list from a stale copy. True = newly added.
create or replace function public.crm_mark_sent(p_project uuid, p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.crm_projects set reminders_sent = array_append(reminders_sent, p_key)
   where id = p_project and not (reminders_sent @> array[p_key]);
  return found;
end $$;

-- Set (p_value json) or clear (null) one checklist item without touching the others.
create or replace function public.crm_checklist_set(p_project uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  update public.crm_projects
     set checklist = case when p_value is null then checklist - p_key else jsonb_set(checklist, array[p_key], p_value, true) end,
         updated_at = now()
   where id = p_project
  returning checklist into c;
  return c;
end $$;

revoke execute on function public.crm_mark_sent(uuid, text)               from public, anon, authenticated;
revoke execute on function public.crm_checklist_set(uuid, text, jsonb)    from public, anon, authenticated;
grant  execute on function public.crm_mark_sent(uuid, text)               to service_role;
grant  execute on function public.crm_checklist_set(uuid, text, jsonb)    to service_role;

notify pgrst, 'reload schema';
