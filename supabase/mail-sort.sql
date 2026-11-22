-- 80. My email: a person's own Microsoft 365 mailbox (callum@ to start), kept sorted for them.
--     The app reads the mailbox every two minutes (/api/cron/mail), works out which emails need a reply and
--     marks the urgent ones in Outlook itself, learns how you write from your sent emails and drafts each
--     reply in that style, files emails into a folder per company or customer once they've been dealt
--     with, and moves marketing into a Marketing folder.
--     Nothing is filed until its owner turns filing on (Email › Settings), and nothing is deleted except the
--     app's own Outlook drafts that you haven't touched, once they're no longer needed.
--     Only the mailbox's owner sees it. Run after crm.sql and organisations.sql. Safe to run twice.
--     Server-only tables (RLS on, no policies).

create table if not exists public.mail_boxes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles(id) on delete cascade,
  address          text not null unique,               -- callum@heliaxis.co.uk (always its owner's own sign-in email)
  filing           boolean not null default false,     -- move dealt-with emails into their folders
  marketing        boolean not null default false,     -- move marketing emails into the Marketing folder
  drafts           boolean not null default true,      -- write a reply for each email that needs one
  outlook_drafts   boolean not null default true,      -- and put it in Outlook's Drafts, as a reply to their email
  signature        text,                               -- added under replies sent from the app
  highlight        boolean not null default true,      -- mark emails needing a reply in Outlook (category, and a flag if important)
  categories_ready boolean not null default false,     -- the coloured Outlook categories have been made
  style            text,                               -- how you write, learnt from your sent emails (yours to edit)
  style_examples   jsonb,                              -- a few of your own emails, as examples of the style
  style_from       int,                                -- how many sent emails it was learnt from
  style_at         timestamptz,                        -- when (learnt again every 30 days, unless you've edited it)
  style_edited     boolean not null default false,
  scan_before      timestamptz,                        -- first read: inbox emails older than this are still to read (null: done)
  sent_before      timestamptz,                        -- first read: sent emails older than this are still to read (null: done)
  scan_done_at     timestamptz,
  live_since       timestamptz,                        -- new emails: read from here on the next run
  last_run_at      timestamptz,
  last_error       text,
  created_at       timestamptz not null default now()
);

-- Who goes where: a whole company by its email domain (goodwe.com → Suppliers/GoodWe), or one person by
-- their address (a customer on Gmail → Customers/Jane Smith). Made by the first read and kept up to date.
create table if not exists public.mail_rules (
  id               uuid primary key default gen_random_uuid(),
  box_id           uuid not null references public.mail_boxes(id) on delete cascade,
  kind             text not null check (kind in ('domain','address')),
  match            text not null,                      -- lower case: goodwe.com, or jane@gmail.com
  label            text not null,                      -- GoodWe
  folder           text not null,                      -- Suppliers/GoodWe (a / makes a folder inside a folder)
  action           text not null default 'file' check (action in ('file','marketing','leave')),
  status           text not null default 'suggested' check (status in ('suggested','on','off')),
  source           text not null default 'scan' check (source in ('scan','crm','you')),
  named            boolean not null default false,     -- the label and folder have been worked out (or set by you)
  never_marketing  boolean not null default false,     -- "Not marketing": their emails are never moved to Marketing
  enquiry_id       uuid references public.enquiries(id) on delete set null,
  organisation_id  uuid references public.organisations(id) on delete set null,
  contact_id       uuid references public.crm_contacts(id) on delete set null,
  messages         int not null default 0,
  last_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (box_id, kind, match)
);
create index if not exists mail_rules_box_idx on public.mail_rules (box_id, status, messages desc);

-- Outlook folders made by the app, by path, so each is looked up once.
create table if not exists public.mail_folders (
  box_id           uuid not null references public.mail_boxes(id) on delete cascade,
  path             text not null,
  graph_id         text not null,
  primary key (box_id, path)
);

-- One row per email read (headers and a preview only; the full text stays in Outlook).
create table if not exists public.mail_messages (
  id               uuid primary key default gen_random_uuid(),
  box_id           uuid not null references public.mail_boxes(id) on delete cascade,
  graph_id         text not null,                      -- Outlook's immutable id (stays the same when moved)
  internet_id      text,
  conversation_id  text,
  direction        text not null check (direction in ('in','out')),
  from_address     text,
  from_name        text,
  to_addresses     text[] not null default '{}',
  subject          text,
  preview          text,
  at               timestamptz not null,
  marketing        boolean not null default false,
  automated        boolean not null default false,
  rule_id          uuid references public.mail_rules(id) on delete set null,
  place            text not null default 'inbox' check (place in ('inbox','sent','filed','marketing','elsewhere')),
  filed_at         timestamptz,
  file_error       text,
  unique (box_id, graph_id)
);
create index if not exists mail_messages_conv_idx on public.mail_messages (box_id, conversation_id, at);
create index if not exists mail_messages_place_idx on public.mail_messages (box_id, place, at desc);

-- One row per conversation: whether it needs a reply, how much it matters, and the draft.
create table if not exists public.mail_threads (
  id               uuid primary key default gen_random_uuid(),
  box_id           uuid not null references public.mail_boxes(id) on delete cascade,
  conversation_id  text not null,
  subject          text,
  who_address      text,
  who_name         text,
  rule_id          uuid references public.mail_rules(id) on delete set null,
  enquiry_id       uuid references public.enquiries(id) on delete set null,
  organisation_id  uuid references public.organisations(id) on delete set null,
  contact_id       uuid references public.crm_contacts(id) on delete set null,
  messages         int not null default 0,
  last_in_at       timestamptz,
  last_out_at      timestamptz,
  last_in_graph_id text,
  marketing        boolean not null default false,
  automated        boolean not null default false,
  -- new: not looked at yet · reply: needs a reply from you · fyi: no reply needed · replied: you sent the last email
  -- done: you said no reply needed · marketing
  state            text not null default 'new' check (state in ('new','reply','fyi','replied','done','marketing')),
  needs_reply      boolean,                            -- what the triage said about their last email
  priority         text check (priority in ('urgent','high','normal','low')),
  kind             text,                               -- customer, prospect, supplier, grid, partner, finance, team, personal, other
  summary          text,                               -- one line: what they want
  why              text,                               -- why it matters / why it needs a reply
  due              text,                               -- a deadline they gave, as written
  prospect         jsonb,                              -- {name, phone, postcode} for someone who looks like a new customer
  triaged_for      timestamptz,                        -- the last_in_at it was looked at against
  draft            text,
  draft_for        timestamptz,                        -- the last_in_at the draft answers
  draft_error      text,
  mark             text,                               -- what's marked in Outlook: urgent, high, reply (null: nothing)
  mark_id          text,                               -- on which email
  outlook_draft_id text,                               -- the reply the app put in Outlook's Drafts
  outlook_draft_at timestamptz,                        -- when (a draft changed after this is yours: never replaced or removed)
  done_at          timestamptz,
  updated_at       timestamptz not null default now(),
  unique (box_id, conversation_id)
);
create index if not exists mail_threads_state_idx on public.mail_threads (box_id, state, last_in_at desc);

-- (For anyone who ran an earlier copy of this file.)
alter table public.mail_boxes   add column if not exists highlight        boolean not null default true;
alter table public.mail_boxes   add column if not exists categories_ready boolean not null default false;
alter table public.mail_boxes   add column if not exists style            text;
alter table public.mail_boxes   add column if not exists style_examples   jsonb;
alter table public.mail_boxes   add column if not exists style_from       int;
alter table public.mail_boxes   add column if not exists style_at         timestamptz;
alter table public.mail_boxes   add column if not exists style_edited     boolean not null default false;
alter table public.mail_boxes   add column if not exists outlook_drafts   boolean not null default true;
alter table public.mail_threads add column if not exists outlook_draft_id text;
alter table public.mail_threads add column if not exists outlook_draft_at timestamptz;
alter table public.mail_threads add column if not exists mark             text;
alter table public.mail_threads add column if not exists mark_id          text;

alter table public.mail_boxes    enable row level security;
alter table public.mail_rules    enable row level security;
alter table public.mail_folders  enable row level security;
alter table public.mail_messages enable row level security;
alter table public.mail_threads  enable row level security;

notify pgrst, 'reload schema';

-- Then, once, in the SQL editor (put your CRON_SECRET in): every two minutes.
-- select cron.schedule('mail-sort', '*/2 * * * *', $$
--   select net.http_get(
--     url := 'https://heliaxis.co.uk/api/cron/mail',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
--     timeout_milliseconds := 60000
--   );
-- $$);
