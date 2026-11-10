-- Test-only: the tests below pretend to be users by setting JWT claims (app_metadata.roles), as they did before the
-- Heliaxis mapping. This puts that simple lookup back for every test except prospectpv_profiles_roles.sql, which
-- tests the real mapping onto public.profiles.
create or replace function public.pv_has_role(p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' -> 'roles') ? p_role, false);
$$;
