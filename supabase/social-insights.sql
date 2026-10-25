-- Social Monitoring: Insights, competitors, SEO and AI-answer tracking. Phases 3–4.
-- Safe to re-run. Needs social-monitoring.sql first. Server-only: RLS on, no policies.

create table if not exists public.social_metric_catalogue (
  key                text not null,             -- followers | views | reach_unique | …
  platform           text not null,
  api_metric_name    text,                      -- null for derived metrics
  derived_formula    text,
  available          boolean not null,
  unavailable_reason text,
  available_from     date not null default '2000-01-01',
  available_to       date,                      -- set when a platform retires a metric (series are never joined)
  notes              text,
  primary key (key, platform, available_from)
);

create table if not exists public.social_metric_snapshot (
  date            date not null,
  platform        text not null,
  account_id      text not null,
  scope           text not null check (scope in ('account','post')),
  object_id       text not null default '',
  metric          text not null,
  value           numeric not null,
  source_api      text not null,
  api_metric_name text,
  collected_at    timestamptz not null default now(),
  primary key (date, platform, account_id, scope, object_id, metric)
);
create index if not exists social_metric_snapshot_metric on public.social_metric_snapshot (metric, platform, date);

create table if not exists public.social_weekly_summary (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('insights','seo_geo')),
  week_start  date not null,
  digest      jsonb not null,
  output      jsonb,
  fallback    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (kind, week_start)
);

create table if not exists public.social_question_cluster (
  id            bigint generated always as identity primary key,
  computed_for  date not null,
  label         text not null,
  mention_ids   uuid[] not null,
  script_id     text references public.social_script(id),
  created_at    timestamptz not null default now()
);

-- ── Competitors ──────────────────────────────────────────────────────────────
create table if not exists public.social_competitor (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  is_self            boolean not null default false,   -- Heliaxis itself, for side-by-side figures
  website            text,
  base_location      text,
  base_postcode      text,
  service_area       text,
  scope              text not null default 'local' check (scope in ('local','national_with_local_pages')),
  facebook_url       text,
  instagram_username text,
  trustpilot_url     text,
  google_place_id    text,
  tracked            boolean not null default false,
  tracked_since      date,
  approved_by        uuid references public.profiles(id),
  approved_at        timestamptz,
  notes              text,
  created_at         timestamptz not null default now()
);
create unique index if not exists social_competitor_one_self on public.social_competitor ((true)) where is_self;

create table if not exists public.social_competitor_suggestion (
  id            bigint generated always as identity primary key,
  name          text not null,
  website       text,
  base_location text,
  evidence      jsonb not null,                -- [{url, note}]
  found_by      text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  competitor_id uuid references public.social_competitor(id),
  created_at    timestamptz not null default now()
);

create table if not exists public.social_competitor_snapshot (
  competitor_id      uuid not null references public.social_competitor(id) on delete cascade,
  date               date not null,
  platform           text not null,
  metric             text not null,
  value              numeric,
  unavailable_reason text,
  method             text not null check (method in ('api','manual','crawl','vendor','model_summary')),
  source             text not null,
  evidence_path      text,                      -- screenshot for manual entries (Supabase storage)
  collected_at       timestamptz not null default now(),
  primary key (competitor_id, date, platform, metric),
  check (value is not null or unavailable_reason is not null)
);

create table if not exists public.social_competitor_page (
  id              bigint generated always as identity primary key,
  competitor_id   uuid not null references public.social_competitor(id) on delete cascade,
  url             text not null,
  page_kind       text not null check (page_kind in ('pricing','finance','product','location','home','offers','other')),
  last_hash       text,
  last_text       text,
  last_checked_at timestamptz,
  unique (competitor_id, url)
);

create table if not exists public.social_competitor_change (
  id           bigint generated always as identity primary key,
  page_id      bigint not null references public.social_competitor_page(id) on delete cascade,
  detected_at  timestamptz not null default now(),
  diff         text not null,
  is_promotion boolean,
  summary      text
);

create table if not exists public.social_competitor_insight (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('review_theme','opportunity','heliaxis_mention')),
  competitor_id uuid references public.social_competitor(id) on delete cascade,
  title         text not null,
  body          text not null,
  evidence      jsonb not null check (jsonb_array_length(evidence) >= 1),
  confidence    numeric(4,3),
  valid_for     daterange,
  created_at    timestamptz not null default now()
);

-- ── SEO / AI answers ─────────────────────────────────────────────────────────
create table if not exists public.social_seo_keyword (
  id            bigint generated always as identity primary key,
  keyword       text not null,
  town          text not null,
  location_code int,
  active        boolean not null default true,
  unique (keyword, town)
);

create table if not exists public.social_seo_rank (
  date            date not null,
  keyword_id      bigint not null references public.social_seo_keyword(id),
  device          text not null check (device in ('mobile','desktop')),
  competitor_id   uuid not null references public.social_competitor(id) on delete cascade,
  organic_rank    int,
  local_pack_rank int,
  url             text,
  primary key (date, keyword_id, device, competitor_id)
);

create table if not exists public.social_search_console_daily (
  date        date not null,
  query       text not null default '',
  page        text not null default '',
  clicks      int not null,
  impressions int not null,
  ctr         numeric,
  position    numeric,
  primary key (date, query, page)
);

create table if not exists public.social_site_health (
  date          date not null,
  competitor_id uuid not null references public.social_competitor(id) on delete cascade,
  results       jsonb not null,
  primary key (date, competitor_id)
);

create table if not exists public.social_geo_prompt (
  id      bigint generated always as identity primary key,
  prompt  text not null unique,
  town    text,
  service text,
  active  boolean not null default true
);

create table if not exists public.social_geo_sample (
  id                 bigint generated always as identity primary key,
  date               date not null,
  engine             text not null,
  model              text not null,
  prompt_id          bigint not null references public.social_geo_prompt(id),
  run                smallint not null check (run between 1 and 5),
  answer_text        text not null,
  mentioned_ids      uuid[] not null default '{}',
  cited_domains      text[] not null default '{}',
  unique (date, engine, prompt_id, run)
);

create table if not exists public.social_vendor_spend (
  month      date not null,
  vendor     text not null,
  pence      int not null default 0,
  cap_pence  int not null,
  primary key (month, vendor)
);

do $$
declare t text;
begin
  foreach t in array array['social_metric_catalogue','social_metric_snapshot','social_weekly_summary','social_question_cluster',
    'social_competitor','social_competitor_suggestion','social_competitor_snapshot','social_competitor_page',
    'social_competitor_change','social_competitor_insight','social_seo_keyword','social_seo_rank',
    'social_search_console_daily','social_site_health','social_geo_prompt','social_geo_sample','social_vendor_spend']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
