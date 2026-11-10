-- A picture per package, shown on the letter where the GoodWe ESA unit photo normally goes.
-- Stored in the public prospectpv-assets bucket; this holds the path inside it.
alter table public.pv_packages add column if not exists image_path text;
