-- 33. Design studio (/admin/design): saved print designs and a reusable template library.
--     Template PDFs, uploaded images and project thumbnails live in the PRIVATE storage bucket
--     'design-files' (auto-created by the app, so there is nothing to set up for files).
--     Until this is run the studio still works, but projects can't be saved to the cloud.
--     Safe to run twice. Server-only tables (RLS on, no policies).

create table if not exists public.design_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 140),
  title         text,                                  -- the PDF's own title, if it has one
  storage_path  text not null unique,                  -- the template PDF in 'design-files'
  size          int,
  geometry      jsonb not null,                        -- page/trim/bleed/safe in mm (see src/lib/design/types.ts)
  archived_at   timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists design_templates_live_idx on public.design_templates (created_at desc) where archived_at is null;

create table if not exists public.design_projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 140),
  format_id     text not null,                         -- a preset id from formats.ts, or 'template'
  doc           jsonb not null,                        -- page geometry + every page's canvas (template PDF excluded)
  template_id   uuid references public.design_templates(id) on delete set null,
  thumb_path    text,                                  -- small JPEG preview in 'design-files'
  archived_at   timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists design_projects_live_idx on public.design_projects (updated_at desc) where archived_at is null;

alter table public.design_templates enable row level security;
alter table public.design_projects  enable row level security;

notify pgrst, 'reload schema';
