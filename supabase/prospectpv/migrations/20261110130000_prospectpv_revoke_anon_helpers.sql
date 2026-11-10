-- The role helpers were left callable by anon (Postgres default). They only ever return false for a signed-out
-- caller, but there is no reason to expose them. Signed-in users keep EXECUTE: row level security needs it.
revoke all on function public.pv_is_admin(), public.pv_is_staff() from public, anon;
grant execute on function public.pv_is_admin(), public.pv_is_staff() to authenticated;
