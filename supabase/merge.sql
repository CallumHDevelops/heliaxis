-- 32. Merging duplicates: two customers into one, and (when it's the same work) their jobs into one
--     (src/lib/crm/merge.ts). Old references, numbers, links and Meta lead ids keep finding the record
--     that stayed (crm_aliases), Reports still count each lead once (crm_lead_origins), and every merge is
--     written down with what the merged-away records were (crm_merges). Run after customer-refs.sql.
--     Safe to re-run. Server-only (RLS on, no policies).
--
--     The app works out what goes where and asks crm_merge() to do it all in one go. Everything that points
--     at a customer or a job is found from the database's own list of foreign keys, so a table added later
--     (one that points at a job, say) moves with no change here.

do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'enquiries' and column_name = 'customer_ref')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'crm_projects' and column_name = 'project_ref') then
    raise exception 'Run crm-v3.sql and customer-refs.sql first, then this file.';
  end if;
end $$;

-- One row per merge: who, when, what was kept, and the merged-away records as they were.
create table if not exists public.crm_merges (
  id              uuid primary key default gen_random_uuid(),
  kept_enquiry_id uuid references public.enquiries(id) on delete cascade,
  kept_ref        text,
  gone_enquiry_id uuid,                         -- merged away (no foreign key: it's gone); null when two of one customer's jobs were joined
  gone_ref        text,
  gone_name       text,
  joins           jsonb not null default '[]',  -- [{from, from_ref, into, into_ref, credit}]
  snapshot        jsonb not null,               -- {customer: {…}, jobs: [{…}]} as they were
  choices         jsonb not null default '{}',  -- which value each detail took, and why
  summary         jsonb not null default '{}',  -- {"whatsapp_messages": 14, …}: what moved to the kept record
  moved           jsonb not null default '{}',  -- {"whatsapp_messages.enquiry_id": 14, …}
  cancelled       jsonb not null default '{}',  -- {"whatsapp_outbox": 1, …}: closed or dropped
  warnings        text[] not null default '{}',
  files           jsonb not null default '[]',  -- [{bucket, from, to}]: storage folders to move (src/lib/crm/merge.ts)
  files_done_at   timestamptz,
  files_error     text,
  by_id           uuid references public.profiles(id) on delete set null,
  by_name         text,
  at              timestamptz not null default now()
);
create unique index if not exists crm_merges_gone_key on public.crm_merges (gone_enquiry_id) where gone_enquiry_id is not null;
create index if not exists crm_merges_kept_idx on public.crm_merges (kept_enquiry_id, at desc);
create index if not exists crm_merges_files_idx on public.crm_merges (at) where files_done_at is null;

-- What still finds the record that stayed: an old id or reference, another phone number or email, a Meta
-- lead id, a customer's old portal or booking link.
create table if not exists public.crm_aliases (
  kind        text not null check (kind in ('customer','customer_ref','job','job_ref','phone','email','meta_lead','portal_token','booking_token')),
  value       text not null,   -- old id; reference in capitals; WhatsApp digits (447700…); lower-case email; Meta lead id; token
  shown       text,            -- as it was typed, for the customer card
  from_ref    text,            -- the record it came from (HX-0069)
  enquiry_id  uuid not null references public.enquiries(id) on delete cascade,
  project_id  uuid references public.crm_projects(id) on delete cascade,
  merge_id    uuid references public.crm_merges(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (kind, value)
);
create index if not exists crm_aliases_enquiry_idx on public.crm_aliases (enquiry_id);
create index if not exists crm_aliases_project_idx on public.crm_aliases (project_id) where project_id is not null;

-- A lead that no longer matches its job's customer. 'own': this job's lead, used instead of its customer's
-- (a job that moved to another customer). 'also': a lead joined into this job (counted, never sold twice).
create table if not exists public.crm_lead_origins (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.crm_projects(id) on delete cascade,
  enquiry_id       uuid not null references public.enquiries(id) on delete cascade,
  role             text not null check (role in ('own','also')),
  source           text not null,
  came_in_at       timestamptz,   -- when that customer came in
  job_created_at   timestamptz not null,   -- the Reports period: when that job was made ('own': this job's date)
  first_contact_at timestamptz,
  owner_id         uuid references public.profiles(id) on delete set null,
  meta_lead_id     text,
  meta_ad_id       text,
  meta_adset_id    text,
  meta_campaign_id text,
  customer_ref     text,
  project_ref      text,
  merge_id         uuid references public.crm_merges(id) on delete set null,
  created_at       timestamptz not null default now()
);
create unique index if not exists crm_lead_origins_one_own on public.crm_lead_origins (project_id) where role = 'own';
create index if not exists crm_lead_origins_project_idx on public.crm_lead_origins (project_id);
create index if not exists crm_lead_origins_enquiry_idx on public.crm_lead_origins (enquiry_id);
create index if not exists crm_lead_origins_also_idx on public.crm_lead_origins (job_created_at) where role = 'also';

-- People staff said aren't the same person, so the duplicate badge leaves them alone (lowest id first).
create table if not exists public.crm_distinct_pairs (
  a     uuid not null references public.enquiries(id) on delete cascade,
  b     uuid not null references public.enquiries(id) on delete cascade,
  by_id uuid references public.profiles(id) on delete set null,
  at    timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists crm_distinct_pairs_b_idx on public.crm_distinct_pairs (b);

/* ── Helpers (only crm_merge below calls them) ─────────────────────────────────────── */

-- Change some columns of one row, but only if each still holds what the app read: {col: {from, to}}.
-- Otherwise someone changed it meanwhile, and nothing is saved.
create or replace function public.crm_merge_set(p_table regclass, p_id uuid, p_changes jsonb) returns void
language plpgsql set search_path = public as $$
declare sets text; conds text; n int;
begin
  if p_changes is null or p_changes = '{}'::jsonb then return; end if;
  select string_agg(format('%1$I = n.%1$I', key), ', '), string_agg(format('t.%1$I is not distinct from o.%1$I', key), ' and ')
    into sets, conds
    from jsonb_object_keys(p_changes) key;
  execute format('update %1$s t set %2$s from jsonb_populate_record(null::%1$s, $2) n, jsonb_populate_record(null::%1$s, $3) o where t.id = $1 and %3$s',
                 p_table, sets, conds)
    using p_id,
          (select jsonb_object_agg(key, coalesce(value->'to', 'null'::jsonb)) from jsonb_each(p_changes)),
          (select jsonb_object_agg(key, coalesce(value->'from', 'null'::jsonb)) from jsonb_each(p_changes));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'merge:changed' using detail = format('%s %s', p_table, p_id); end if;
end $$;

-- The row still says what the app read: {col: value}.
create or replace function public.crm_merge_expect(p_table regclass, p_id uuid, p_values jsonb) returns void
language plpgsql set search_path = public as $$
declare conds text; n int;
begin
  if p_values is null or p_values = '{}'::jsonb then return; end if;
  select string_agg(format('t.%1$I is not distinct from o.%1$I', key), ' and ') into conds from jsonb_object_keys(p_values) key;
  execute format('select count(*) from %1$s t, jsonb_populate_record(null::%1$s, $2) o where t.id = $1 and %2$s', p_table, conds)
    into n using p_id, p_values;
  if n = 0 then raise exception 'merge:changed' using detail = format('%s %s', p_table, p_id); end if;
end $$;

-- {a: 1} + {a: 2, b: 1} = {a: 3, b: 1}
create or replace function public.crm_merge_add(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(key, total), '{}'::jsonb)
    from (select key, sum(value::numeric)::bigint as total
            from (select * from jsonb_each_text(coalesce(a, '{}')) union all select * from jsonb_each_text(coalesce(b, '{}'))) x
           group by key) y;
$$;

-- Every single-column foreign key to p_target: (table, its name, column, column number).
create or replace function public.crm_merge_fks(p_target regclass)
returns table (tbl regclass, tname text, col text, attnum int2)
language sql stable set search_path = public as $$
  select c.conrelid::regclass, cl.relname::text, a.attname::text, a.attnum
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and c.confrelid = p_target and cardinality(c.conkey) = 1
   order by cl.relname, a.attname;
$$;

-- Move every row that points at p_from (through any foreign key to p_target) to p_to. First, rows of
-- p_from's that a unique index would see clash with p_to's: the table's policy says what happens
-- ("drop-ours": p_from's copy goes; {"cancel": {col: value}}: set those on p_from's copy; anything else,
-- or no policy: refuse, so nothing is ever lost quietly). → {moved: {"table.col": n}, dropped, cancelled}.
create or replace function public.crm_merge_move(p_target regclass, p_from uuid, p_to uuid, p_policies jsonb, p_skip text[])
returns jsonb language plpgsql set search_path = public as $$
declare
  fk record; ix record; keys text; pred text; sets text; tids tid[]; pol jsonb; n int;
  moved jsonb := '{}'; dropped jsonb := '{}'; cancelled jsonb := '{}';
begin
  for fk in select * from public.crm_merge_fks(p_target) f where f.tname <> all(p_skip) loop
    for ix in
      select i.indexrelid, i.indkey, i.indnkeyatts, pg_get_expr(i.indpred, i.indrelid) as ipred
        from pg_index i
       where i.indrelid = fk.tbl and i.indisunique and fk.attnum = any(i.indkey::int2[])
    loop
      select string_agg(pg_get_indexdef(ix.indexrelid, k, true), ', ' order by k) into keys
        from generate_series(1, ix.indnkeyatts) k
       where ix.indkey[k - 1] <> fk.attnum;
      pred := coalesce(' and (' || ix.ipred || ')', '');
      if keys is null then
        execute format('select array_agg(ctid) from %1$s where %2$I = $1%3$s and exists (select 1 from %1$s where %2$I = $2%3$s)', fk.tbl, fk.col, pred)
          into tids using p_from, p_to;
      else
        execute format('select array_agg(ctid) from %1$s where %2$I = $1%3$s and (%4$s) in (select %4$s from %1$s where %2$I = $2%3$s)', fk.tbl, fk.col, pred, keys)
          into tids using p_from, p_to;
      end if;
      continue when coalesce(cardinality(tids), 0) = 0;
      pol := p_policies -> fk.tname;
      if pol = '"drop-ours"'::jsonb then
        execute format('delete from %s where ctid = any($1)', fk.tbl) using tids;
        get diagnostics n = row_count;
        dropped := public.crm_merge_add(dropped, jsonb_build_object(fk.tname, n));
      elsif jsonb_typeof(pol) = 'object' and jsonb_typeof(pol->'cancel') = 'object' then
        select string_agg(format('%1$I = n.%1$I', key), ', ') into sets from jsonb_object_keys(pol->'cancel') key;
        execute format('update %1$s t set %2$s from jsonb_populate_record(null::%1$s, $2) n where t.ctid = any($1)', fk.tbl, sets)
          using tids, pol->'cancel';
        get diagnostics n = row_count;
        cancelled := public.crm_merge_add(cancelled, jsonb_build_object(fk.tname, n));
      else
        raise exception 'merge:clash' using detail = fk.tname;
      end if;
    end loop;
    execute format('update %1$s set %2$I = $1 where %2$I = $2', fk.tbl, fk.col) using p_to, p_from;
    get diagnostics n = row_count;
    if n > 0 then moved := public.crm_merge_add(moved, jsonb_build_object(fk.tname || '.' || fk.col, n)); end if;
  end loop;
  return jsonb_build_object('moved', moved, 'dropped', dropped, 'cancelled', cancelled);
end $$;

-- The first "table.column" with rows still pointing at any of p_ids, or null. The foreign keys are
-- "on delete cascade", so anything left would be deleted with the record: the merge stops instead.
create or replace function public.crm_merge_left(p_target regclass, p_ids uuid[]) returns text
language plpgsql set search_path = public as $$
declare fk record; found_one boolean;
begin
  for fk in select * from public.crm_merge_fks(p_target) loop
    execute format('select exists (select 1 from %1$s where %2$I = any($1))', fk.tbl, fk.col) into found_one using p_ids;
    if found_one then return fk.tname || '.' || fk.col; end if;
  end loop;
  return null;
end $$;

-- How many rows of each table point at these customers or jobs (for "what moves"), leaving out p_skip.
create or replace function public.crm_merge_counts(p_customers uuid[], p_jobs uuid[], p_skip text[]) returns jsonb
language plpgsql set search_path = public as $$
declare t record; n bigint; v_out jsonb := '{}';
begin
  for t in
    select tbl, tname, string_agg(format('%I = any($%s)', col, which), ' or ') as cond
      from (select f.tbl, f.tname, f.col, 1 as which from public.crm_merge_fks('public.enquiries') f
            union all
            select f.tbl, f.tname, f.col, 2 from public.crm_merge_fks('public.crm_projects') f) x
     where tname <> all(p_skip)
     group by tbl, tname
  loop
    execute format('select count(*) from %s where %s', t.tbl, t.cond) into n using p_customers, p_jobs;
    if n > 0 then v_out := v_out || jsonb_build_object(t.tname, n); end if;
  end loop;
  return v_out;
end $$;

-- A signed quote or a paid deposit on this job: the evidence of a contract.
create or replace function public.crm_merge_contract(p_job uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.crm_projects
                  where id = p_job and (accepted_at is not null or accepted_signature is not null or deposit_paid_at is not null))
      or exists (select 1 from public.crm_documents where project_id = p_job and signed_outside_at is not null);
$$;

-- One lead origin, from the app's row (a job's lead as it was).
create or replace function public.crm_merge_origin(p_row jsonb, p_job uuid, p_role text, p_merge uuid) returns void
language sql set search_path = public as $$
  insert into public.crm_lead_origins
    (project_id, enquiry_id, role, source, came_in_at, job_created_at, first_contact_at, owner_id,
     meta_lead_id, meta_ad_id, meta_adset_id, meta_campaign_id, customer_ref, project_ref, merge_id)
  select p_job, r.enquiry_id, p_role, coalesce(nullif(r.source, ''), 'unknown'), r.came_in_at, coalesce(r.job_created_at, now()), r.first_contact_at,
         (select id from public.profiles where id = r.owner_id),
         r.meta_lead_id, r.meta_ad_id, r.meta_adset_id, r.meta_campaign_id, r.customer_ref, r.project_ref, p_merge
    from jsonb_populate_record(null::public.crm_lead_origins, p_row) r;
$$;

/* ── The merge ─────────────────────────────────────────────────────────────────────── */

-- p (built by src/lib/crm/merge.ts):
--   keep, merge (null when joining two of one customer's jobs), expect [{table, id, values}],
--   customer {set, clear} ({col: {from, to}}), joins [{from, into, credit, set, set_from, tasks, tombstones,
--   cancel_booking, origin_from, origin_into}], own_origins, aliases, stop_sequences, outbox_cancel_kinds,
--   policies {table: policy}, labels [{table, one, many}], timeline, timeline_job, cancel_reason, files,
--   log {joins, choices, warnings}, by, by_name.
create or replace function public.crm_merge_run(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_keep uuid := (p->>'keep')::uuid;
  v_dup  uuid := nullif(p->>'merge', '')::uuid;
  v_by   uuid := (select id from public.profiles where id = nullif(p->>'by', '')::uuid);
  k public.enquiries%rowtype;
  d public.enquiries%rowtype;
  prev public.crm_merges%rowtype;
  jf public.crm_projects%rowtype;
  jk public.crm_projects%rowtype;
  sf record;
  sk record;
  j jsonb; x jsonb; r jsonb;
  v_from uuid; v_into uuid;
  v_merge uuid;
  live_f uuid; live_k uuid;
  v_moved jsonb := '{}'; v_dropped jsonb := '{}'; v_cancelled jsonb := '{}'; v_summary jsonb;
  v_counted uuid[];
  left_over text; n int; v_text text; v_body text;
  v_joins jsonb := coalesce(p->'joins', '[]');
  v_policies jsonb := coalesce(p->'policies', '{}');
  v_skip text[] := array['crm_distinct_pairs'];
  v_internal text[] := array['crm_aliases', 'crm_lead_origins', 'crm_merges', 'crm_distinct_pairs'];
  v_delivery text[] := array['won','design','ready','install_booked','installing','commissioning','handover','complete'];
begin
  -- 1. Lock the jobs, then the customers: the order saving a job takes them in (customer-refs.sql).
  perform 1 from public.crm_projects where enquiry_id in (v_keep, v_dup) order by id for update;
  perform 1 from public.enquiries where id in (v_keep, v_dup) order by id for update;
  select * into k from public.enquiries where id = v_keep;
  if not found then raise exception 'merge:kept-gone'; end if;

  -- 2. Done already (a second tap, a retry): say so, change nothing.
  if v_dup is not null then
    if v_dup = v_keep then raise exception 'merge:same'; end if;
    select * into d from public.enquiries where id = v_dup;
    if not found then
      select * into prev from public.crm_merges where gone_enquiry_id = v_dup;
      if found and prev.kept_enquiry_id = v_keep then
        return jsonb_build_object('ok', true, 'already', true, 'merge_id', prev.id, 'kept', jsonb_build_object('id', k.id, 'ref', k.customer_ref));
      elsif found then
        raise exception 'merge:merged-elsewhere'
          using detail = coalesce((select customer_ref from public.enquiries where id = prev.kept_enquiry_id), prev.kept_ref, '');
      end if;
      raise exception 'merge:gone';
    end if;
  elsif jsonb_array_length(v_joins) = 0 then
    raise exception 'merge:nothing';
  elsif not exists (select 1 from jsonb_array_elements(v_joins) y join public.crm_projects cp on cp.id = (y->>'from')::uuid) then
    if not exists (select 1 from jsonb_array_elements(v_joins) y
                    where not exists (select 1 from public.crm_aliases a
                                       where a.kind = 'job' and a.value = y->>'from' and a.project_id = (y->>'into')::uuid)) then
      return jsonb_build_object('ok', true, 'already', true, 'kept', jsonb_build_object('id', k.id, 'ref', k.customer_ref));
    end if;
    raise exception 'merge:gone';
  end if;

  -- 3. Nothing has changed since the app read it.
  for x in select * from jsonb_array_elements(coalesce(p->'expect', '[]')) loop
    if x->>'table' not in ('enquiries', 'crm_projects') then raise exception 'merge:bad-plan'; end if;
    perform public.crm_merge_expect(('public.' || (x->>'table'))::regclass, (x->>'id')::uuid, x->'values');
  end loop;

  -- 4. The jobs to join are theirs, and joining them is allowed.
  for j in select * from jsonb_array_elements(v_joins) loop
    v_from := (j->>'from')::uuid;
    v_into := (j->>'into')::uuid;
    if v_from = v_into then raise exception 'merge:same-job'; end if;
    select * into jf from public.crm_projects where id = v_from and enquiry_id in (v_keep, v_dup);
    if not found then raise exception 'merge:job-gone'; end if;
    select * into jk from public.crm_projects where id = v_into and enquiry_id in (v_keep, v_dup);
    if not found then raise exception 'merge:job-gone'; end if;
    if public.crm_merge_contract(v_from) and public.crm_merge_contract(v_into) then raise exception 'merge:both-signed'; end if;
    if jf.stage = any(v_delivery) and jk.stage = any(v_delivery) then raise exception 'merge:both-delivery'; end if;
    if jf.rams_project_id is not null and jk.rams_project_id is not null and jf.rams_project_id <> jk.rams_project_id then
      raise exception 'merge:rams';
    end if;
  end loop;

  -- 5. The record of it, with the merged-away records as they are now.
  insert into public.crm_merges (kept_enquiry_id, kept_ref, gone_enquiry_id, gone_ref, gone_name, joins, snapshot, choices, warnings, files, by_id, by_name)
  values (v_keep, k.customer_ref, v_dup, d.customer_ref, d.name, coalesce(p->'log'->'joins', '[]'),
          jsonb_build_object(
            'customer', case when v_dup is null then null else to_jsonb(d) end,
            'jobs', coalesce((select jsonb_agg(to_jsonb(cp)) from public.crm_projects cp
                               where cp.id in (select (y->>'from')::uuid from jsonb_array_elements(v_joins) y)), '[]'::jsonb)),
          coalesce(p->'log'->'choices', '{}'),
          array(select jsonb_array_elements_text(coalesce(p->'log'->'warnings', '[]'))),
          coalesce(p->'files', '[]'), v_by, p->>'by_name')
  returning id into v_merge;

  -- What moves to the kept record: everything of the merged-away customer and their jobs (or of the joined jobs).
  v_counted := case when v_dup is null then array(select (y->>'from')::uuid from jsonb_array_elements(v_joins) y)
                  else array(select id from public.crm_projects where enquiry_id = v_dup) end;
  v_summary := public.crm_merge_counts(case when v_dup is null then '{}'::uuid[] else array[v_dup] end, v_counted, v_internal);
  if v_dup is null then v_summary := v_summary - 'crm_projects'; end if;

  -- 6. Each job joined into another.
  for j in select * from jsonb_array_elements(v_joins) loop
    v_from := (j->>'from')::uuid;
    v_into := (j->>'into')::uuid;

    -- Its lead joins the kept job's (counted, never sold twice), or with the credit swapped takes its place.
    -- No lead of its own (one customer's job made twice): nothing to add.
    if jsonb_typeof(j->'origin_from') is distinct from 'object' then
      update public.crm_lead_origins set role = 'also' where project_id = v_from and role = 'own';
    elsif j->>'credit' = 'from' then
      update public.crm_lead_origins set role = 'also' where project_id = v_into and role = 'own';
      if not found then perform public.crm_merge_origin(j->'origin_into', v_into, 'also', v_merge); end if;
      if not exists (select 1 from public.crm_lead_origins where project_id = v_from and role = 'own') then
        perform public.crm_merge_origin(j->'origin_from', v_into, 'own', v_merge);
      end if;
    else
      update public.crm_lead_origins set role = 'also' where project_id = v_from and role = 'own';
      if not found then perform public.crm_merge_origin(j->'origin_from', v_into, 'also', v_merge); end if;
    end if;

    -- One open survey of each kind per job: the one with answers stays (both with answers was refused above in the app).
    if to_regclass('public.crm_surveys') is not null then
      for sf in select id, type, answers from public.crm_surveys where project_id = v_from and status in ('booked', 'draft') loop
        select id, answers into sk from public.crm_surveys where project_id = v_into and type = sf.type and status in ('booked', 'draft');
        if found then
          if sf.answers <> '{}'::jsonb and sk.answers <> '{}'::jsonb then raise exception 'merge:surveys'; end if;
          update public.crm_surveys set status = 'cancelled', updated_at = now()
           where id = case when sf.answers <> '{}'::jsonb then sk.id else sf.id end;
          v_cancelled := public.crm_merge_add(v_cancelled, '{"crm_surveys": 1}');
        end if;
      end loop;
    end if;

    -- One live booking per job: the other is cancelled (the app says which, with the survey it keeps).
    if to_regclass('public.survey_bookings') is not null then
      select id into live_f from public.survey_bookings where project_id = v_from and status in ('requested', 'confirmed');
      select id into live_k from public.survey_bookings where project_id = v_into and status in ('requested', 'confirmed');
      if live_f is not null and live_k is not null then
        update public.survey_bookings
           set status = 'cancelled', cancel_reason = p->>'cancel_reason', cancelled_at = now(), updated_at = now()
         where id = case when j->>'cancel_booking' = 'into' then live_k else live_f end;
        v_cancelled := public.crm_merge_add(v_cancelled, '{"survey_bookings": 1}');
      end if;
    end if;

    -- A quote waiting to be signed: only the kept job's, if it has one (so the portal offers the right one).
    if exists (select 1 from public.crm_documents where project_id = v_into and needs_signature) then
      update public.crm_documents set needs_signature = false where project_id = v_from and needs_signature;
      get diagnostics n = row_count;
      if n > 0 then v_cancelled := public.crm_merge_add(v_cancelled, jsonb_build_object('crm_documents', n)); end if;
    end if;

    -- The kept job's details (src/lib/crm/merge-rules.ts combineJobs), after clearing what moves off the other
    -- (its links, its Outlook copy), so nothing unique is in two places and its delete leaves Outlook alone.
    perform public.crm_merge_set('public.crm_projects', v_from, j->'set_from');
    perform public.crm_merge_set('public.crm_projects', v_into, j->'set');
    for x in select * from jsonb_array_elements(coalesce(j->'tasks', '[]')) loop
      insert into public.tasks (title, notes, due_date, crm_project_id, assignee_id, created_by)
      values (x->>'title', x->>'notes', nullif(x->>'due_date', '')::date, v_into,
              (select id from public.profiles where id = nullif(x->>'assignee_id', '')::uuid), v_by);
    end loop;
    if to_regclass('public.calendar_tombstones') is not null then
      insert into public.calendar_tombstones (mailbox, event_id)
      select y->>'mailbox', y->>'event_id' from jsonb_array_elements(coalesce(j->'tombstones', '[]')) y
       where y->>'mailbox' is not null and y->>'event_id' is not null
      on conflict do nothing;
    end if;

    -- Everything that points at the job, wherever it is.
    r := public.crm_merge_move('public.crm_projects', v_from, v_into, v_policies, v_skip);
    v_moved := public.crm_merge_add(v_moved, r->'moved');
    v_dropped := public.crm_merge_add(v_dropped, r->'dropped');
    v_cancelled := public.crm_merge_add(v_cancelled, r->'cancelled');
    left_over := public.crm_merge_left('public.crm_projects', array[v_from]);
    if left_over is not null then raise exception 'merge:left' using detail = left_over; end if;
    delete from public.crm_projects where id = v_from;
    -- A job's own lead is counted in Reports when the job was made, like any other job's.
    update public.crm_lead_origins o set job_created_at = cp.created_at
      from public.crm_projects cp where cp.id = v_into and o.project_id = v_into and o.role = 'own';
  end loop;

  -- 7. The customer.
  if v_dup is not null then
    -- Automatic WhatsApps still waiting for the merged-away record (staff's own Send later messages move and stay).
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'whatsapp_outbox' and column_name = 'kind') then
      execute 'update public.whatsapp_outbox set status = ''cancelled'', last_error = $3 where enquiry_id = $1 and status = ''pending'' and kind = any($2)'
        using v_dup, array(select jsonb_array_elements_text(coalesce(p->'outbox_cancel_kinds', '["reply","intro","chase"]'))), p->>'cancel_reason';
      get diagnostics n = row_count;
    elsif to_regclass('public.whatsapp_outbox') is not null then
      update public.whatsapp_outbox set status = 'cancelled', last_error = p->>'cancel_reason' where enquiry_id = v_dup and status = 'pending';
      get diagnostics n = row_count;
    else
      n := 0;
    end if;
    if n > 0 then v_cancelled := public.crm_merge_add(v_cancelled, jsonb_build_object('whatsapp_outbox', n)); end if;

    -- "Not the same person" pairs: rewritten for the kept customer (lowest id first); the pair itself goes.
    insert into public.crm_distinct_pairs (a, b, by_id, at)
    select least(v_keep, o), greatest(v_keep, o), by_id, at
      from (select case when a = v_dup then b else a end as o, by_id, at from public.crm_distinct_pairs where v_dup in (a, b)) y
     where o <> v_keep
    on conflict do nothing;
    delete from public.crm_distinct_pairs where v_dup in (a, b);

    -- Their jobs that move across keep the lead they came in with.
    for x in select * from jsonb_array_elements(coalesce(p->'own_origins', '[]')) loop
      if exists (select 1 from public.crm_projects where id = (x->>'project_id')::uuid and enquiry_id = v_dup)
         and not exists (select 1 from public.crm_lead_origins where project_id = (x->>'project_id')::uuid and role = 'own') then
        perform public.crm_merge_origin(x, (x->>'project_id')::uuid, 'own', v_merge);
      end if;
    end loop;

    -- The details chosen (unique ones, like the Meta lead id, cleared on the other first), then the chat's state.
    perform public.crm_merge_set('public.enquiries', v_dup, p->'customer'->'clear');
    perform public.crm_merge_set('public.enquiries', v_keep, p->'customer'->'set');
    if to_jsonb(k) ? 'wa_unread' then
      update public.enquiries e
         set wa_unread = coalesce(e.wa_unread, 0) + coalesce(d.wa_unread, 0),
             wa_last_message_at = greatest(e.wa_last_message_at, d.wa_last_message_at),
             wa_auto_off = coalesce(e.wa_auto_off, false) or coalesce(d.wa_auto_off, false)
       where e.id = v_keep;
    end if;
    if to_jsonb(k) ? 'wa_reminded_at' then
      update public.enquiries e set wa_reminded_at = greatest(e.wa_reminded_at, d.wa_reminded_at) where e.id = v_keep;
    end if;

    -- Moved jobs behind one the kept customer is already further on with: no more "still interested?".
    update public.crm_projects set sequence_stopped_at = now()
     where id in (select (jsonb_array_elements_text(coalesce(p->'stop_sequences', '[]')))::uuid) and sequence_stopped_at is null;

    r := public.crm_merge_move('public.enquiries', v_dup, v_keep, v_policies, v_skip);
    v_moved := public.crm_merge_add(v_moved, r->'moved');
    v_dropped := public.crm_merge_add(v_dropped, r->'dropped');
    v_cancelled := public.crm_merge_add(v_cancelled, r->'cancelled');

    -- A website booking flagged as a possible duplicate of the other record is now the same person.
    if to_regclass('public.survey_bookings') is not null then
      update public.survey_bookings set duplicate_of = null where duplicate_of = v_keep and enquiry_id = v_keep;
    end if;
  end if;

  -- 8. Old ids, references, numbers, emails, Meta lead ids and links keep finding the record that stayed.
  insert into public.crm_aliases (kind, value, shown, from_ref, enquiry_id, project_id, merge_id)
  select y->>'kind', y->>'value', y->>'shown', y->>'from_ref', v_keep,
         (select id from public.crm_projects where id = nullif(y->>'project_id', '')::uuid), v_merge
    from jsonb_array_elements(coalesce(p->'aliases', '[]')) y
   where coalesce(y->>'value', '') <> ''
  on conflict (kind, value) do nothing;

  -- 9. Notifications link by text: they open the kept record now.
  if to_regclass('public.notifications') is not null then
    for x in
      select jsonb_build_object('o', v_dup, 'n', v_keep) where v_dup is not null
      union all
      select jsonb_build_object('o', y->>'from', 'n', y->>'into') from jsonb_array_elements(v_joins) y
    loop
      update public.notifications set href = replace(href, x->>'o', x->>'n') where href like '%' || (x->>'o') || '%';
    end loop;
    if v_dup is not null and exists (select 1 from information_schema.columns
                                      where table_schema = 'public' and table_name = 'notifications' and column_name = 'ref') then
      execute 'update public.notifications set ref = replace(ref, $1::text, $2::text) where ref in (''wa:'' || $1, ''wa-reply:'' || $1, ''lead:'' || $1)'
        using v_dup, v_keep;
      -- A new-lead alert for someone we've already been in touch with is done with.
      if exists (select 1 from public.crm_projects where enquiry_id = v_keep and first_contact_at is not null) then
        execute 'update public.notifications set read_at = now() where ref = ''lead:'' || $1 and read_at is null' using v_keep;
      end if;
    end if;
  end if;

  -- 10. Nothing left pointing at the merged-away customer (it would go with it), then it goes.
  if v_dup is not null then
    left_over := public.crm_merge_left('public.enquiries', array[v_dup]);
    if left_over is not null then raise exception 'merge:left' using detail = left_over; end if;
    delete from public.enquiries where id = v_dup;
  end if;

  -- 11. The kept customer's timeline says what happened.
  select string_agg(format('%s %s', (v_summary->>(y->>'table'))::int,
                           case when (v_summary->>(y->>'table'))::int = 1 then y->>'one' else y->>'many' end), ', ' order by ord)
    into v_text
    from jsonb_array_elements(coalesce(p->'labels', '[]')) with ordinality t(y, ord)
   where coalesce((v_summary->>(y->>'table'))::int, 0) > 0;
  v_body := replace(coalesce(p->>'timeline', ''), '{moved}', coalesce(v_text, 'nothing else'));
  if v_body <> '' then
    insert into public.crm_activities (enquiry_id, project_id, kind, body, meta, by_id)
    values (v_keep, (select id from public.crm_projects where id = nullif(p->>'timeline_job', '')::uuid), 'system', v_body,
            jsonb_build_object('merge_id', v_merge), v_by);
  end if;

  v_cancelled := public.crm_merge_add(v_cancelled, v_dropped);
  update public.crm_merges set moved = v_moved, cancelled = v_cancelled, summary = v_summary where id = v_merge;
  return jsonb_build_object('ok', true, 'merge_id', v_merge, 'kept', jsonb_build_object('id', k.id, 'ref', k.customer_ref),
                            'summary', v_summary, 'moved', v_moved, 'cancelled', v_cancelled, 'files', coalesce(p->'files', '[]'));
end $$;

-- The one the app calls. dry_run: everything above runs, then it's all undone and the counts come back,
-- so the summary shown before Merge comes from the very code that will run.
create or replace function public.crm_merge(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_detail text;
begin
  if coalesce((p->>'dry_run')::boolean, false) then
    begin
      r := public.crm_merge_run(p);
      raise exception 'merge:dry-run' using errcode = 'HXDRY', detail = r::text;
    exception when sqlstate 'HXDRY' then
      get stacked diagnostics v_detail = pg_exception_detail;
      return v_detail::jsonb || jsonb_build_object('dry_run', true);
    end;
  end if;
  return public.crm_merge_run(p);
end $$;

alter table public.crm_merges         enable row level security;
alter table public.crm_aliases        enable row level security;
alter table public.crm_lead_origins   enable row level security;
alter table public.crm_distinct_pairs enable row level security;

do $$ declare f text; begin
  foreach f in array array[
    'public.crm_merge_set(regclass, uuid, jsonb)', 'public.crm_merge_expect(regclass, uuid, jsonb)', 'public.crm_merge_add(jsonb, jsonb)',
    'public.crm_merge_fks(regclass)', 'public.crm_merge_move(regclass, uuid, uuid, jsonb, text[])', 'public.crm_merge_left(regclass, uuid[])',
    'public.crm_merge_counts(uuid[], uuid[], text[])', 'public.crm_merge_contract(uuid)', 'public.crm_merge_origin(jsonb, uuid, text, uuid)',
    'public.crm_merge_run(jsonb)', 'public.crm_merge(jsonb)']
  loop
    execute 'revoke execute on function ' || f || ' from public, anon, authenticated';
  end loop;
end $$;
grant execute on function public.crm_merge(jsonb) to service_role;

notify pgrst, 'reload schema';
