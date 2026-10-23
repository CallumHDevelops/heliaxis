---
title: Smart replies
summary: Automatic answers to common WhatsApp questions, sent a few minutes after a keyword comes in, which you can check, change or cancel first.
order: 130
keywords: auto reply, automatic reply, keyword reply, canned answer, FAQ reply, bot, smart replies off, turn off smart replies for a chat, try a message, priority, delay, + New reply
where: CRM › Smart replies & chasers
path: /admin/enquiries/smart-replies
access: enquiries
---
When a WhatsApp from a customer contains one of a smart reply’s keywords, the app queues that reply and sends it after a random wait in the range you set (4–5 minutes to start with), with a read receipt and "typing…" just before, so it looks like a person.

While it waits:

- Everyone with Enquiries gets a notification ("Smart reply “Battery storage” sends in ~4 min — tap to check, edit or cancel.") with **Send now** and **Cancel reply**.
- The chat shows "⏱ Smart reply “Battery storage” sends in 3:12" with **Send now**, **Edit** and **Cancel**.

Anyone with Enquiries access can add and change smart replies. On a phone they’re under **More › Smart replies**.

## Add a smart reply

1. Go to **CRM › Smart replies & chasers**.
2. Press **+ New reply**.
3. **Name**, such as "Battery storage".
4. **Keywords (comma separated — plurals match too)**, such as "battery, batteries, storage".
5. **Reply**: the message. {first_name} puts in their first name.
6. **Wait at least (min)** and **At most (min)**: the random wait.
7. **Priority**: when two smart replies match, the higher number wins.
8. If you want a chaser after it: **Chase if they don’t reply after (hours, blank = no chase)**, and optionally **Chase message (blank = the default chaser below)**.
9. Press **Save**.

## Test it

Type a message into **Try a message** at the top. It says "Would send “Battery storage”" or "No smart reply would be sent."

## Change, pause or delete

Each smart reply’s card shows its wait, priority, chaser and keywords. Use **Turn off** (or **Turn on**), **Edit** and **Delete**.

## When a smart reply doesn’t go

- Only a typed message can set one off, not a photo, voice note or reaction.
- Keywords match whole words only ("led" doesn’t match "called"). With several matches, the highest **Priority** wins, then the longest keyword.
- It stays quiet for 2 hours after anyone on the team replies by hand, here or in the WhatsApp Business app.
- Not while someone has a message scheduled in that chat.
- The same smart reply never goes to the same chat twice within 24 hours.
- Not for a STOP or START reply.
- Not when smart replies are off for that chat, or the customer replied STOP (or, with the permission rule on, hasn’t agreed). See [WhatsApp permission and STOP](/admin/help/whatsapp/whatsapp-permission).
- In quiet hours it’s held until the morning while **Hold smart replies to messages that arrive in quiet hours until the morning** is ticked (in the **Chasers** settings below).
- If you reply yourself first, the waiting smart reply is cancelled.

## Switch smart replies off for one chat

On the full chat page, press **Smart replies on** at the top. It changes to **Smart replies off**, and any smart reply waiting in that chat is cancelled. Press it again to switch them back on. Only people with Enquiries access have this button.

> **Once switched on:** Smart replies need whatsapp.sql. If it hasn’t been run, the page may show an error under "No smart replies yet." Chasers after a smart reply need whatsapp-chasers.sql.

The **Chasers** settings further down the same page are explained in [Chasers and chase hours](/admin/help/whatsapp/chasers).
