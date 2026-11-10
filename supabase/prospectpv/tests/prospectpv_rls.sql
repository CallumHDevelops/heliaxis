\set ON_ERROR_STOP 1
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;
-- anon sees nothing and can't call public functions
set role anon;
do $$ begin perform 1 from public.pv_packages; raise exception 'FAIL anon read'; exception when insufficient_privilege then raise notice 'ok  anon cannot read tables'; end $$;
do $$ begin perform public.pv_landing_open('7KQ4M2XA'); raise exception 'FAIL anon rpc'; exception when insufficient_privilege then raise notice 'ok  anon cannot call landing rpc'; end $$;
reset role;
-- authenticated without role
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"roles":[]}}';
select pg_temp.assert((select count(*) from public.pv_packages) = 0, 'non-ProspectPV user sees no packages');
-- staff
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"roles":["prospectpv_staff"]}}';
select pg_temp.assert((select count(*) from public.pv_packages) = 4, 'staff read packages');
select pg_temp.assert((select count(*) from public.pv_campaigns) = 1, 'staff read campaigns');
update public.pv_packages set short_description = 'x' where name='Home';
select pg_temp.assert((select short_description from public.pv_packages where name='Home') is null, 'staff cannot edit packages');
insert into public.pv_campaigns (name, search_type, search_value) values ('staff campaign', 'postcode', 'NP19 7AB');
select pg_temp.assert((select count(*) from public.pv_campaigns) = 2, 'staff can create campaigns');
delete from public.pv_suppression;
select pg_temp.assert((select count(*) from public.pv_suppression) = 1, 'staff cannot delete suppression');
do $$ begin perform public.pv_landing_open('7KQ4M2XA'); raise exception 'FAIL'; exception when insufficient_privilege then raise notice 'ok  staff cannot call service-only rpc'; end $$;
select pg_temp.assert(public.pv_can_mail(1) = true, 'staff can call pv_can_mail');
-- admin
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","app_metadata":{"roles":["prospectpv_admin"]}}';
update public.pv_packages set short_description = 'Our most popular package' where name='Home';
select pg_temp.assert((select short_description from public.pv_packages where name='Home') = 'Our most popular package', 'admin can edit packages');
select pg_temp.assert((select count(*) from public.pv_campaigns) = 2, 'admin inherits staff access');
