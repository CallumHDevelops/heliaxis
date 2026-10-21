-- WhatsApp "Send later" and the late-night rule (src/lib/whatsapp/inbox.ts → scheduleManual).
-- Run after whatsapp-chasers.sql. Safe to run twice.
--
-- A message someone writes and schedules (or types after 20:30, so it waits until 07:00) waits in the
-- outbox as kind 'scheduled' with its author. The outbox sends it at that time as them; quiet hours
-- never hold it, because the time was their choice.

alter table public.whatsapp_outbox drop constraint if exists whatsapp_outbox_kind_check;
alter table public.whatsapp_outbox add constraint whatsapp_outbox_kind_check check (kind in ('reply','intro','chase','scheduled'));

alter table public.whatsapp_outbox add column if not exists sent_by         uuid references public.profiles(id) on delete set null; -- who wrote it: it goes as them
alter table public.whatsapp_outbox add column if not exists template_params text[];      -- a scheduled template's blanks, as they were filled in
alter table public.whatsapp_outbox add column if not exists chase_hours     numeric;     -- "Chase if no reply", counted from when it goes
alter table public.whatsapp_outbox add column if not exists reply_noted_at  timestamptz; -- the customer wrote before it went, and its author was told (once)
