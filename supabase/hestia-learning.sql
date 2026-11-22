-- Hestia learning: every answer Hestia gives in the customer portal, with the customer's thumbs up or down.
-- Thumbs-up on a general answer becomes a candidate; thumbs-down goes to staff review (Admin > Hestia).
-- Only answers staff approve (status = 'approved') are ever fed back to Hestia as examples. Safe to re-run.
-- Server-only: RLS on, no policies (the portal and admin routes use the service role).
create table if not exists public.hestia_answers (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),
  project_id      text not null,
  question        text not null,
  answer          text not null,
  model           text not null,
  handoff         boolean not null default false,   -- Hestia pointed them to the team (Messages)
  facts_used      text[] not null default '{}',     -- which fact groups she had something for
  facts           jsonb,                            -- the exact PROJECT FACTS she saw, for the reviewer
  examples_used   uuid[] not null default '{}',     -- approved examples fed into this answer
  rating          smallint check (rating in (-1, 1)),
  rated_at        timestamptz,
  general         boolean not null default false,   -- passed the personal-data filter (question and answer)
  status          text not null default 'open',     -- open | candidate | review | approved | rejected
  diagnosis       text,                             -- suggested: wrong_fact | missing_fact | tone | should_hand_off | invented | other
  diagnosis_note  text,
  cause           text,                             -- what the reviewer decided the root cause was
  cause_note      text,                             -- the fix to make (a portal fact, a prompt gap)
  example_q       text,                             -- approved wording reused as an example
  example_a       text,
  reviewed_by     text,
  reviewed_at     timestamptz
);
create index if not exists hestia_answers_status on public.hestia_answers (status, at desc);
create index if not exists hestia_answers_project on public.hestia_answers (project_id, at desc);
alter table public.hestia_answers enable row level security;
