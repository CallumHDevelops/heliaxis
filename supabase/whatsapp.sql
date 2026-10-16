-- 22. WhatsApp inbox + Meta Lead Ads (see WHATSAPP_SETUP.md).
--     Server-only (service role); RLS on with no policies, like the other tables.

-- Enquiries: where Meta leads land, plus the WhatsApp state of each lead.
alter table public.enquiries add column if not exists meta_lead_id       text unique;  -- Lead Ads leadgen_id (dedupes webhook retries)
alter table public.enquiries add column if not exists wa_id              text;         -- WhatsApp number, digits only, e.g. 447700900123
alter table public.enquiries add column if not exists whatsapp_opt_in    boolean not null default false;
alter table public.enquiries add column if not exists wa_last_inbound_at timestamptz;  -- opens the 24h free-reply window
alter table public.enquiries add column if not exists wa_last_message_at timestamptz;  -- inbox sort order
alter table public.enquiries add column if not exists wa_unread          int not null default 0;
alter table public.enquiries add column if not exists wa_auto_off        boolean not null default false; -- smart replies off for this chat
create index if not exists enquiries_wa_id_idx on public.enquiries (wa_id);
create index if not exists enquiries_wa_last_idx on public.enquiries (wa_last_message_at desc nulls last);

-- Every WhatsApp message in or out.
create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  enquiry_id    uuid not null references public.enquiries(id) on delete cascade,
  wa_message_id text unique,                -- Meta's id (wamid…); null until sent
  direction     text not null check (direction in ('in','out')),
  kind          text not null default 'text', -- text | template | image | document | audio | video | location | other
  body          text,
  template_name text,
  status        text not null default 'sent'  -- in: received | read · out: sent | delivered | read | failed
                check (status in ('received','read','sent','delivered','failed')),
  error         text,
  sent_by       uuid references public.profiles(id) on delete set null, -- null + rule_id = smart reply
  rule_id       uuid,
  created_at    timestamptz not null default now(),
  status_at     timestamptz
);
create index if not exists whatsapp_messages_enquiry_idx on public.whatsapp_messages (enquiry_id, created_at);

-- Smart replies: keyword → answer, sent after a human-looking delay.
create table if not exists public.whatsapp_rules (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  keywords          text[] not null default '{}',
  reply             text not null,
  enabled           boolean not null default true,
  delay_min_seconds int not null default 240 check (delay_min_seconds >= 0),
  delay_max_seconds int not null default 300 check (delay_max_seconds >= 0),
  priority          int not null default 0,       -- higher wins when several match
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Replies waiting for their send time (smart replies, and delayed first templates).
create table if not exists public.whatsapp_outbox (
  id            uuid primary key default gen_random_uuid(),
  enquiry_id    uuid not null references public.enquiries(id) on delete cascade,
  rule_id       uuid references public.whatsapp_rules(id) on delete set null,
  body          text,
  template_name text,                        -- set = send this template instead of body
  template_lang text,
  reply_to      text,                        -- inbound wamid: marked read + typing shown just before sending
  send_after    timestamptz not null,
  status        text not null default 'pending'
                check (status in ('pending','sending','sent','cancelled','failed')),
  attempts      int not null default 0,
  last_error    text,
  created_at    timestamptz not null default now()
);
create index if not exists whatsapp_outbox_due_idx on public.whatsapp_outbox (send_after) where status = 'pending';
create index if not exists whatsapp_outbox_enquiry_idx on public.whatsapp_outbox (enquiry_id) where status = 'pending';

alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_rules    enable row level security;
alter table public.whatsapp_outbox   enable row level security;

-- Starter smart reply (your wording). Add and edit the rest in Enquiries → Smart replies.
insert into public.whatsapp_rules (name, keywords, reply, priority)
select 'Air source heat pumps',
       array['air source','airsource','heat pump','heatpump','ashp'],
       'Yes, of course — we install air source heat pumps, and we''re MCS accredited to do so. Could you tell me roughly how big your property is and how it''s heated at the moment? Then I can give you an idea of cost.',
       10
where not exists (select 1 from public.whatsapp_rules);

-- Run due smart replies every minute. Vercel Hobby only allows daily crons, so Supabase
-- calls the endpoint instead. Enable pg_cron and pg_net (Database → Extensions), put your
-- CRON_SECRET in below, and run this block once:
--
-- select cron.schedule('whatsapp-outbox', '* * * * *', $$
--   select net.http_get(
--     url := 'https://heliaxis.co.uk/api/cron/whatsapp-outbox',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--   );
-- $$);
