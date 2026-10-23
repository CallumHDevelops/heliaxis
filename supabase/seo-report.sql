-- The CMS report (SEO and GEO): src/lib/report. Each report is built in stages (Search Console,
-- Google's results town by town, the UK market, the competing pages, Claude's write-up) and kept
-- here whole, so past reports stay readable at /admin/cms-report. Safe to run twice.

create table if not exists public.seo_reports (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'building' check (status in ('building', 'done', 'failed')),
  stage       text not null default 'gsc',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  started_by  text,
  locked_at   timestamptz,
  data        jsonb not null default '{}'::jsonb,
  analysis    jsonb,
  error       text
);
create index if not exists seo_reports_started_idx on public.seo_reports (started_at desc);

-- Only the server (service role) reads and writes it.
alter table public.seo_reports enable row level security;

-- Optional: build reports in the background every 5 minutes, like whatsapp.sql. Without it, a report
-- builds while /admin/cms-report is open, or a step a day from vercel.json.
-- select cron.schedule('heliaxis-seo-report', '*/5 * * * *', $$ select net.http_get(
--   url := 'https://heliaxis.co.uk/api/cron/seo-report', headers := '{"Authorization":"Bearer <CRON_SECRET>"}'::jsonb) $$);

notify pgrst, 'reload schema';
