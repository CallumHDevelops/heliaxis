-- Click heatmap storage (run once in Supabase → SQL Editor).
-- Anonymised page click positions for the admin heatmap.js viewer.

create table if not exists public.heatmap_clicks (
  id         uuid primary key default gen_random_uuid(),
  path       text not null,
  x_pct      real not null check (x_pct >= 0 and x_pct <= 100),
  y_pct      real not null check (y_pct >= 0 and y_pct <= 100),
  vw         integer,
  vh         integer,
  doc_h      integer,
  created_at timestamptz not null default now()
);

create index if not exists heatmap_clicks_path_created_idx
  on public.heatmap_clicks (path, created_at desc);

create index if not exists heatmap_clicks_created_idx
  on public.heatmap_clicks (created_at desc);

alter table public.heatmap_clicks enable row level security;
-- No policies: only the service-role key (server code) can read/write.
