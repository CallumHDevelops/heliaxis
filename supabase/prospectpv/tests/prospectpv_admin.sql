\set ON_ERROR_STOP 1
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');
insert into pv_packages (name, min_panels) values ('AdminTest', 1);

create or replace function pg_temp.payload(code text, line1 text default '12 Transton Road', pc text default 'NP19 7AB', uprn text default null)
returns jsonb language sql as $$
  select jsonb_build_object('batch_name','', 'address_line1', line1, 'town','Newport', 'postcode', pc, 'uprn', uprn,
    'template_key', 5, 'template_version', 1, 'short_code', code, 'panel_count', 12, 'kwp', 5.4, 'indicative_kwh', 4800,
    'main_aspect','S', 'storeys', 2, 'elevation_width_m', 9.4, 'scaffold_est', 890,
    'package_id', (select id from pv_packages where name='AdminTest'), 'printed_values', '{"address":{"line1":"12 Transton Road"}}'::jsonb) $$;

select pg_temp.assert((select value->>'end_return_m' from pv_settings where key='scaffolding') = '1', 'scaffolding setting seeded');
select pg_temp.assert((select value->'rate_per_m2_gbp' from pv_settings where key='scaffolding') = 'null'::jsonb, 'scaffolding rate is [TBC] (null), not invented');
select pg_temp.assert((select value->'yield_kwh_per_kwp' from pv_settings where key='generation') = 'null'::jsonb, 'generation yield is [TBC]');
select pg_temp.assert((select public from storage.buckets where id='prospectpv-assets'), 'assets bucket exists and is public');

-- Not staff
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","app_metadata":{"roles":[]}}';
do $$ begin perform public.pv_issue_letter(pg_temp.payload('AAAAAAAA')); raise exception 'FAIL not blocked';
exception when insufficient_privilege then raise notice 'ok  non-staff cannot issue letters'; end $$;

-- Staff
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"roles":["prospectpv_staff"]}}';
create temp table r1 as select public.pv_issue_letter(pg_temp.payload('K2K2K2K2')) as r;
select pg_temp.assert((select (r->>'uprn')::bigint < 0 from r1), 'address without a UPRN gets a negative manual number');
select pg_temp.assert((select count(*) from pv_letters where short_code='K2K2K2K2' and source='manual' and created_by='00000000-0000-0000-0000-0000000000a1') = 1, 'letter stored as manual with its creator');
select pg_temp.assert((select count(*) from pv_campaigns where name='Manual letters' and search_value='manual') = 1, 'manual campaign created');
select pg_temp.assert((select expires_at > now() + interval '11 months' from pv_letters where short_code='K2K2K2K2'), 'expiry uses the 12 month setting');
select pg_temp.assert((select scaffold_est = 890 and storeys = 2 from pv_roof_assessments where uprn = (select (r->>'uprn')::bigint from r1)), 'scaffold estimate and storeys kept on the assessment');
select pg_temp.assert((select printed_values->'address'->>'line1' from pv_letters where short_code='K2K2K2K2') = '12 Transton Road', 'printed values stored');

-- Same address again, different spelling: same property, blocked by the re-mail window
do $$ begin perform public.pv_issue_letter(pg_temp.payload('M3M3M3M3', ' 12 transton road ', 'np197ab')); raise exception 'FAIL remail';
exception when sqlstate 'PV002' then raise notice 'ok  same address (any spelling) blocked inside the re-mail window: %', left(sqlerrm, 60); end $$;
select pg_temp.assert((select count(*) from pv_properties where address_line1 ilike '%transton%') = 1, 'no duplicate property for a re-typed address');

-- Suppression blocks, by address text even before a property exists
insert into pv_suppression (address, reason) values ('9 Opt Out Close, Newport, NP20 1XX', 'test');
do $$ begin perform public.pv_issue_letter(pg_temp.payload('N4N4N4N4', '9 Opt Out Close', 'NP20 1XX')); raise exception 'FAIL suppression';
exception when sqlstate 'PV001' then raise notice 'ok  suppressed address blocked'; end $$;

-- A collision on the short code keeps nothing (no orphan property)
do $$ begin perform public.pv_issue_letter(pg_temp.payload('K2K2K2K2', '5 Fresh Street', 'NP20 2AA')); raise exception 'FAIL collision';
exception when unique_violation then raise notice 'ok  duplicate code raises 23505'; end $$;
select pg_temp.assert((select count(*) from pv_properties where address_line1 = '5 Fresh Street') = 0, 'failed issue leaves no orphan property');

-- Real UPRN path; existing OS property not overwritten
reset role;
insert into pv_properties (uprn, address_line1, town, postcode) values (10090000001, '1 OS Road', 'Newport', 'NP20 3BB');
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"roles":["prospectpv_staff"]}}';
select public.pv_issue_letter(pg_temp.payload('P5P5P5P5', 'Different Name', 'NP20 3BB', '10090000001'));
select pg_temp.assert((select address_line1 from pv_properties where uprn = 10090000001) = '1 OS Road', 'real UPRN property is not overwritten');

-- Storage: only admins upload
do $$ begin insert into storage.objects (bucket_id, name) values ('prospectpv-assets', 'x.png'); raise exception 'FAIL staff upload';
exception when insufficient_privilege then raise notice 'ok  staff cannot upload brand images'; end $$;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"roles":["prospectpv_admin"]}}';
insert into storage.objects (bucket_id, name) values ('prospectpv-assets', 'accreditations/a.png');
select pg_temp.assert((select count(*) from storage.objects where bucket_id='prospectpv-assets') = 1, 'admin can upload brand images');
reset role;

-- Landing page returns current brand images
update pv_letter_assets set storage_path = 'accreditations/a.png' where slot = 'accreditations';
select pg_temp.assert(pv_landing_open('K2K2K2K2') -> 'assets' ->> 'accreditations' = 'accreditations/a.png', 'landing page gets current brand images');
select pg_temp.assert(not (pv_landing_open('K2K2K2K2') -> 'assets' ? 'logo'), 'unset slots are left out');
