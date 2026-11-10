-- ProspectPV · Phase M1: draw an area on a map
--
-- * campaigns can start from a drawn area (search_type 'polygon')
-- * scan jobs get a 'ranking' stage (used from M3, added now so the constraint changes once)
-- * settings for the map limits and the ranking model (numbers left null / [TBC])
-- * two functions: measure a drawn area, and save it as a campaign.
--   Coordinates arrive as WGS84 GeoJSON and are converted to British National Grid
--   here, in the database, never in the browser.

-- 1. search_type -------------------------------------------------------------
alter table public.pv_campaigns drop constraint if exists pv_campaigns_search_type_check;
alter table public.pv_campaigns
  add constraint pv_campaigns_search_type_check
  check (search_type in ('postcode','sector','town','polygon'));

-- 2. scan job stage ----------------------------------------------------------
alter table public.pv_scan_jobs drop constraint if exists pv_scan_jobs_stage_check;
alter table public.pv_scan_jobs
  add constraint pv_scan_jobs_stage_check
  check (stage in ('queued','addresses','buildings','os_screen','solar','matching','ranking','done'));

-- 3. settings ----------------------------------------------------------------
insert into public.pv_settings (key, value, description) values
('map', jsonb_build_object(
   'max_area_ha', 50,            -- [TBC] placeholder: stops a slip of the mouse covering a town
   'max_homes_per_scan', 2000,   -- [TBC] placeholder
   'max_shapes', 5,
   'max_vertices', 500,
   'default_center', jsonb_build_array(-3.1791, 51.4816),  -- Cardiff, lng/lat [TBC]
   'default_zoom', 12
 ), 'Map and drawing limits. The two caps are placeholders [TBC]: confirm with Heliaxis'),
('ranking', jsonb_build_object(
   'w_generation', 0.5,          -- starting points to review, not facts (reference section 5)
   'w_yield', 0.3,
   'w_confidence', 0.2,
   'reference_kwh', null,        -- [TBC] set from real South Wales results
   'yield_low', null,            -- [TBC]
   'yield_high', null,           -- [TBC]
   'system_loss_factor', null    -- [TBC] DC figure to indicative kWh
 ), 'Ranking model (M3). Weights are starting points. The reference values are [TBC]')
on conflict (key) do nothing;

-- Google Solar free allowance: the number the estimate panel compares against.
update public.pv_settings
   set value = value || jsonb_build_object('free_calls_per_month', 10000),
       description = description || ' · free_calls_per_month: from Google pricing page at time of writing, recheck'
 where key = 'solar' and not (value ? 'free_calls_per_month');

-- 4. measure a drawn area ----------------------------------------------------
-- Input: GeoJSON Polygon or MultiPolygon in WGS84. Output: hectares in British
-- National Grid, number of shapes and whether the geometry is valid.
create or replace function public.pv_measure_area(p_geojson jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  g  extensions.geometry;
  bng extensions.geometry;
begin
  if p_geojson is null then raise exception 'No area given' using errcode = '22023'; end if;
  begin
    g := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_geojson::text), 4326);
  exception when others then
    raise exception 'That is not a readable area' using errcode = '22023';
  end;
  if extensions.GeometryType(g) not in ('POLYGON','MULTIPOLYGON') then
    raise exception 'The area must be a polygon' using errcode = '22023';
  end if;
  bng := extensions.ST_Transform(g, 27700);
  return jsonb_build_object(
    'area_ha', round((extensions.ST_Area(bng) / 10000.0)::numeric, 3),
    'shapes',  extensions.ST_NumGeometries(g),
    'valid',   extensions.ST_IsValid(bng)
  );
end $$;

-- 5. save a drawn area as a campaign -----------------------------------------
-- Staff only (RLS on pv_campaigns does the enforcing). The area limit is checked
-- here as well as in the app, so a crafted request can't get past it.
create or replace function public.pv_save_drawn_area(
  p_name text,
  p_geojson jsonb,
  p_est_cost numeric default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cfg     jsonb := coalesce((select value from public.pv_settings where key = 'map'), '{}'::jsonb);
  max_ha  numeric := nullif(cfg ->> 'max_area_ha', '')::numeric;
  g       extensions.geometry;
  bng     extensions.geometry;
  ha      numeric;
  cid     uuid;
  nm      text := left(btrim(coalesce(p_name, '')), 80);
begin
  if not public.pv_is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if nm = '' then raise exception 'Give the area a name' using errcode = '22023'; end if;

  g := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_geojson::text), 4326);
  if extensions.GeometryType(g) not in ('POLYGON','MULTIPOLYGON') then
    raise exception 'The area must be a polygon' using errcode = '22023';
  end if;
  bng := extensions.ST_Transform(g, 27700);
  if not extensions.ST_IsValid(bng) then
    bng := extensions.ST_MakeValid(bng);
  end if;
  -- ST_MakeValid can return collections; keep the polygon parts only.
  bng := extensions.ST_Multi(extensions.ST_CollectionExtract(bng, 3));
  if bng is null or extensions.ST_IsEmpty(bng) then
    raise exception 'The area is empty' using errcode = '22023';
  end if;

  ha := round((extensions.ST_Area(bng) / 10000.0)::numeric, 3);
  if ha <= 0 then raise exception 'The area is empty' using errcode = '22023'; end if;
  if max_ha is not null and ha > max_ha then
    raise exception 'The area is % ha; the limit is % ha', ha, max_ha using errcode = '22023';
  end if;

  insert into public.pv_campaigns (name, search_type, search_value, boundary, status, created_by, est_api_cost)
  values (nm, 'polygon', 'Drawn area, ' || ha || ' ha', extensions.ST_Multi(bng), 'awaiting_confirmation', auth.uid(), p_est_cost)
  returning id into cid;

  return jsonb_build_object('campaign_id', cid, 'area_ha', ha);
end $$;

revoke all on function public.pv_measure_area(jsonb), public.pv_save_drawn_area(text, jsonb, numeric) from public, anon;
grant execute on function public.pv_measure_area(jsonb), public.pv_save_drawn_area(text, jsonb, numeric) to authenticated;

-- 6. API calls so far this month (UK calendar month, like pv_month_api_spend) ---
-- Staff see a count only, which is what the estimate needs for "free allowance left".
create or replace function public.pv_month_api_calls(p_provider text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.pv_is_staff() then (
    select count(*) from public.pv_api_log
    where provider = p_provider
      and created_at >= (date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London')
  ) else null end;
$$;
revoke all on function public.pv_month_api_calls(text) from public, anon;
grant execute on function public.pv_month_api_calls(text) to authenticated;
