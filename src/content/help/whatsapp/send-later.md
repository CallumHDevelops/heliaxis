---
title: Send a WhatsApp later
summary: Schedule a message or template for a set time with the clock beside Send, then change, send or cancel it before it goes.
order: 150
keywords: schedule, scheduled message, send later, clock button, tomorrow morning, 07:00, 08:45, 09:30, pick a date and time, delay sending, cancel scheduled message, edit scheduled message
access: enquiries, crm
---
![The Send later choices open above the reply box on a phone](/help/whatsapp/send-later.jpg "Send later: quick times, or pick a date and time")

## Schedule a message

1. Type your message, or fill in a template.
2. Press the clock beside **Send** (**Send later**).
3. Pick **Tomorrow 07:00**, **Tomorrow 08:45** or **Tomorrow 09:30**. Or press **Pick a date and time…**, choose one and press **Schedule**.

It goes as you at that time (UK time), and waits in the chat until then as "🕐 Scheduled for 07:00 tomorrow", with your name. The lists show **🕐 scheduled 07:00** (inbox) or **Scheduled 07:00** (panel).

- In the small hours the choices say **This morning**. A Sunday morning becomes Monday.
- You can schedule up to 4 weeks ahead.
- When the message will be chased, each choice shows when the chaser would go, such as "chased about 19:00".

## A typed message has to go inside the 24 hours

WhatsApp only takes a typed message within 24 hours of their last one. A choice that would land after that says "after Jane’s free window". Pick it anyway and you get a warning, such as "⚠ Jane’s free 24-hour window closes at 01:00 tonight, before 07:00 tomorrow…", with:

- **Send now (free)**;
- **Pick a time before 01:00 tonight**;
- **Send a template at 07:00 tomorrow instead**;
- **Back**.

A template can be scheduled for any time.

## Change, send or cancel it

The person who wrote it, or an admin, sees **Send now**, **Edit** and **Cancel** on it. **Edit** lets you change the words and **Send at (UK time)**; press **Save**. Everyone else sees "Only Callum or an admin can change it."

## What happens next

- It goes at its time even in quiet hours: the time was your choice.
- Written after their last message, it counts as your answer: the chat isn’t **Needs reply**, and nobody is reminded they’re waiting.
- Any smart reply waiting in the chat is cancelled when you schedule. When yours goes, a waiting chaser stands down, and your own chaser counts from then.
- If they write before it goes, it still goes. You get "Jane replied — your message for 07:00 tomorrow is still scheduled" with **Cancel message** and **Edit** (and "Your message to Jane went at 07:00" once it has), and the chat says "Jane has written since this was scheduled. It still goes at 07:00 tomorrow unless you change it."
- If they reply STOP, it’s cancelled and you’re told.
- If a typed one can’t go because their window has closed, you get "Your WhatsApp to Jane Smith didn’t go". Open the chat and send a template instead. Until then the chat warns you: "… So it won’t go unless Jane messages first: pick an earlier time, or cancel it and send a template."

> **Once switched on:** Send later needs whatsapp-scheduled.sql. Until it’s been run, the clock says "Send later needs one setup step first: run whatsapp-scheduled.sql in Supabase. It’s on the to-do list." and messages go when you press **Send**.

See also [The late-night rule](/admin/help/whatsapp/late-night-rule).
