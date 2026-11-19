-- Search (the SEO & GEO Command Centre at /admin/search), phase 0 and 1.
-- Spec: docs/SEO-PORTAL-SPEC.md §6, §7, §10.6. SEO data moves out of JSON blobs in cms_kv into tables, so history can be
-- queried, charted and joined to enquiries. RLS is on everywhere: approved admins can read, and only the service role
-- (cron, pingbacks, server actions through the admin client) writes. Safe to run twice.

-- ── Tracked searches ────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.seo_keyword (
  id            bigint generated always as identity primary key,
  phrase        text not null,
  service       text,                                   -- solar | battery | heat_pump | ev | infrared | general
  town          text,
  intent        text not null default 'local_commercial' check (intent in ('local_commercial','commercial','informational')),
  priority      int  not null default 2 check (priority between 1 and 3),
  location_code int,                                    -- DataForSEO location; null = look it up from the town
  location_name text,
  devices       text[] not null default '{mobile}',
  target_page   text,
  cluster_id    bigint,
  source        text not null default 'manual',         -- manual | migrated | untracked_win | planner
  legacy_id     bigint unique,                          -- social_seo_keyword.id it came from
  volume        int,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (phrase, town)
);

-- Seed from the old list (103 rows), guessing service and intent from the words.
insert into public.seo_keyword (phrase, town, service, intent, priority, location_code, source, legacy_id, active)
select k.keyword, k.town,
  case when k.keyword ~* 'solar and battery' then 'solar'
       when k.keyword ~* 'battery|storage' then 'battery'
       when k.keyword ~* 'heat pump' then 'heat_pump'
       when k.keyword ~* 'ev |charger|charging' then 'ev'
       when k.keyword ~* 'infrared' then 'infrared'
       when k.keyword ~* 'solar|pv' then 'solar' else 'general' end,
  case when k.keyword ~* 'cost|worth|how|what|grant|price' then 'commercial' else 'local_commercial' end,
  -- Priority 1: the core installer searches in the Tier 1 towns (spec §9).
  case when k.keyword ~* '^(solar panels|solar panel installers|home battery installer|heat pump installer) '
        and k.town in ('Newport','Cardiff','Bridgend','Swansea','Bristol') then 1
       when k.town in ('Gloucester','Cheltenham','Swindon') then 3 else 2 end,
  k.location_code, 'migrated', k.id, k.active
from public.social_seo_keyword k
on conflict do nothing;

-- ── SERP runs: one row per run, one result per search/date/device, the top 100 rows behind each ───────────────────
create table if not exists public.seo_serp_run (
  id          bigint generated always as identity primary key,
  kind        text not null default 'weekly' check (kind in ('weekly','monthly','live','reprocess')),
  device      text not null default 'mobile' check (device in ('mobile','desktop')),
  run_date    date not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'posting' check (status in ('posting','waiting','done','failed')),
  tasks       int not null default 0,
  tasks_done  int not null default 0,
  tasks_failed int not null default 0,
  cost_usd    numeric(10,5) not null default 0,
  error       text,
  started_by  text
);

create table if not exists public.seo_serp_result (
  keyword_id   bigint not null references public.seo_keyword(id) on delete cascade,
  date         date not null,
  device       text not null,
  run_id       bigint references public.seo_serp_run(id) on delete set null,
  task_id      text,
  our_pos      int,               -- organic rank_group, null when not in the top 100
  our_abs      int,               -- rank_absolute
  our_url      text,
  our_pack_pos int,
  also_ours    text[],            -- other Heliaxis URLs ranking for it (cannibalisation)
  aio_present  boolean not null default false,
  aio_cited    boolean not null default false,
  features     text[] not null default '{}',
  poisoned_restored boolean not null default false,
  organic_count int not null default 0,
  resolved_count int not null default 0,
  error        text,
  primary key (keyword_id, date, device)
);
create index if not exists seo_serp_result_date on public.seo_serp_result (date desc);

create table if not exists public.seo_serp_item (
  keyword_id    bigint not null references public.seo_keyword(id) on delete cascade,
  date          date not null,
  device        text not null,
  pos           int not null,
  rank_absolute int,
  type          text not null,    -- organic | local_pack
  domain        text,
  url           text,
  title         text,
  resolved_by   text,             -- url | breadcrumb | website_name | unresolved
  primary key (keyword_id, date, device, type, pos)
);
create index if not exists seo_serp_item_domain on public.seo_serp_item (domain, date desc);

-- Every keyword Google already ranks us for (DataForSEO Labs, an estimate).
create table if not exists public.seo_ranked_keyword (
  date          date not null,
  keyword       text not null,
  pos           int,
  url           text,
  volume        int,
  etv           numeric,
  serp_features text[] not null default '{}',
  primary key (date, keyword)
);

-- Search Console, daily (history outlives Google's 16 months). Replaces the empty social_search_console_daily.
create table if not exists public.gsc_daily (
  date        date not null,
  query       text not null default '',
  page        text not null default '',
  device      text not null default '',
  country     text not null default '',
  clicks      int not null default 0,
  impressions int not null default 0,
  ctr         numeric,
  position    numeric,
  primary key (date, query, page, device, country)
);
create index if not exists gsc_daily_date on public.gsc_daily (date desc);

-- ── Cost: every paid call, and the job queue every paid step runs through ───────────────────────────────────────
create table if not exists public.seo_api_call (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  vendor   text not null default 'dataforseo',
  endpoint text not null,
  module   text,                 -- m1 | m2 | … | setup
  cost_usd numeric(10,5) not null default 0,
  ok       boolean not null default true,
  ms       int,
  tasks    int
);
create index if not exists seo_api_call_at on public.seo_api_call (at desc);

create table if not exists public.seo_job (
  id           bigint generated always as identity primary key,
  kind         text not null,                   -- serp_collect | gsc_import | ranked_keywords | …
  dedupe_key   text unique,
  payload      jsonb not null default '{}',
  status       text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts     int not null default 0,
  max_attempts int not null default 3,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  last_error   text,
  cost_usd     numeric(10,5) not null default 0,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists seo_job_due on public.seo_job (run_after) where status = 'queued';

create or replace function public.seo_claim_jobs(n int) returns setof public.seo_job language sql as $$
  update public.seo_job j set status = 'running', locked_at = now(), attempts = j.attempts + 1
   where j.id in (select id from public.seo_job
                   where (status = 'queued' and run_after <= now())
                      or (status = 'running' and locked_at < now() - interval '6 minutes')
                   order by run_after limit n for update skip locked)
  returning j.*;
$$;

-- ── The portal: settings, Needs you, reports ────────────────────────────────────────────────────────────────────
create table if not exists public.seo_setting (
  key        text primary key,
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_action (
  id            bigint generated always as identity primary key,
  kind          text not null,      -- review | ai_fact | rank_drop | index | approval | refresh | meta | setup | budget
  ref           text not null,      -- what raised it (keeps one open item per cause)
  title         text not null,
  why           text,
  fix_href      text,
  owner         text,
  due           date,
  status        text not null default 'open' check (status in ('open','snoozed','done','not_relevant','cleared')),
  snoozed_until date,
  closed_reason text,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create unique index if not exists seo_action_open on public.seo_action (kind, ref) where status in ('open','snoozed');

create table if not exists public.seo_report (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('weekly','monthly','custom')),
  name          text,
  period_start  date not null,
  period_end    date not null,
  compare_start date,
  compare_end   date,
  status        text not null default 'provisional' check (status in ('provisional','final')),
  numbers       jsonb not null default '{}',
  text          jsonb not null default '{}',
  pdf_path      text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (kind, period_start, period_end)
);

-- ── M8: where each enquiry came from ────────────────────────────────────────────────────────────────────────────
alter table public.enquiries add column if not exists channel text;
alter table public.enquiries add column if not exists landing_path text;
alter table public.enquiries add column if not exists referrer_host text;
alter table public.enquiries add column if not exists first_seen_at timestamptz;
alter table public.crm_lead_origins add column if not exists channel text;
alter table public.crm_lead_origins add column if not exists landing_path text;
alter table public.crm_lead_origins add column if not exists referrer_host text;
alter table public.crm_lead_origins add column if not exists first_seen_at timestamptz;
create index if not exists enquiries_channel_idx on public.enquiries (channel, created_at desc) where channel is not null;

-- ── RLS: admins read, service role writes ───────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['seo_keyword','seo_serp_run','seo_serp_result','seo_serp_item','seo_ranked_keyword','gsc_daily',
                           'seo_api_call','seo_job','seo_setting','seo_action','seo_report'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins read" on public.%I', t);
    execute format('create policy "admins read" on public.%I for select using (public.is_admin(auth.uid()))', t);
  end loop;
end $$;
