---
title: Chasers and chase hours
summary: The automatic nudge when someone goes quiet after you ask a question, the hours it keeps to, and its settings.
order: 140
keywords: chaser, chase, follow up, nudge, final nudge, no reply, quiet hours, 08:45, 21:00, evening rule, 10:00, Chase if no reply, keep chasers free, paid template, remind me, chase settings
where: CRM › Smart replies & chasers › Chasers
path: /admin/enquiries/smart-replies
access: enquiries
---
When you ask a customer something ("can you send us a photo of the meter?") and they go quiet, a chaser goes out by itself. A reply from them cancels it. It’s free while it goes inside the 24 hours after their last message; after that WhatsApp only allows a template (about 1.6p Utility, about 4p Marketing).

## Choosing a chaser when you send

Beside the reply box, **Chase if no reply:** offers:

- **Auto**: chases a message with a "?" in it, after the usual number of hours. It shows "(12h)" or "(off)" for the message you’ve typed.
- **Off**, **4h**, **12h**, **24h** or **3 days**.

Next to it you see when the chaser would really go, such as "tomorrow about 10:00". A template is only chased if you pick a time. Messages typed in the WhatsApp Business app that ask a question get a chaser too, and a smart reply can have its own.

Sending another message yourself cancels any chaser that’s waiting, and sets a new one if this message is chased.

## In the chat

A waiting chaser shows "↻ Chaser if they don’t reply — sends in 2h 10m · free message" (or "· as a template (paid)"), with **Send now**, **Edit** and **Cancel**. If the window will have closed by then, it says "The free window will have closed by then, so your chase template goes instead of: “…”". Lists show **↻ chasing** or **Chasing**.

After the last chaser, if there’s still no reply, everyone with Enquiries gets "Chased Jane" ("No reply yet, so the chaser has gone. Nothing more is scheduled.").

## Chase hours

- **Quiet hours** (21:00 to 08:45 UK time, to start with): chasers, final nudges and reminders never go. They wait until quiet hours end, then go a few minutes after, at random. So no chaser goes before 08:45. (Smart replies and first messages wait too, while their **Hold …** boxes are ticked.)
- **The evening rule**: if we message after 18:00 (or in quiet hours), the chaser doesn’t go before 10:00 the next morning, even if that means it’s no longer free.
- **Keep chasers free**: if the chase time would miss their 24-hour window, the chaser goes about an hour before the window closes instead, never sooner than 4 hours after your message (and still after the evening rule’s 10:00).

The settings show two worked examples, such as "So with chasers after 12h: ask at 14:00 and it goes …; ask at 20:34 and it goes …".

## The settings

On **CRM › Smart replies & chasers**, under **Chasers** (anyone with Enquiries can change them):

| Setting | To start with |
| --- | --- |
| **Chase automatically when a message asks a question (has a “?”) — from Heliaxis or the WhatsApp Business app** | On |
| **Chase after (hours …)** | 12 |
| **Default chase message ({first_name} works)** | "Hi {first_name}, just checking you saw my last message? No rush — whenever you get a minute." |
| **Keep chasers free: …** | On |
| **Final nudge after the chaser (hours, 0 = off — usually a paid template)** | 0 (off) |
| **Template for chasers outside the free window ({{1}} = first name; blank = default template)** | Blank |
| **Quiet hours (UK time)** | 21:00 to 08:45 |
| **If we message after 18:00, don’t chase before 10:00 the next morning** | On |
| **Remind me after (min, 0 = off)** | 30: the team hears when a customer’s message has had no answer (not in quiet hours) |

The same box holds **Messages we type late** ([The late-night rule](/admin/help/whatsapp/late-night-rule)) and the two **Hold …** ticks for smart replies and first messages. Press **Save chaser settings**.

> **Watch out:** Chasers are automatic, so they never go to anyone who replied STOP, nor, with the permission rule on, to anyone who hasn’t agreed. See [WhatsApp permission and STOP](/admin/help/whatsapp/whatsapp-permission).

> **Once switched on:** Chasers need whatsapp-chasers.sql.
