-- Social Monitoring (Operations › Social Monitoring). Phases 1–2.
-- Safe to re-run. Server-only: RLS on, no policies; only the service-role key (server code) reads/writes,
-- like the rest of the app. Run from From Claude › SQL, or the Supabase SQL editor.
-- Needs schema.sql (profiles) and notifications.sql to have been run first.

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Severity rank: ignore 0 < positive 1 < low 2 < medium 3 < high 4 < critical 5.
create or replace function public.social_sev_rank(s text) returns int language sql immutable as $$
  select case s when 'ignore' then 0 when 'positive' then 1 when 'low' then 2
                when 'medium' then 3 when 'high' then 4 when 'critical' then 5 else -1 end
$$;

-- ── Ingest ───────────────────────────────────────────────────────────────────
create table if not exists public.social_ingest_event (
  id            bigint generated always as identity primary key,
  source        text not null,                 -- meta-webhook | gbp-pubsub | trustpilot-poll | review-email | manual | synthetic | …
  received_at   timestamptz not null default now(),
  body          jsonb not null,
  processed_at  timestamptz,
  error         text
);
create index if not exists social_ingest_unprocessed on public.social_ingest_event (received_at) where processed_at is null;

create table if not exists public.social_post (
  id                uuid primary key default gen_random_uuid(),
  platform          text not null check (platform in ('facebook','instagram','trustpilot','google','manual')),
  platform_post_id  text not null,
  permalink         text,
  caption_excerpt   text,
  content_type      text,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (platform, platform_post_id)
);

create table if not exists public.social_mention (
  id                   uuid primary key default gen_random_uuid(),
  platform             text not null check (platform in ('facebook','instagram','trustpilot','google','manual')),
  platform_id          text not null,
  kind                 text not null check (kind in ('comment','reply','mention','review','tag')),
  post_id              uuid references public.social_post(id),
  parent_id            uuid references public.social_mention(id),
  thread_root_id       uuid references public.social_mention(id),
  comment_permalink    text,
  author_display_name  text,
  author_hash          text,                    -- sha256(SOCIAL_AUTHOR_PEPPER || platform || author id)
  author_is_own        boolean not null default false,
  text                 text not null,
  text_truncated       boolean not null default false,
  rating               smallint check (rating between 1 and 5),
  created_at           timestamptz not null,    -- platform time
  received_at          timestamptz not null default now(),
  edited_at            timestamptz,
  removed_at_source    boolean not null default false,
  version              int not null default 1,
  severity             text check (severity in ('ignore','positive','low','medium','high','critical')),
  status               text not null default 'new'
                         check (status in ('new','in_review','approved','copied','posted','dismissed','escalated')),
  assignee_id          uuid references public.profiles(id) on delete set null,
  sla_due_at           timestamptz,
  closed_at            timestamptz,
  safety_cleared       boolean not null default false,  -- admin downgrade "not a safety issue" (04 §2)
  is_synthetic         boolean not null default false,
  hidden_from_queue    boolean not null default false,
  erased_at            timestamptz,
  anonymised_at        timestamptz,
  posted_platform_id   text,
  raw                  jsonb,                   -- latest raw payload; nulled after 90 days
  updated_at           timestamptz not null default now(),
  unique (platform, platform_id)
);
create index if not exists social_mention_queue on public.social_mention (sla_due_at)
  where status not in ('posted','dismissed') and not is_synthetic;
create index if not exists social_mention_author on public.social_mention (platform, author_hash, created_at desc);
create index if not exists social_mention_post on public.social_mention (post_id, created_at desc);

create table if not exists public.social_mention_version (
  mention_id  uuid not null references public.social_mention(id) on delete cascade,
  version     int not null,
  text        text not null,
  edited_at   timestamptz,
  primary key (mention_id, version)
);

create table if not exists public.social_status_event (
  id          bigint generated always as identity primary key,
  mention_id  uuid not null references public.social_mention(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_id    uuid references public.profiles(id) on delete set null,   -- null = system
  reason      text,
  at          timestamptz not null default now()
);

create table if not exists public.social_note (
  id          uuid primary key default gen_random_uuid(),
  mention_id  uuid not null references public.social_mention(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  text        text not null,
  created_at  timestamptz not null default now()
);

-- ── Classification ───────────────────────────────────────────────────────────
create table if not exists public.social_classification (
  id                  bigint generated always as identity primary key,
  mention_id          uuid not null references public.social_mention(id) on delete cascade,
  mention_version     int not null,
  severity            text not null check (severity in ('ignore','positive','low','medium','high','critical')),
  keyword_severity    text check (keyword_severity in ('high','critical')),
  model_severity      text check (model_severity in ('ignore','positive','low','medium','high','critical')),
  adjustments         text[] not null default '{}',
  topics              text[] not null default '{}',
  sentiment           text check (sentiment in ('positive','neutral','negative','mixed')),
  language            text,
  reason              text,
  confidence          numeric(4,3) check (confidence between 0 and 1),
  safety_related      boolean not null default false,
  is_question         boolean,
  injection_suspected boolean not null default false,
  rule_hits           jsonb not null default '[]',
  model_id            text,
  model_status        text not null default 'pending' check (model_status in ('ok','failed','refused','skipped','pending')),
  rules_version       text not null,
  created_at          timestamptz not null default now(),
  -- The AI can never take a comment below what the keyword layer found.
  constraint social_keyword_floor check (keyword_severity is null or public.social_sev_rank(severity) >= public.social_sev_rank(keyword_severity))
);
create index if not exists social_classification_mention on public.social_classification (mention_id, created_at desc);

create table if not exists public.social_severity_override (
  id          bigint generated always as identity primary key,
  mention_id  uuid not null references public.social_mention(id) on delete cascade,
  from_sev    text not null,
  to_sev      text not null,
  actor_id    uuid not null references public.profiles(id),
  reason      text not null check (length(reason) >= 10),
  at          timestamptz not null default now()
);

-- ── Scripts and Fact Sheet ───────────────────────────────────────────────────
create table if not exists public.social_script (
  id          text primary key,                 -- slug, e.g. 'safety-concern'
  name        text not null,
  is_safety   boolean not null default false,
  priority    int not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.social_script_version (
  script_id      text not null references public.social_script(id),
  version        int not null,
  status         text not null default 'draft' check (status in ('draft','pending_approval','published','retired')),
  body           jsonb not null,                -- 04 §1 format
  created_by     uuid references public.profiles(id) on delete set null,   -- null = seed
  created_at     timestamptz not null default now(),
  approved_by    uuid references public.profiles(id),
  published_at   timestamptz,
  last_reviewed  date,
  primary key (script_id, version),
  constraint social_published_needs_approver check (status not in ('published','retired') or published_at is not null)
);
create unique index if not exists social_one_published on public.social_script_version (script_id) where status = 'published';

create table if not exists public.social_fact_sheet_version (
  version     int primary key,
  status      text not null default 'draft' check (status in ('draft','pending_approval','locked','retired')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  locked_by   uuid references public.profiles(id),
  locked_at   timestamptz,
  constraint social_locked_needs_owner check (status <> 'locked' or (locked_by is not null and locked_at is not null))
);
create unique index if not exists social_one_locked_factsheet on public.social_fact_sheet_version ((true)) where status = 'locked';

create table if not exists public.social_fact_claim (
  id                 uuid primary key default gen_random_uuid(),
  fact_sheet_version int not null references public.social_fact_sheet_version(version),
  wording            text not null,             -- verbatim
  category           text not null check (category in ('certification','protection','installation_standard')),
  source_ref         text not null,
  review_date        date not null,
  expiry_date        date not null check (expiry_date > review_date)
);

-- ── Drafts ───────────────────────────────────────────────────────────────────
create table if not exists public.social_draft (
  id                    uuid primary key default gen_random_uuid(),
  mention_id            uuid not null references public.social_mention(id) on delete cascade,
  mention_version       int not null,
  script_id             text,
  script_version        int,
  status                text not null default 'generating'
                          check (status in ('generating','ready','approved','copied','posted','stale','rejected','failed','no_script','superseded')),
  reason                text not null default 'initial',
  text                  text,
  text_sha256           text,
  segments              jsonb,
  slots                 jsonb,
  booking_type          text check (booking_type in ('survey','call','quote')),
  booking_url           text,
  fact_claim_ids        uuid[] not null default '{}',
  guardrail_result      jsonb,
  guardrail_pass        boolean,
  rules_version         text,
  model_id              text,
  reviewer_note         text,
  is_safety             boolean not null default false,
  requires_approval     boolean not null default false,
  approved_by           uuid references public.profiles(id),
  approved_at           timestamptz,
  approved_text_sha256  text,
  copied_by             uuid references public.profiles(id),
  copied_at             timestamptz,
  posted_by             uuid references public.profiles(id),
  posted_at             timestamptz,
  posted_reply_link     text,
  rejected_by           uuid references public.profiles(id),
  rejected_reason_code  text,
  rejected_reason_text  text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (script_id, script_version) references public.social_script_version(script_id, version),
  -- Brief rule 7: safety drafts are never auto-approved; Critical needs a named approver on the exact text.
  constraint social_draft_needs_approval check (
    not requires_approval or status not in ('approved','copied','posted')
    or (approved_by is not null and approved_at is not null and approved_text_sha256 = text_sha256)),
  constraint social_safety_requires_approval check (not is_safety or requires_approval),
  constraint social_copy_needs_guardrails check (status not in ('copied','posted') or guardrail_pass is true)
);
create index if not exists social_draft_mention on public.social_draft (mention_id, created_at desc);

create table if not exists public.social_draft_edit (
  id          bigint generated always as identity primary key,
  draft_id    uuid not null references public.social_draft(id) on delete cascade,
  editor_id   uuid references public.profiles(id) on delete set null,
  before_text text not null,
  after_text  text not null,
  segment_ids text[] not null default '{}',
  at          timestamptz not null default now()
);

create table if not exists public.social_guardrail_override (
  id        bigint generated always as identity primary key,
  draft_id  uuid not null references public.social_draft(id) on delete cascade,
  rule      text not null check (rule in ('G3','G6')),
  reason    text not null check (length(reason) >= 10),
  actor_id  uuid not null references public.profiles(id),
  at        timestamptz not null default now()
);

-- ── Notifications sent (one per mention version × severity; stops double sends) ─────────────
create table if not exists public.social_alert (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('social_critical','social_high','social_digest','social_system','social_heartbeat')),
  mention_id    uuid references public.social_mention(id) on delete set null,
  severity      text,
  dedupe_key    text not null unique,
  recipients    int not null default 0,
  deferred_until timestamptz,                   -- High during quiet hours
  sent_at       timestamptz,
  is_synthetic  boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.social_heartbeat_run (
  id            bigint generated always as identity primary key,
  started_at    timestamptz not null default now(),
  mention_id    uuid,
  notification_saved boolean,
  push_accepted boolean,
  passed        boolean,
  failure_stage text
);

-- ── Jobs (claimed with FOR UPDATE SKIP LOCKED by /api/cron/social) ───────────
create table if not exists public.social_job (
  id           bigint generated always as identity primary key,
  kind         text not null,                  -- ingest | classify | draft | poll:trustpilot | …
  dedupe_key   text unique,                     -- e.g. 'classify:{mention}:v{version}'
  payload      jsonb not null default '{}',
  status       text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts     int not null default 0,
  max_attempts int not null default 5,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists social_job_due on public.social_job (run_after) where status = 'queued';

create or replace function public.social_claim_jobs(n int) returns setof public.social_job language sql as $$
  update public.social_job j set status = 'running', locked_at = now(), attempts = j.attempts + 1
   where j.id in (select id from public.social_job
                   where (status = 'queued' and run_after <= now())
                      or (status = 'running' and locked_at < now() - interval '5 minutes')   -- a run that died
                   order by run_after limit n for update skip locked)
  returning j.*;
$$;

create table if not exists public.social_connector_status (
  source            text primary key,           -- facebook | instagram | trustpilot | google | review-email
  status            text not null default 'red' check (status in ('green','amber','red')),
  last_success_at   timestamptz,
  last_error        text,
  last_error_at     timestamptz,
  cursor            jsonb,
  token_expires_at  timestamptz,
  updated_at        timestamptz not null default now()
);

create table if not exists public.social_eval_run (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  kind          text not null check (kind in ('classifier','guardrails')),
  rules_version text not null,
  model_id      text,
  git_sha       text,
  total         int not null,
  results       jsonb not null,
  passed        boolean not null
);

create table if not exists public.social_erasure_request (
  id           uuid primary key default gen_random_uuid(),
  request_ref  text not null,
  criteria     jsonb not null,
  matched_ids  uuid[] not null default '{}',
  requested_by uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  executed_by  uuid references public.profiles(id),
  executed_at  timestamptz
);

-- ── Audit (append-only, hash-chained; holds no comment text or names) ────────
create table if not exists public.social_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,                             -- profiles.id, or null for the system
  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb,
  prev_hash   text,
  hash        text not null
);

create or replace function public.social_audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'social_audit is append-only';
end $$;

create or replace function public.social_audit_chain() returns trigger language plpgsql as $$
declare prev text;
begin
  perform pg_advisory_xact_lock(424242);
  select hash into prev from public.social_audit order by id desc limit 1;
  new.prev_hash := prev;
  new.hash := encode(sha256(convert_to(coalesce(prev, '') || jsonb_build_object(
    'at', new.at, 'actor_id', new.actor_id, 'action', new.action,
    'target_type', new.target_type, 'target_id', new.target_id, 'detail', new.detail)::text, 'UTF8')), 'hex');
  return new;
end $$;

drop trigger if exists social_audit_no_change on public.social_audit;
create trigger social_audit_no_change before update or delete on public.social_audit
  for each row execute function public.social_audit_immutable();
drop trigger if exists social_audit_no_truncate on public.social_audit;
create trigger social_audit_no_truncate before truncate on public.social_audit
  for each statement execute function public.social_audit_immutable();
drop trigger if exists social_audit_hash on public.social_audit;
create trigger social_audit_hash before insert on public.social_audit
  for each row execute function public.social_audit_chain();

-- ── Row level security: on, no policies (service role only) ──────────────────
do $$
declare t text;
begin
  foreach t in array array['social_ingest_event','social_post','social_mention','social_mention_version','social_status_event',
    'social_note','social_classification','social_severity_override','social_script','social_script_version',
    'social_fact_sheet_version','social_fact_claim','social_draft','social_draft_edit','social_guardrail_override',
    'social_alert','social_heartbeat_run','social_job','social_connector_status','social_eval_run',
    'social_erasure_request','social_audit']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── Job runner: every minute (replace the URL and secret; same pattern as whatsapp.sql) ─────────
-- select cron.schedule('heliaxis-social', '* * * * *', $$ select net.http_post(
--   url := 'https://heliaxis.co.uk/api/cron/social',
--   headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
-- ) $$);
