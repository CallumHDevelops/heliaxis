\set ON_ERROR_STOP 1
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2');

-- ~100 m x 100 m square in Cardiff (about 1 ha)
create or replace function pg_temp.square(w float8 default 0.0014286, h float8 default 0.0008983) returns jsonb language sql as $$
  select jsonb_build_object('type','Polygon','coordinates', jsonb_build_array(jsonb_build_array(
    jsonb_build_array(-3.18, 51.48), jsonb_build_array(-3.18 + w, 51.48), jsonb_build_array(-3.18 + w, 51.48 + h),
    jsonb_build_array(-3.18, 51.48 + h), jsonb_build_array(-3.18, 51.48)))) $$;

-- Constraints and settings
reset role;
delete from pv_campaigns;
insert into pv_campaigns (name, search_type, search_value) values ('c1', 'polygon', 'x');
do $$ begin insert into pv_campaigns (name, search_type, search_value) values ('c2', 'circle', 'x'); raise exception 'FAIL bad type';
exception when check_violation then raise notice 'ok  unknown search_type still rejected'; end $$;
insert into pv_campaigns (name, search_type, search_value) values ('c3', 'postcode', 'CF10'), ('c4', 'sector', 'CF10 1'), ('c5', 'town', 'Cardiff');
select pg_temp.assert(true, 'postcode, sector and town still accepted');
insert into pv_scan_jobs (campaign_id, stage) select id, 'ranking' from pv_campaigns where name='c1';
select pg_temp.assert((select count(*) from pv_scan_jobs where stage='ranking') = 1, 'scan job accepts the ranking stage');
do $$ begin insert into pv_scan_jobs (campaign_id, stage) select id, 'bogus' from pv_campaigns where name='c1'; raise exception 'FAIL stage';
exception when check_violation then raise notice 'ok  unknown scan stage rejected'; end $$;
delete from pv_campaigns;

select pg_temp.assert((select (value->>'max_area_ha')::numeric > 0 from pv_settings where key='map'), 'map area cap seeded (placeholder)');
select pg_temp.assert((select value->'default_center' ->> 1 from pv_settings where key='map') is not null, 'map default centre seeded');
select pg_temp.assert((select value->'reference_kwh' from pv_settings where key='ranking') = 'null'::jsonb, 'ranking reference_kwh is [TBC] (null), not invented');
select pg_temp.assert((select value->'system_loss_factor' from pv_settings where key='ranking') = 'null'::jsonb, 'system loss factor is [TBC] (null)');
select pg_temp.assert((select (value->>'w_generation')::numeric + (value->>'w_yield')::numeric + (value->>'w_confidence')::numeric from pv_settings where key='ranking') = 1.0, 'ranking weights add up to one');
select pg_temp.assert((select value->>'free_calls_per_month' from pv_settings where key='solar') = '10000', 'google free allowance recorded in solar settings');
select pg_temp.assert((select value->'cost_per_call_gbp' from pv_settings where key='solar') = 'null'::jsonb, 'cost per call still [TBC]');

-- Anonymous cannot touch any of it
set role anon;
do $$ begin perform public.pv_measure_area(pg_temp.square()); raise exception 'FAIL anon measure';
exception when insufficient_privilege then raise notice 'ok  anonymous cannot measure an area'; end $$;
do $$ begin perform public.pv_save_drawn_area('x', pg_temp.square()); raise exception 'FAIL anon save';
exception when insufficient_privilege then raise notice 'ok  anonymous cannot save an area'; end $$;
do $$ begin perform public.pv_month_api_calls('google_solar'); raise exception 'FAIL anon calls';
exception when insufficient_privilege then raise notice 'ok  anonymous cannot read call counts'; end $$;
reset role;

-- A user with no ProspectPV role
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","app_metadata":{"roles":[]}}';
do $$ begin perform public.pv_save_drawn_area('x', pg_temp.square()); raise exception 'FAIL non-staff save';
exception when insufficient_privilege then raise notice 'ok  a user without a role cannot save an area'; end $$;
select pg_temp.assert(public.pv_month_api_calls('google_solar') is null, 'a user without a role gets no call count');

-- Staff
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"roles":["prospectpv_staff"]}}';
select pg_temp.assert(abs((public.pv_measure_area(pg_temp.square())->>'area_ha')::numeric - 1.0) < 0.05, 'a 100 m square measures about one hectare in British National Grid');
select pg_temp.assert((public.pv_measure_area(pg_temp.square())->>'valid')::boolean, 'measure reports a valid shape');
do $$ begin perform public.pv_measure_area('{"type":"Point","coordinates":[-3.18,51.48]}'::jsonb); raise exception 'FAIL point';
exception when sqlstate '22023' then raise notice 'ok  a point is not an area: %', sqlerrm; end $$;
do $$ begin perform public.pv_measure_area('{"nonsense":true}'::jsonb); raise exception 'FAIL junk';
exception when sqlstate '22023' then raise notice 'ok  junk input gives a plain message'; end $$;

create temp table s1 as select public.pv_save_drawn_area('  Rhiwbina test  ', pg_temp.square(), 1.25) as r;
select pg_temp.assert((select (r->>'area_ha')::numeric between 0.95 and 1.05 from s1), 'save returns the measured area');
select pg_temp.assert((select count(*) from pv_campaigns where id = (select (r->>'campaign_id')::uuid from s1)) = 1, 'campaign created');
select pg_temp.assert((select name = 'Rhiwbina test' from pv_campaigns where id = (select (r->>'campaign_id')::uuid from s1)), 'name trimmed');
select pg_temp.assert((select search_type = 'polygon' and status = 'awaiting_confirmation' and est_api_cost = 1.25 and created_by = '00000000-0000-0000-0000-0000000000b1'
   from pv_campaigns where id = (select (r->>'campaign_id')::uuid from s1)), 'polygon campaign waits for confirmation, with its estimate and creator');
select pg_temp.assert((select extensions.ST_SRID(boundary) = 27700 and extensions.GeometryType(boundary) = 'MULTIPOLYGON'
   from pv_campaigns where id = (select (r->>'campaign_id')::uuid from s1)), 'boundary stored as a MultiPolygon in EPSG:27700');
-- Convert back and confirm it sits where it was drawn (about 15 m tolerance round-trip)
select pg_temp.assert((select extensions.ST_Distance(
    extensions.ST_Transform(extensions.ST_Centroid(boundary), 4326)::extensions.geography,
    extensions.ST_SetSRID(extensions.ST_MakePoint(-3.18 + 0.0014286/2, 51.48 + 0.0008983/2), 4326)::extensions.geography) < 15
   from pv_campaigns where id = (select (r->>'campaign_id')::uuid from s1)), 'the stored area is where it was drawn');

do $$ begin perform public.pv_save_drawn_area('   ', pg_temp.square()); raise exception 'FAIL blank name';
exception when sqlstate '22023' then raise notice 'ok  a blank name is refused'; end $$;
do $$ begin perform public.pv_save_drawn_area('Big', pg_temp.square(0.03, 0.02)); raise exception 'FAIL too big';
exception when sqlstate '22023' then raise notice 'ok  an area over the cap is refused in the database: %', sqlerrm; end $$;
select pg_temp.assert((select count(*) from pv_campaigns) = 1, 'refused saves leave nothing behind');

-- A bow-tie never reaches the table as an invalid shape
create temp table s2 as select public.pv_save_drawn_area('Bow tie', '{"type":"Polygon","coordinates":[[[-3.18,51.48],[-3.178,51.481],[-3.178,51.48],[-3.18,51.481],[-3.18,51.48]]]}'::jsonb) as r;
select pg_temp.assert((select extensions.ST_IsValid(boundary) from pv_campaigns where id = (select (r->>'campaign_id')::uuid from s2)), 'a crossing outline is repaired before it is stored');

-- A MultiPolygon with two shapes
create temp table s3 as select public.pv_save_drawn_area('Two shapes', jsonb_build_object('type','MultiPolygon','coordinates', jsonb_build_array(
  pg_temp.square()->'coordinates',
  jsonb_build_array(jsonb_build_array(jsonb_build_array(-3.17, 51.49), jsonb_build_array(-3.1686, 51.49), jsonb_build_array(-3.1686, 51.4909), jsonb_build_array(-3.17, 51.4909), jsonb_build_array(-3.17, 51.49))))) ) as r;
select pg_temp.assert((select extensions.ST_NumGeometries(boundary) = 2 from pv_campaigns where id = (select (r->>'campaign_id')::uuid from s3)), 'two shapes are kept as one area');

-- Call counts: this month counts, last month does not, other providers do not
reset role;
create temp table before_counts as select
  (select count(*) from pv_api_log where provider='google_solar' and created_at >= date_trunc('month', now())) as solar,
  (select count(*) from pv_api_log where provider='os_places' and created_at >= date_trunc('month', now())) as os;
grant select on before_counts to authenticated;
insert into pv_api_log (provider, endpoint, created_at) values
  ('google_solar', 'a', now()), ('google_solar', 'b', now()),
  ('google_solar', 'old', now() - interval '70 days'), ('os_places', 'c', now());
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"roles":["prospectpv_staff"]}}';
select pg_temp.assert(public.pv_month_api_calls('google_solar') = (select solar from before_counts) + 2, 'call count is this month only, for that provider');
select pg_temp.assert(public.pv_month_api_calls('os_places') = (select os from before_counts) + 1, 'call count is per provider');
