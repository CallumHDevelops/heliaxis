\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;

-- Fixture: a building, a property, a campaign and a letter
insert into pv_buildings (os_building_id, footprint, roof_shape, aspect_s, aspect_n)
values ('osgb100', ST_Multi(ST_GeomFromText('POLYGON((331000 188000, 331010 188000, 331010 188007, 331000 188007, 331000 188000))', 27700)), 'Pitched', 24, 24);
insert into pv_properties (uprn, address_line1, town, postcode, os_building_id, location)
values (10023456789, '12 Transton Road', 'Newport', 'NP19 7AB', 'osgb100', ST_SetSRID(ST_MakePoint(331005, 188003), 27700));
insert into pv_campaigns (id, name, search_type, search_value) values ('11111111-1111-1111-1111-111111111111', 'NP19 7 test', 'sector', 'NP19 7');
insert into pv_letters (campaign_id, uprn, template_key, template_version, short_code, expires_at, printed_values)
values ('11111111-1111-1111-1111-111111111111', 10023456789, 5, 1, '7KQ4M2XA', now() + interval '12 months',
        '{"address":{"line1":"12 Transton Road"},"estimate":{"panelCount":12}}');

select pg_temp.assert((select count(*) from pv_settings) = 17, 'settings seeded (15 original, plus map and ranking)');
select pg_temp.assert((select count(*) from pv_packages where not active) = 4, 'packages seeded inactive');

-- Constraints
do $$ begin
  update pv_packages set active = true where name = 'Home';
  raise exception 'FAIL: incomplete package activated';
exception when check_violation then raise notice 'ok  incomplete package cannot go active'; end $$;
do $$ begin
  insert into pv_letters (campaign_id, uprn, template_key, template_version, short_code, expires_at, printed_values)
  values ('11111111-1111-1111-1111-111111111111', 10023456789, 5, 1, 'ABC0DEF1', now(), '{}');
  raise exception 'FAIL: ambiguous code accepted';
exception when check_violation then raise notice 'ok  codes with 0/O/1/I rejected'; end $$;

-- Re-mail window: a letter exists, so we can't mail again
select pg_temp.assert(pv_can_mail(10023456789) = false, 'remail window blocks second letter');
select pg_temp.assert(pv_can_mail(999) = true, 'unmailed uprn is mailable');

-- Landing open
select pg_temp.assert(pv_landing_open('nope') is null, 'junk code returns null');
select pg_temp.assert(pv_landing_open('7KQ4M2XB') is null, 'unknown code returns null');
select pg_temp.assert((pv_landing_open('7kq4m2xa') ->> 'firstView')::boolean = true, 'lower-case code opens, first view');
select pg_temp.assert((pv_landing_open('7KQ4M2XA') ->> 'firstView')::boolean = false, 'second view not first');
select pg_temp.assert((select view_count from pv_letters where short_code='7KQ4M2XA') = 2, 'view count = 2');
select pg_temp.assert((select count(*) from pv_responses where type='qr_scan') = 1, 'exactly one qr_scan response');
select pg_temp.assert(pv_landing_open('7KQ4M2XA') -> 'printed' -> 'address' ->> 'line1' = '12 Transton Road', 'printed values returned');
select pg_temp.assert((pv_landing_open('7KQ4M2XA') -> 'settings') ? 'calc.coefficients', 'calc settings returned');
select pg_temp.assert(not ((pv_landing_open('7KQ4M2XA') -> 'settings') ? 'spend'), 'internal settings not exposed');

-- Booking
do $$ begin
  perform pv_submit_booking('7KQ4M2XA', '{"consent": false}');
  raise exception 'FAIL: booking without consent';
exception when invalid_parameter_value then raise notice 'ok  booking without consent rejected'; end $$;
select pg_temp.assert(pv_submit_booking('7KQ4M2XA', '{"consent": true, "name": "Test"}') is not null, 'booking stored');

-- Expiry
update pv_letters set expires_at = now() - interval '1 day' where short_code='7KQ4M2XA';
select pg_temp.assert(pv_landing_open('7KQ4M2XA') is null, 'expired code returns null');

-- Opt-out still works after expiry, and suppresses
select pg_temp.assert(pv_opt_out('7KQ4M2XA'), 'opt out on expired code');
select pg_temp.assert(pv_opt_out('7KQ4M2XA'), 'opt out is idempotent');
select pg_temp.assert((select count(*) from pv_suppression where uprn=10023456789) = 1, 'one suppression row');
select pg_temp.assert((select address from pv_suppression) = '12 Transton Road, Newport, NP19 7AB', 'suppression address formatted');
delete from pv_letters;
select pg_temp.assert(pv_can_mail(10023456789) = false, 'suppressed uprn not mailable');

-- Rate limit
select pg_temp.assert(pv_rate_limit_hit('t', 60, 2) and pv_rate_limit_hit('t', 60, 2) and not pv_rate_limit_hit('t', 60, 2), 'rate limit allows 2 then blocks');
update pv_rate_limits set window_start = now() - interval '2 minutes';
select pg_temp.assert(pv_rate_limit_hit('t', 60, 2), 'rate limit window resets');

-- Spend
insert into pv_api_log (provider, endpoint, est_cost) values ('google_solar', 'buildingInsights:findClosest', 0.05), ('os_places', 'postcode', 0);
select pg_temp.assert(pv_month_api_spend() = 0.05, 'month spend sums');

-- Booking context (re-create a live letter first)
insert into pv_letters (campaign_id, uprn, template_key, template_version, short_code, expires_at, printed_values)
values ('11111111-1111-1111-1111-111111111111', 10023456789, 5, 1, '9PQRSTUV', now() + interval '1 year', '{"package":{"priceIncVat":9000}}');
select pg_temp.assert((pv_booking_context('9pqrstuv') -> 'printed' -> 'package' ->> 'priceIncVat')::int = 9000, 'booking context returns printed price');
select pg_temp.assert((select view_count from pv_letters where short_code='9PQRSTUV') = 0, 'booking context does not count a view');
select pg_temp.assert(pv_booking_context('ZZZZZZZZ') is null, 'booking context null for unknown code');
