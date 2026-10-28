-- Customer location pin: the link we send before a visit ("check the pin"), and what they confirmed.
-- Run once in the Supabase SQL editor. Safe to re-run. Needs crm-v3.sql (site_lat, site_lng) and survey-booking.sql (booking_token).
alter table public.crm_projects add column if not exists location_confirmed_at timestamptz;  -- when they pressed Confirm location
alter table public.crm_projects add column if not exists location_moved_m      integer;      -- how far they moved the pin (metres); 0 = it was right
