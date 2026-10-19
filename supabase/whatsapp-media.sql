-- WhatsApp photos, videos, voice notes, stickers and files customers send (src/lib/whatsapp/media.ts).
-- Run after whatsapp.sql. Safe to run twice. Until it's run, the chat says "📷 Photo" as before.
--
-- Each one is downloaded from WhatsApp as soon as it arrives (WhatsApp keeps them for 7 days) into
-- a private storage bucket, whatsapp-media, which the app creates the first time. Only people who can
-- open the chat can see them, through the app.

alter table public.whatsapp_messages add column if not exists media_id     text;   -- Meta's media id (from the webhook)
alter table public.whatsapp_messages add column if not exists media_mime   text;   -- e.g. image/jpeg, audio/ogg; codecs=opus
alter table public.whatsapp_messages add column if not exists media_name   text;   -- a document's file name, as they sent it
alter table public.whatsapp_messages add column if not exists media_size   bigint; -- bytes, once saved
alter table public.whatsapp_messages add column if not exists media_path   text;   -- {enquiry id}/{message id}.{ext} in whatsapp-media
alter table public.whatsapp_messages add column if not exists media_status text
  check (media_status in ('pending','saved','failed','too_big','expired'));       -- null: no file
alter table public.whatsapp_messages add column if not exists media_error  text;   -- why it couldn't be kept, in plain words
