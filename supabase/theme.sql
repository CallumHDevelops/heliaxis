-- 34. Light / Dark / Match phone, saved per person (src/lib/theme). Optional: until this runs, each
--     device keeps its own choice (a cookie and the browser's storage) and everything else works the same.
--     With it, a change made on one device follows the person to their others (the newest choice wins).
--     Written only by the server (/api/theme, with the service role). Safe to run twice.
alter table public.profiles add column if not exists theme text;
alter table public.profiles add column if not exists theme_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_theme_check') then
    alter table public.profiles add constraint profiles_theme_check check (theme in ('light', 'dark', 'system'));
  end if;
end $$;
