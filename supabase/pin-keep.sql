-- Keep a customer-confirmed pin when someone tidies the address.
-- Run once in the Supabase SQL editor. Safe to re-run. Replaces crm_projects_site_moved from crm-v3.sql.
--
-- Before: any change to the address or postcode text wiped site_lat/site_lng, even a pin the customer had
-- dragged and confirmed, while location_confirmed_at still said "confirmed". Directions then fell back to
-- the lead's address (HX-0170, 25 Nov: the surveyor went to the wrong end of a caravan park).
--
-- Now:
--   * the same update sets new coordinates      → kept, as before;
--   * the postcode really changes (not just its spacing or case) → the site has moved: the pin and its
--     confirmation are cleared, so the customer is asked again;
--   * only the address text changes (or the postcode's spacing) → a confirmed pin stays; a pin that
--     only came from the postcode is cleared, as before.
create or replace function public.crm_projects_site_moved() returns trigger
language plpgsql set search_path = public as $$
declare
  pc_moved boolean := upper(replace(coalesce(new.postcode, ''), ' ', '')) is distinct from upper(replace(coalesce(old.postcode, ''), ' ', ''));
begin
  if (new.postcode is distinct from old.postcode or new.address is distinct from old.address)
     and new.site_lat is not distinct from old.site_lat and new.site_lng is not distinct from old.site_lng then
    if pc_moved then
      new.site_lat := null; new.site_lng := null;
      new.location_confirmed_at := null; new.location_moved_m := null;
    elsif old.location_confirmed_at is null then
      new.site_lat := null; new.site_lng := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists crm_projects_site_moved on public.crm_projects;
create trigger crm_projects_site_moved before update of postcode, address on public.crm_projects
  for each row execute function public.crm_projects_site_moved();
