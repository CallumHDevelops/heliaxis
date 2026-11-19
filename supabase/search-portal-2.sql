-- Search, phases 2 to 4 (docs/SEO-PORTAL-SPEC.md §6): M2 teardown, M5 local, M3 planner, M4 content studio,
-- M6 AI visibility, M7 health. Same rules as search-portal.sql: RLS on, approved admins read, the service role writes.
-- Safe to run twice.

-- ── M2: what the top 10 pages contain (cached 30 days), and the businesses in the map pack ─────────────────────
create table if not exists public.seo_page_facts (
  url             text primary key,
  domain          text,
  fetched_at      timestamptz not null default now(),
  status          int,
  page_type       text,          -- service | town | guide | directory | manufacturer | government | other
  title           text,
  words           int,
  h1              text,
  headings        jsonb not null default '[]',   -- [{level, text}]
  questions       jsonb not null default '[]',   -- question-shaped headings and FAQ entries
  schema          text[] not null default '{}',
  images          int,
  has_video       boolean,
  prices_shown    boolean,
  reviews_on_page boolean,
  author          text,
  published_at    timestamptz,
  modified_at     timestamptz,
  town_mentions   jsonb not null default '{}',   -- {town: count}
  town_links      int,
  mentions_mcs    boolean,
  internal_links  int,
  external_links  int,
  lighthouse_perf numeric,
  content_hash    text,
  text_sample     text,                          -- first ~4,000 words, for the originality check only
  error           text
);
create index if not exists seo_page_facts_domain on public.seo_page_facts (domain);

create table if not exists public.seo_business (
  id               bigint generated always as identity primary key,
  cid              text unique,
  place_id         text,
  name             text not null,
  domain           text,
  competitor_id    uuid,
  primary_category text,
  categories       text[] not null default '{}',
  website          text,
  address          text,
  phone            text,
  lat              numeric,
  lng              numeric,
  is_ours          boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.seo_business_snapshot (
  business_id  bigint not null references public.seo_business(id) on delete cascade,
  date         date not null,
  rating       numeric,
  reviews      int,
  reviews_90d  int,
  photos       int,
  responded_pct numeric,
  primary key (business_id, date)
);

create table if not exists public.seo_teardown (
  keyword_id bigint not null references public.seo_keyword(id) on delete cascade,
  date       date not null,
  facts      jsonb not null default '{}',   -- the "What it takes" numbers, each with the rows it came from
  summary    jsonb not null default '{}',   -- {shared:[], gaps:[], outline:[]}
  model      text,
  cost_usd   numeric(10,5) not null default 0,
  primary key (keyword_id, date)
);

-- ── M5: the map pack on a grid, our Business Profile, citations ─────────────────────────────────────────────────
create table if not exists public.seo_grid_scan (
  id          bigint generated always as identity primary key,
  keyword_id  bigint references public.seo_keyword(id) on delete cascade,
  phrase      text not null,
  centre      text not null,
  centre_lat  numeric not null,
  centre_lng  numeric not null,
  size        int not null default 5,
  radius_km   numeric not null default 5,
  date        date not null,
  status      text not null default 'waiting' check (status in ('waiting','done','failed')),
  avg_rank    numeric,
  top3_share  numeric,
  cost_usd    numeric(10,5) not null default 0
);
create table if not exists public.seo_grid_point (
  scan_id  bigint not null references public.seo_grid_scan(id) on delete cascade,
  lat      numeric not null,
  lng      numeric not null,
  task_id  text,
  our_rank int,
  top3     jsonb not null default '[]',
  primary key (scan_id, lat, lng)
);

create table if not exists public.gbp_daily (
  date   date not null,
  metric text not null,     -- CALL_CLICKS | WEBSITE_CLICKS | BUSINESS_DIRECTION_REQUESTS | BUSINESS_IMPRESSIONS_* …
  value  int not null default 0,
  primary key (date, metric)
);
create table if not exists public.gbp_keyword_monthly (
  month       date not null,
  keyword     text not null,
  impressions int,
  primary key (month, keyword)
);

create table if not exists public.seo_citation (
  id          bigint generated always as identity primary key,
  directory   text not null unique,
  url         text,
  status      text not null default 'unknown' check (status in ('listed','missing','unknown','pending')),
  name_shown  text,
  address_shown text,
  phone_shown text,
  checked_at  timestamptz,
  notes       text
);
insert into public.seo_citation (directory) values
  ('MCS'), ('RECC'), ('NAPIT'), ('Google Business Profile'), ('Bing Places'), ('Apple Business Connect'), ('Yell'), ('Facebook'), ('Trustpilot'), ('Checkatrade')
on conflict do nothing;

-- ── M3: groups of searches that belong on one page, scored and queued ───────────────────────────────────────────
create table if not exists public.seo_cluster (
  id                 bigint generated always as identity primary key,
  name               text not null,
  primary_keyword_id bigint references public.seo_keyword(id) on delete set null,
  keywords           jsonb not null default '[]',   -- [{phrase, keyword_id?, volume, pos, source}]
  page_type          text,                          -- pillar | town | case_study | cost_guide | comparison | sector | article
  action             text not null default 'create' check (action in ('improve','create','hold')),
  target_page        text,
  town               text,
  service            text,
  score              numeric,
  score_inputs       jsonb not null default '{}',
  hold_reason        text,
  status             text not null default 'idea' check (status in ('idea','briefed','drafting','in_review','published','measuring','dismissed')),
  owner              text,
  due                date,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

-- Keyword pool beyond what we track: ideas, rival gaps, Search Console striking distance.
create table if not exists public.seo_keyword_pool (
  keyword    text not null,
  source     text not null,   -- tracked | ranked | gap | idea | gsc
  volume     int,
  difficulty numeric,
  intent     text,
  pos        numeric,
  url        text,
  rival      text,
  updated_at timestamptz not null default now(),
  primary key (keyword, source)
);

-- ── M4: content studio ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.seo_content (
  id           bigint generated always as identity primary key,
  cluster_id   bigint references public.seo_cluster(id) on delete set null,
  kind         text not null default 'cms_page' check (kind in ('cms_page','blog')),
  mode         text not null default 'new' check (mode in ('new','refresh')),
  title        text,
  slug         text,
  brief        jsonb not null default '{}',
  proof        jsonb not null default '{}',
  draft        jsonb not null default '{}',
  checks       jsonb not null default '{}',
  status       text not null default 'brief' check (status in ('brief','proof','drafting','draft','in_review','approved','published','rejected')),
  created_by   text,
  approved_by  text,
  approved_at  timestamptz,
  published_ref text,
  published_at timestamptz,
  cost_usd     numeric(10,5) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create table if not exists public.seo_content_measure (
  content_id  bigint not null references public.seo_content(id) on delete cascade,
  day         int not null check (day in (0, 14, 28, 56, 90)),
  measured_at timestamptz not null default now(),
  best_pos    int,
  impressions int,
  clicks      int,
  enquiries   int,
  primary key (content_id, day)
);

-- ── M6: AI answers (replaces social_geo_* and geo_*) ────────────────────────────────────────────────────────────
create table if not exists public.ai_prompt (
  id        bigint generated always as identity primary key,
  prompt    text not null unique,
  town      text,
  service   text,
  kind      text not null default 'local' check (kind in ('local','consideration')),
  active    boolean not null default true,
  legacy_id bigint
);
insert into public.ai_prompt (prompt, town, service, legacy_id, active)
select prompt, town, service, id, active from public.social_geo_prompt on conflict (prompt) do nothing;

create table if not exists public.ai_run (
  id          bigint generated always as identity primary key,
  month       date not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running','done','failed')),
  answers     int not null default 0,
  cost_usd    numeric(10,5) not null default 0,
  error       text
);
create table if not exists public.ai_answer (
  id             bigint generated always as identity primary key,
  run_id         bigint references public.ai_run(id) on delete set null,
  prompt_id      bigint not null references public.ai_prompt(id) on delete cascade,
  engine         text not null,      -- claude | chatgpt | gemini | perplexity | google_aio
  model          text,
  run_no         int not null default 1,
  date           date not null,
  text           text,
  mentioned      boolean not null default false,
  cited          boolean not null default false,
  list_pos       int,
  rivals         text[] not null default '{}',
  cited_domains  text[] not null default '{}',
  accuracy_flags jsonb not null default '[]',
  cost_usd       numeric(10,5) not null default 0,
  error          text,
  unique (prompt_id, engine, run_no, date)
);
create index if not exists ai_answer_date on public.ai_answer (date desc);

create table if not exists public.ai_upload (
  id          bigint generated always as identity primary key,
  source      text not null check (source in ('gsc_genai','bing_ai')),
  period      text not null,
  rows        jsonb not null default '[]',
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

-- ── M7: technical health ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.seo_health (
  date    date not null,
  check_key text not null,     -- index | sitemap | orphan | canonical | schema | lighthouse | crawlers | llms
  url     text not null default '',
  ok      boolean not null,
  detail  jsonb not null default '{}',
  primary key (date, check_key, url)
);

do $$
declare t text;
begin
  foreach t in array array['seo_page_facts','seo_business','seo_business_snapshot','seo_teardown','seo_grid_scan','seo_grid_point',
                           'gbp_daily','gbp_keyword_monthly','seo_citation','seo_cluster','seo_keyword_pool','seo_content',
                           'seo_content_measure','ai_prompt','ai_run','ai_answer','ai_upload','seo_health'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins read" on public.%I', t);
    execute format('create policy "admins read" on public.%I for select using (public.is_admin(auth.uid()))', t);
  end loop;
end $$;

-- One AI-answer step at a time per run (the dispatcher and the "step now" button).
alter table public.ai_run add column if not exists locked_at timestamptz;
