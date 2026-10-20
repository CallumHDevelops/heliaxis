-- 31. Makes the WhatsApp rows in Latest notes (CRM home) load faster once there are lots of messages,
--     imported chats included: the newest messages across every chat, and your own for "Mine".
--     (Each chat's own messages already have their index, whatsapp_messages_enquiry_idx in whatsapp.sql.)
--     Optional: run it any time after whatsapp.sql; nothing depends on it, and the rows show without it.
--     Safe to re-run.

create index if not exists whatsapp_messages_created_idx on public.whatsapp_messages (created_at desc, id desc);
create index if not exists whatsapp_messages_sent_by_idx on public.whatsapp_messages (sent_by, created_at desc) where sent_by is not null;

notify pgrst, 'reload schema';
