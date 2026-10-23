-- AI search visibility (GEO bot): src/lib/geo.
-- Asks AI assistants (Claude with web search, and Perplexity / ChatGPT through OpenRouter) the
-- questions customers ask, records whether Heliaxis is named or heliaxis.co.uk is cited, and keeps
-- the website changes the bot suggests until someone applies or dismisses them at /admin/geo.
-- Safe to run twice.

create table if not exists public.geo_prompts (
  id         uuid primary key default gen_random_uuid(),
  prompt     text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.geo_runs (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'checking' check (status in ('checking', 'analysing', 'done', 'failed')),
  started_at   timestamptz not null default now(),
  analysing_at timestamptz,
  finished_at  timestamptz,
  started_by   text,
  summary      text,
  error        text
);
create index if not exists geo_runs_started_idx on public.geo_runs (started_at desc);

-- One question put to one AI engine in one run.
create table if not exists public.geo_checks (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.geo_runs (id) on delete cascade,
  prompt_id   uuid references public.geo_prompts (id) on delete set null,
  prompt      text not null,
  engine      text not null,
  status      text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts    int not null default 0,
  claimed_at  timestamptz,
  answer      text,
  sources     jsonb not null default '[]'::jsonb,
  mentioned   boolean,
  cited       boolean,
  rank        int,
  businesses  text[] not null default '{}',
  error       text,
  checked_at  timestamptz
);
create index if not exists geo_checks_run_idx on public.geo_checks (run_id, status);

-- A change to the website the bot suggests after a run.
create table if not exists public.geo_suggestions (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.geo_runs (id) on delete cascade,
  kind        text not null check (kind in ('meta', 'faq', 'article')),
  page_slug   text,
  title       text not null,
  reason      text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending', 'applied', 'dismissed', 'failed')),
  result      text,
  link        text,
  decided_by  text,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists geo_suggestions_status_idx on public.geo_suggestions (status, created_at desc);

-- Only the server (service role) reads and writes these.
alter table public.geo_prompts     enable row level security;
alter table public.geo_runs        enable row level security;
alter table public.geo_checks      enable row level security;
alter table public.geo_suggestions enable row level security;

-- The questions to start with (edit them at /admin/geo). Added once, only while the list is empty.
insert into public.geo_prompts (prompt)
select p from (values
  ('Who are the best solar panel installers in Newport, South Wales?'),
  ('Can you recommend an MCS-certified solar and battery installer in Cardiff?'),
  ('How much do solar panels cost for a three-bed house in South Wales?'),
  ('Are solar panels worth it in Wales given the weather?'),
  ('Which companies install commercial solar PV for businesses in South Wales?'),
  ('Who installs air source heat pumps near Newport?'),
  ('Are there grants or funding for solar panels in Wales?'),
  ('Who installs home EV chargers in Cardiff and Newport?')
) as v(p)
where not exists (select 1 from public.geo_prompts);

-- Optional: work through a run's questions every 5 minutes, like whatsapp.sql. Without it, the run
-- finishes while /admin/geo is open, or a little each day from vercel.json.
-- select cron.schedule('heliaxis-geo', '*/5 * * * *', $$ select net.http_get(
--   url := 'https://heliaxis.co.uk/api/cron/geo', headers := '{"Authorization":"Bearer <CRON_SECRET>"}'::jsonb) $$);

notify pgrst, 'reload schema';
