-- ProspectPV · schema
-- All tables are prefixed pv_ to avoid clashes with existing admin tables.
-- Geometry is stored in British National Grid (EPSG:27700), which is what
-- OS NGD and the Cadw / Historic England layers are published in.
-- Transform to 4326 at the edges (Google Solar, web maps) with ST_Transform.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.pv_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuration tables (admin-edited)
-- ---------------------------------------------------------------------------

-- Key/value settings. Values are JSON so thresholds, money and structured
-- blocks (finance, company) live side by side. A null value means [TBC].
create table public.pv_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  value       jsonb,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.pv_packages (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null unique,
  min_panels               int  not null check (min_panels > 0),
  max_panels               int  check (max_panels is null or max_panels >= min_panels),
  panel_model              text,
  panel_watts              int  check (panel_watts is null or panel_watts > 0),
  esa_inverter_model       text,
  battery_module_model     text,
  battery_module_count     int  check (battery_module_count is null or battery_module_count >= 0),
  usable_kwh               numeric(6,2) check (usable_kwh is null or usable_kwh >= 0),
  heated_module            boolean not null default false,
  backup_included          boolean not null default false,
  mounting                 text,
  monitoring_app           text,
  warranty_panel_yrs       int,
  warranty_battery_yrs     int,
  warranty_workmanship_yrs int,
  price_inc_vat            numeric(10,2) check (price_inc_vat is null or price_inc_vat >= 0),
  finance_example_text     text,
  short_description        text,
  -- Which GoodWe ESA benefits this package may show. Keys:
  -- ai_tariff, safety, heating, expandable, backup, all_in_one
  claims                   jsonb not null default '["ai_tariff","safety","expandable","all_in_one"]'::jsonb
                           check (jsonb_typeof(claims) = 'array'),
  active                   boolean not null default false,
  display_order            int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- A package can only go live once everything a letter prints is filled in.
  constraint pv_packages_complete_when_active check (
    not active or (
      panel_model is not null and panel_watts is not null and
      esa_inverter_model is not null and usable_kwh is not null and
      price_inc_vat is not null and monitoring_app is not null and
      warranty_panel_yrs is not null and warranty_battery_yrs is not null
    )
  )
);

create table public.pv_extras (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  description   text,
  price         numeric(10,2) check (price is null or price >= 0),
  -- e.g. {"diverter": true} or {"backup": true} or {"battery_kwh": 5}
  effect        jsonb not null default '{}'::jsonb check (jsonb_typeof(effect) = 'object'),
  active        boolean not null default false,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pv_extras_priced_when_active check (not active or price is not null)
);

create table public.pv_letter_templates (
  id           uuid primary key default gen_random_uuid(),
  template_key smallint not null check (template_key between 1 and 5),
  name         text not null,
  version      int  not null default 1 check (version > 0),
  copy_blocks  jsonb not null default '{}'::jsonb check (jsonb_typeof(copy_blocks) = 'object'),
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (template_key, version)
);

create table public.pv_letter_assets (
  id           uuid primary key default gen_random_uuid(),
  slot         text not null unique check (slot in
               ('logo','logo_white','accreditations','hero','install','team','app','signature','director_photo','esa_unit')),
  storage_path text,
  alt_text     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reference data: OS and heritage layers
-- ---------------------------------------------------------------------------

-- Kept free of residential-only logic so the commercial phase can reuse it.
create table public.pv_buildings (
  id                uuid primary key default gen_random_uuid(),
  os_building_id    text not null unique,
  footprint         extensions.geometry(MultiPolygon, 27700),
  building_use      text,
  roof_shape        text,
  roof_material     text,
  aspect_n          numeric(8,2),
  aspect_ne         numeric(8,2),
  aspect_e          numeric(8,2),
  aspect_se         numeric(8,2),
  aspect_s          numeric(8,2),
  aspect_sw         numeric(8,2),
  aspect_w          numeric(8,2),
  aspect_nw         numeric(8,2),
  solar_present     boolean,
  listed            boolean not null default false,
  conservation_area boolean not null default false,
  os_data_date      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index pv_buildings_footprint_gix on public.pv_buildings using gist (footprint);

create table public.pv_properties (
  id              uuid primary key default gen_random_uuid(),
  uprn            bigint not null unique,
  address_line1   text not null,
  address_line2   text,
  town            text not null,
  postcode        text not null,
  location        extensions.geometry(Point, 27700),
  os_building_id  text references public.pv_buildings (os_building_id) on update cascade on delete set null,
  property_type   text,          -- OS Places classification code, e.g. RD03
  last_scanned_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pv_properties_postcode_idx on public.pv_properties (postcode);
create index pv_properties_building_idx on public.pv_properties (os_building_id);
create index pv_properties_location_gix on public.pv_properties using gist (location);

-- Cadw listed buildings / conservation areas (DataMapWales) and Historic
-- England equivalents, loaded as layers and intersected with footprints.
create table public.pv_heritage_features (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('listed_building','conservation_area')),
  source       text not null,     -- e.g. 'cadw', 'historic_england'
  source_ref   text,
  name         text,
  geom         extensions.geometry(Geometry, 27700) not null,
  loaded_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source, source_ref)
);
create index pv_heritage_features_geom_gix on public.pv_heritage_features using gist (geom);

-- ---------------------------------------------------------------------------
-- Campaigns and pipeline
-- ---------------------------------------------------------------------------

create table public.pv_campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  search_type     text not null check (search_type in ('postcode','sector','town')),
  search_value    text not null,
  boundary        extensions.geometry(MultiPolygon, 27700),
  status          text not null default 'draft' check (status in
                  ('draft','estimating','awaiting_confirmation','scanning','review','letters','sent','archived','failed')),
  created_by      uuid references auth.users (id) on delete set null,
  home_cap        int check (home_cap is null or home_cap > 0),
  est_api_cost    numeric(10,2),
  actual_api_cost numeric(10,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.pv_campaign_templates (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.pv_campaigns (id) on delete cascade,
  template_key smallint not null check (template_key between 1 and 5),
  split_pct    numeric(5,2) not null check (split_pct > 0 and split_pct <= 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, template_key)
);

create table public.pv_scan_jobs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pv_campaigns (id) on delete cascade,
  stage       text not null default 'queued' check (stage in
              ('queued','addresses','buildings','os_screen','solar','matching','done')),
  progress    int not null default 0 check (progress >= 0),
  total       int check (total is null or total >= 0),
  status      text not null default 'queued' check (status in
              ('queued','running','paused','succeeded','failed','cancelled','spend_cap_reached')),
  error_log   jsonb not null default '[]'::jsonb,
  locked_at   timestamptz,   -- worker lease
  locked_by   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index pv_scan_jobs_status_idx on public.pv_scan_jobs (status, created_at);

create table public.pv_roof_assessments (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.pv_campaigns (id) on delete cascade,
  uprn             bigint not null references public.pv_properties (uprn) on delete cascade,
  status           text not null check (status in ('suitable','flagged','excluded','too_small')),
  reason           text,
  reason_codes     text[] not null default '{}',
  usable_area_m2   numeric(8,2),
  main_aspect      text,
  panel_count      int check (panel_count is null or panel_count >= 0),
  kwp              numeric(6,2),
  indicative_kwh   numeric(8,0),
  imagery_quality  text check (imagery_quality is null or imagery_quality in ('HIGH','MEDIUM','LOW')),
  solar_checked_at timestamptz,
  package_id       uuid references public.pv_packages (id) on delete set null,
  staff_override   jsonb,      -- {"included": bool, "package_id": uuid, "by": uuid, "at": ts, "note": text}
  approved         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (campaign_id, uprn)
);
create index pv_roof_assessments_campaign_status_idx on public.pv_roof_assessments (campaign_id, status);

create table public.pv_letters (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.pv_campaigns (id) on delete cascade,
  uprn              bigint not null references public.pv_properties (uprn),
  package_id        uuid references public.pv_packages (id) on delete set null,
  template_key      smallint not null check (template_key between 1 and 5),
  template_version  int not null,
  short_code        text not null unique check (short_code ~ '^[2-9A-HJ-NP-Z]{8}$'),
  pdf_path          text,
  print_provider_id text,
  print_item_id     text,
  status            text not null default 'generated' check (status in ('generated','sent','returned')),
  sent_at           timestamptz,
  expires_at        timestamptz not null,
  -- Audit trail: the exact merge data printed (LetterData) and source data dates.
  -- The landing page reads its figures from here so they always match the letter.
  printed_values    jsonb not null,
  data_dates        jsonb not null default '{}'::jsonb,
  first_viewed_at   timestamptz,
  last_viewed_at    timestamptz,
  view_count        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index pv_letters_campaign_idx on public.pv_letters (campaign_id, template_key);
create index pv_letters_uprn_idx on public.pv_letters (uprn, created_at desc);

create table public.pv_responses (
  id          uuid primary key default gen_random_uuid(),
  letter_id   uuid references public.pv_letters (id) on delete set null,  -- null for walk-in lookups
  uprn        bigint,
  type        text not null check (type in ('qr_scan','booking','call','opt_out')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index pv_responses_letter_type_idx on public.pv_responses (letter_id, type);
create unique index pv_responses_one_scan_per_letter on public.pv_responses (letter_id) where type = 'qr_scan';

create table public.pv_suppression (
  id         uuid primary key default gen_random_uuid(),
  uprn       bigint unique,
  address    text not null,
  reason     text not null default 'opt_out',
  added_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pv_api_log (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null check (provider in ('os_places','os_ngd','google_solar','print','other')),
  endpoint    text not null,
  campaign_id uuid references public.pv_campaigns (id) on delete set null,
  status_code int,
  est_cost    numeric(10,4) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index pv_api_log_month_idx on public.pv_api_log (provider, created_at);

-- Fixed-window rate limiter for the public routes (landing, booking, opt-out).
create table public.pv_rate_limits (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null unique,
  window_start timestamptz not null,
  hits         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'pv_settings','pv_packages','pv_extras','pv_letter_templates','pv_letter_assets',
    'pv_buildings','pv_properties','pv_heritage_features','pv_campaigns','pv_campaign_templates',
    'pv_scan_jobs','pv_roof_assessments','pv_letters','pv_responses','pv_suppression',
    'pv_api_log','pv_rate_limits'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.pv_set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;
