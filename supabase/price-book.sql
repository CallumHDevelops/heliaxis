-- 28. Price book: one row per component Heliaxis buys and sells (panels, inverters, batteries, mounting, cable,
--     accessories). Metis prices quotes from this and checks designs against its datasheet figures.
--     Safe to re-run. Server-only (RLS on, no policies), like the other tables. Run after assistant.sql.
--
-- cost_pence and sell_pence are whole pence and may be null: a null price is never guessed. Metis shows a
-- "PRICE REQUIRED" line and tells you. `specs` holds the datasheet figures the design checks need (snake_case):
--   panel:    wp, voc, vmp, isc, imp, temp_coeff_voc_pct, width_mm, height_mm
--   inverter: ac_kw, max_dc_v, mppt_min_v, mppt_max_v, mppt_count, max_input_current_a, max_isc_a, max_pv_kw,
--             battery_min_v, battery_max_v, max_charge_kw, max_discharge_kw, off_grid_capable, generator_input
--   battery:  usable_kwh, nominal_v, max_charge_kw, max_discharge_kw
-- A missing figure is reported by the design check; it is never assumed.

create table if not exists public.price_book (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique check (sku ~ '^[A-Za-z0-9._/-]{2,60}$'),
  category      text not null check (category in ('panel','inverter','battery','mounting','cable','isolator','comms','meter','accessory','labour','other')),
  make          text not null,
  model         text not null,
  specs         jsonb not null default '{}'::jsonb,
  cost_pence    integer check (cost_pence is null or cost_pence >= 0),
  sell_pence    integer check (sell_pence is null or sell_pence >= 0),
  unit          text not null default 'each',
  active        boolean not null default true,
  datasheet_url text,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists price_book_category_idx on public.price_book (category, active);
alter table public.price_book enable row level security;
