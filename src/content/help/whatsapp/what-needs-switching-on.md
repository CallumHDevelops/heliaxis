---
title: What needs switching on for WhatsApp
summary: The database files and the Meta connection each part of WhatsApp needs, and what you see until they’re in.
order: 200
keywords: SQL, database file, Supabase, From Claude, Copy SQL, not connected, Meta keys, whatsapp.sql, whatsapp-chasers.sql, whatsapp-media.sql, whatsapp-scheduled.sql, crm-v3.sql, customer-refs.sql, notifications-ref.sql, every-minute job, cron, smart replies not sending, chasers not sending, set up, not working
access: enquiries
---
Each part of WhatsApp appears by itself once its database file has been run in Supabase. Each file is a **From Claude** to-do on the dashboard ("Run whatsapp.sql in Supabase" and so on), for admins or whoever an admin passes it to: press **Copy SQL**, then **Open Supabase**, paste it and press **Run**. See [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file). Until a file is run, the screens do without that part.

| File | What it switches on | Until then |
| --- | --- | --- |
| whatsapp.sql | The WhatsApp inbox, smart replies and the outbox that sends them | The WhatsApp pages show an error or stay empty, and **Smart replies** says "(Run supabase/whatsapp.sql if this page shows an error.)" |
| whatsapp-chasers.sql (after whatsapp.sql) | Chasers, a smart reply’s own chaser, messages typed in the WhatsApp Business app showing in the chat, the "waiting for a reply" reminder, and importing chats | No chasers; Import says "Run supabase/whatsapp-chasers.sql in Supabase first." |
| whatsapp-media.sql (after whatsapp.sql) | The photos, videos, voice notes and files customers send, in the chat, and **Save to job photos** | The chat shows "📷 Photo" and the like instead |
| whatsapp-scheduled.sql (after whatsapp-chasers.sql) | **Send later** and the late-night rule | Messages go when you press **Send**; the clock says "Send later needs one setup step first…" |
| crm-v3.sql | WhatsApp permission records: when and how someone agreed, STOP replies kept, and the **WhatsApp permission** page | The page says to run crm-v3.sql first, and a STOP reply can’t be kept |
| customer-refs.sql | References such as HX-0042 beside names and in WhatsApp search | No references |
| notifications-ref.sql (after notifications.sql) | A chat’s notifications clearing for everyone once it’s read or answered | They’re still cleared, but matched the older way, by the notification’s link and title |
| whatsapp-feed-index.sql (optional) | Faster WhatsApp rows in **Latest notes** on the CRM home | Nothing missing; it’s only for speed |

## The Meta connection

WhatsApp also needs connecting to Meta, which an admin does once (the **From Claude** to-do "Finish connecting WhatsApp"). Until it is, the inbox says "WhatsApp isn’t connected yet — conversations will appear here once the Meta keys are added (see WHATSAPP_SETUP.md)." and the WhatsApp panel says "WhatsApp isn’t connected yet, so sending is off until the Meta keys are added. The chat history still shows."

> **Admins only:** **Check the WhatsApp connection →** on **WhatsApp templates** (when it can’t see the templates) opens the setup page, whose **Live check with Meta** checks the number. **WhatsApp setup guide** has the steps. See [Check the WhatsApp connection](/admin/help/admin/whatsapp-connection).

Automatic first messages to new Meta leads also have to be switched on in Vercel by an admin. See [Templates the app sends by itself](/admin/help/whatsapp/templates-the-app-uses).

## The every-minute job

Smart replies, chasers, scheduled messages (Send later and the late-night rule), reminders and the "waiting for a reply" alerts are sent by a job Supabase runs every minute. Without it, smart replies, chasers and scheduled messages only go when someone has the WhatsApp inbox or a chat open, or a new WhatsApp comes in, and reminders and alerts don’t go at all. The app can’t check it by itself, so it’s a **From Claude** to-do: "Check the every-minute job is switched on". See [Check the every-minute job is running](/admin/help/admin/every-minute-job).

## Other WhatsApp to-dos

The dashboard’s **From Claude** card also has "Create the 3 WhatsApp reminder templates" ([Templates the app sends by itself](/admin/help/whatsapp/templates-the-app-uses)) and "Check who’s agreed to WhatsApp messages" ([WhatsApp permission and STOP](/admin/help/whatsapp/whatsapp-permission)) until they’re done.

> **Good to know:** The bell and phone notifications need their own files (notifications.sql, native-push.sql). See [Notifications and the bell](/admin/help/getting-started/notifications).

To check the WhatsApp connection itself, see [Check the WhatsApp connection](/admin/help/admin/whatsapp-connection). Every database file, WhatsApp’s and the rest, is in [What each database file switches on](/admin/help/admin/database-files).
