-- 23. WhatsApp chasers + WhatsApp Business app sync (run after whatsapp.sql; see WHATSAPP_SETUP.md).

-- Outbox items are now one of: a smart reply, the intro template to a new lead, or a chaser.
alter table public.whatsapp_outbox add column if not exists kind text not null default 'reply';
alter table public.whatsapp_outbox drop constraint if exists whatsapp_outbox_kind_check;
-- 'scheduled' (Send later) comes with whatsapp-scheduled.sql; listed here too so running this again keeps it.
alter table public.whatsapp_outbox add constraint whatsapp_outbox_kind_check check (kind in ('reply','intro','chase','scheduled'));
alter table public.whatsapp_outbox add column if not exists chase_step int not null default 0; -- 1 = first chase, 2 = final nudge
update public.whatsapp_outbox set kind = 'intro' where template_name is not null and rule_id is null and kind = 'reply';

-- Where an outgoing message came from: null = Heliaxis app, 'whatsapp-app' = typed in the
-- WhatsApp Business app (coexistence echo), 'chase' = an automatic chaser.
alter table public.whatsapp_messages add column if not exists via text;

-- A smart reply can chase if they don't answer it.
alter table public.whatsapp_rules add column if not exists follow_up_hours numeric;  -- null = no chase
alter table public.whatsapp_rules add column if not exists follow_up_text  text;     -- null = the default chase text

-- "You haven't replied to …" reminders: when we last reminded the team about this chat.
alter table public.enquiries add column if not exists wa_reminded_at timestamptz;
