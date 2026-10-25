---
title: The late-night rule
summary: A WhatsApp you send after 20:30 waits until 07:00 the next morning, unless you press Send now instead.
order: 160
keywords: late night, evening, 20:30, 07:00, after hours, send in the morning, out of hours, Send now instead, night time, held until morning, messages we type late
where: CRM › Smart replies & chasers › Messages we type late
path: /admin/enquiries/smart-replies
access: enquiries
---
Press **Send** at or after 20:30 (UK time), or in the small hours before 07:00, and your WhatsApp waits until 07:00 instead of waking the customer. Typed at 23:00, it goes at 07:00 the next day; typed at 02:00, at 07:00 that morning. It’s the same for everyone on the team.

## What you see

- **Send** says **at 07:00** under it (Ctrl/⌘ + Enter does the same). For a template it’s **Send template at 07:00**, and on a job’s WhatsApp sheet **Send at 07:00**.
- Under the box: "It’s late, so this goes at 07:00 tomorrow." with **Send now instead** for anything that can’t wait.
- Once sent, it waits in the chat as "🕐 Scheduled for 07:00 tomorrow". Change, send or cancel it like any scheduled message: see [Send a WhatsApp later](/admin/help/whatsapp/send-later). In the WhatsApp panel you’ll see "Scheduled for 07:00 tomorrow ✓".

It covers typed messages and templates, from a chat, the WhatsApp panel or a job’s WhatsApp sheet, and WhatsApps Metis drafted for you.

## What doesn’t wait

- Anything you send with **Send now instead**.
- Documents sent from a job: "Documents don’t wait for 07:00: this one goes straight away."
- Purchase orders and return-to-site notices to trades. Other job messages to trades wait for the morning in the same way. See [Job messages to trades on WhatsApp](/admin/help/site/whatsapp-job-messages).
- Automatic messages (chasers, reminders, smart replies, first messages). They keep to quiet hours instead: chasers and reminders always, smart replies and first messages while their **Hold …** boxes are ticked. See [Chasers and chase hours](/admin/help/whatsapp/chasers).

> **Watch out:** A typed message only goes inside the customer’s 24-hour window. If it would close before 07:00, you get a warning with **Send now (free)**, a time before it closes, or a template instead.

## Change the times

On **CRM › Smart replies & chasers**, under **Messages we type late**:

1. Tick or untick **If Send is pressed after 20:30, send at 07:00 the next morning**.
2. Change the two times if you want to.
3. Press **Save chaser settings**.

Anyone with Enquiries access can change it.

> **Once switched on:** The late-night rule needs whatsapp-scheduled.sql. Until it’s been run, messages go when you press **Send**.
