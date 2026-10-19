-- 29. Customer references: every customer gets a reference (HX-0042) the moment they're added, and
--     their jobs share it. Their first job is HX-0042 too; later jobs are HX-0042-2, HX-0042-3 … in the
--     order they were added (leads included). A reference never changes once given and is never used
--     again, even after a delete (numbers can skip; that's normal). Replaces crm-v3.sql's job numbers
--     (HX-0001 … in won order, only given at Won), which are worked out again once from the customers.
--     project_started_at still comes from crm-v3.sql's rule (set when a job reaches Won or later).
--     Run after crm-v3.sql. Safe to re-run. RLS unchanged.

-- The job part reads crm-v3.sql's columns: without them every new job would fail to save.
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'crm_projects' and column_name = 'project_ref')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'crm_projects' and column_name = 'project_started_at') then
    raise exception 'Run crm-v3.sql first, then this file.';
  end if;
end $$;

-- Jobs first, then customers: the order saving a job takes them in, so a save made while this runs
-- waits rather than deadlocking.
do $$ begin lock table public.crm_projects, public.enquiries in access exclusive mode; end $$;

-- 1. Customers -----------------------------------------------------------------------------------

alter table public.enquiries add column if not exists customer_ref text unique;               -- HX-0042, given when they're added
alter table public.enquiries add column if not exists last_job_no  int not null default 0;    -- job numbers used so far (1 = the customer's own ref)

create sequence if not exists public.customer_ref_seq;
revoke all on sequence public.customer_ref_seq from public, anon, authenticated;

-- 42 → HX-0042, 10000 → HX-10000.
create or replace function public.hx_ref(n bigint) returns text
language sql immutable set search_path = public as $$
  select 'HX-' || lpad(n::text, greatest(4, length(n::text)), '0');
$$;

-- A new customer takes the next number. Afterwards the reference stays put, and the job counter only
-- goes up, so a deleted job's number is never handed out again.
create or replace function public.enquiries_customer_ref() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.customer_ref := public.hx_ref(nextval('public.customer_ref_seq'));
    new.last_job_no := 0;
  else
    if old.customer_ref is not null then new.customer_ref := old.customer_ref; end if;
    new.last_job_no := greatest(new.last_job_no, old.last_job_no);
  end if;
  return new;
end $$;
drop trigger if exists enquiries_customer_ref on public.enquiries;
create trigger enquiries_customer_ref
  before insert or update of customer_ref, last_job_no on public.enquiries
  for each row execute function public.enquiries_customer_ref();

-- Backfill: customers already here are numbered oldest first. Re-running changes nothing.
do $$
declare r record;
begin
  lock table public.enquiries in share row exclusive mode;   -- nobody new while we number
  for r in select id from public.enquiries where customer_ref is null order by created_at, id loop
    update public.enquiries set customer_ref = public.hx_ref(nextval('public.customer_ref_seq')) where id = r.id;
  end loop;
end $$;
alter table public.enquiries alter column customer_ref set not null;

-- 2. Jobs ----------------------------------------------------------------------------------------

alter table public.crm_projects add column if not exists job_no int;   -- 1 = the customer's ref, 2 = HX-0042-2 …; null = not numbered by this file yet

-- crm-v3.sql's trigger now only marks when a job became a project; the reference comes from the customer
-- (below). Keep this stage list in step with PROJECT_STAGES in src/lib/crm/stages.ts.
create or replace function public.crm_projects_start() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.project_started_at is null
     and new.stage in ('won','design','ready','install_booked','installing','commissioning','handover','complete') then
    new.project_started_at := now();
  end if;
  return new;
end $$;
drop trigger if exists crm_projects_start on public.crm_projects;
create trigger crm_projects_start
  before insert or update of stage, project_started_at on public.crm_projects
  for each row execute function public.crm_projects_start();

-- crm-v3.sql's won-order numbers go first, so they can't clash with the customer-based ones.
update public.crm_projects set project_ref = null where job_no is null and project_ref is not null;

-- A new job takes its customer's next job number. Updating the customer row locks it, so two jobs
-- added for one customer at the same moment queue up and get -2 and -3, never the same number.
-- Once given, the number and reference stay put.
-- (Fires before crm_projects_start, by name, so re-running crm-v3.sql can't bring its numbers back.)
create or replace function public.crm_projects_ref() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text; n int;
begin
  if tg_op = 'INSERT' then
    update public.enquiries set last_job_no = last_job_no + 1
     where id = new.enquiry_id
    returning customer_ref, last_job_no into c, n;
    -- An unknown customer is refused by the foreign key straight after.
    new.job_no := n;
    new.project_ref := case when n is null then null when n = 1 then c else c || '-' || n end;
  elsif old.job_no is not null then
    new.job_no := old.job_no;
    new.project_ref := old.project_ref;
  end if;
  return new;
end $$;
drop trigger if exists crm_projects_ref on public.crm_projects;
create trigger crm_projects_ref
  before insert or update of project_ref, job_no on public.crm_projects
  for each row execute function public.crm_projects_ref();

-- Number the jobs already here from their customer, oldest first. Only jobs this file hasn't numbered,
-- so re-running changes nothing.
do $$
declare r record; c text; n int;
begin
  lock table public.crm_projects, public.enquiries in share row exclusive mode;   -- no new jobs while we number
  for r in select id, enquiry_id from public.crm_projects where job_no is null order by enquiry_id, created_at, id loop
    update public.enquiries set last_job_no = last_job_no + 1
     where id = r.enquiry_id
    returning customer_ref, last_job_no into c, n;
    update public.crm_projects
       set job_no = n, project_ref = case when n = 1 then c else c || '-' || n end
     where id = r.id;
  end loop;
end $$;

do $$ declare f text; begin
  foreach f in array array['public.hx_ref(bigint)', 'public.enquiries_customer_ref()', 'public.crm_projects_ref()']
  loop
    execute 'revoke execute on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $$;

notify pgrst, 'reload schema';
