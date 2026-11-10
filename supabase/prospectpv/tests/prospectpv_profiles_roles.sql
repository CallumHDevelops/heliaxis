\set ON_ERROR_STOP 1
-- The real role mapping onto public.profiles (no JWT roles): who counts as ProspectPV staff and admin.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000d3'),
  ('00000000-0000-0000-0000-0000000000d4'), ('00000000-0000-0000-0000-0000000000d5'), ('00000000-0000-0000-0000-0000000000d6');
insert into public.profiles (id, role, status, portals) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin',  'approved', '{}'),
  ('00000000-0000-0000-0000-0000000000d2', 'member', 'approved', '{crm,tasks}'),
  ('00000000-0000-0000-0000-0000000000d3', 'member', 'approved', '{cms,enquiries}'),
  ('00000000-0000-0000-0000-0000000000d4', 'admin',  'pending',  '{}'),
  ('00000000-0000-0000-0000-0000000000d5', 'member', 'rejected', '{crm}'),
  ('00000000-0000-0000-0000-0000000000d6', 'member', 'approved', '{}');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, false); end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert(public.pv_is_admin() and public.pv_is_staff(), 'an approved admin is ProspectPV admin and staff');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.assert(public.pv_is_staff() and not public.pv_is_admin(), 'an approved member with the CRM portal is staff, not admin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.assert(not public.pv_is_staff() and not public.pv_is_admin(), 'a member without the CRM portal has no access');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select pg_temp.assert(not public.pv_is_staff() and not public.pv_is_admin(), 'an admin who is not approved yet has no access');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
select pg_temp.assert(not public.pv_is_staff(), 'a rejected member has no access even with the portal ticked');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d6');
select pg_temp.assert(not public.pv_is_staff(), 'a member with no portals has no access');
select set_config('request.jwt.claims', '', false);
select pg_temp.assert(not public.pv_is_staff() and not public.pv_is_admin(), 'a signed-out request has no access');

-- Through row level security
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
insert into pv_campaigns (name, search_type, search_value) values ('crm member campaign', 'postcode', 'CF10');
select pg_temp.assert((select count(*) from pv_campaigns) = 1, 'CRM staff can create and see campaigns');
select pg_temp.assert((select count(*) from pv_packages) = 4, 'CRM staff can read packages');
update pv_packages set short_description = 'x';
select pg_temp.assert((select count(*) from pv_packages where short_description = 'x') = 0, 'CRM staff cannot edit packages');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.assert((select count(*) from pv_campaigns) = 0, 'a member without the CRM portal sees no campaigns');
select pg_temp.assert((select count(*) from pv_packages) = 0, 'a member without the CRM portal sees no packages');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
update pv_packages set short_description = 'y' where name = 'Home';
select pg_temp.assert((select count(*) from pv_packages where short_description = 'y') = 1, 'an admin can edit packages');
do $$ begin perform public.pv_save_drawn_area('Admin area', '{"type":"Polygon","coordinates":[[[-3.18,51.48],[-3.17,51.48],[-3.17,51.49],[-3.18,51.48]]]}'::jsonb); raise notice 'ok  an admin can save a drawn area';
exception when others then raise exception 'FAIL admin save: %', sqlerrm; end $$;
