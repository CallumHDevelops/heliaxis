-- 27. Notifications that go by themselves (run after notifications.sql).
--     ref says what a notification is about: 'wa:<enquiry id>' (their WhatsApp messages),
--     'wa-reply:<enquiry id>' (waiting for a reply) or 'lead:<enquiry id>' (a new lead). Reading the
--     chat, replying or first contacting the lead then marks it read for everyone
--     (src/lib/notify.ts). Safe to run twice.
alter table public.notifications add column if not exists ref text;
create index if not exists notifications_ref_idx on public.notifications (ref) where read_at is null;
-- Finds the ones saved before ref existed, by where they link to.
create index if not exists notifications_href_idx on public.notifications (href) where read_at is null;

-- Tidy up the bell: message notifications for chats already read, and new-lead alerts for leads
-- already contacted (each part only if that feature's tables are there).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'enquiries' and column_name = 'wa_unread') then
    update public.notifications n
       set read_at = now()
      from public.enquiries e
     where n.read_at is null
       and n.kind = 'whatsapp'
       and n.href = '/admin/enquiries/inbox/' || e.id
       and e.wa_unread = 0
       and (n.title like 'WhatsApp from %' or n.title like 'New WhatsApp lead: %');
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'crm_projects' and column_name = 'first_contact_at') then
    update public.notifications n
       set read_at = now()
      from public.crm_projects p
     where n.read_at is null
       and n.kind in ('crm_new_lead', 'crm_first_response')
       and n.href = '/admin/crm/' || p.id
       and p.first_contact_at is not null;
  end if;
end $$;
