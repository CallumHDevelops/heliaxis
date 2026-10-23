---
title: WhatsApp permission and STOP
summary: Who has agreed to automatic WhatsApps, what STOP and START do, and the rule that only messages customers who’ve agreed.
order: 170
keywords: opt in, opt out, consent, agreed, STOP, START, unsubscribe, permission switch, They agreed, Not asked, only send automatic WhatsApps, review list, GDPR, Check who’s agreed
path: /admin/crm/whatsapp-permission
access: crm
---
WhatsApp permission is about **automatic** WhatsApps: reminders, follow-ups, smart replies, chasers and first messages. You can still message anyone yourself, though you should only do so if they’ve agreed.

## How someone agrees

The app records it by itself when they message us, tick the box on the website or booking form, come in from a Meta lead form that asks, or wrote in a chat you imported. Staff can record it too (below). The **Customer** card’s **WhatsApp** line says how it stands, for example "Agreed on 3 Oct when they messaged us", "Agreed on 3 Oct via the website form", "Agreed on 3 Oct (recorded by Esther Smith)", "Replied STOP on 3 Oct: no automatic WhatsApps" or "Not agreed yet".

Permission belongs to the person, so it covers every record with the same number, except a website or booking form tick, which only counts for that one enquiry.

## STOP and START

If a customer replies **STOP** (or "unsubscribe", "stop all", "opt out"), and that’s all their message says:

- nothing automatic goes to that number again, whatever the rule below says;
- anything waiting for them is cancelled, including scheduled messages (whoever wrote them is told);
- they get one reply: "You won’t get any more automatic WhatsApp messages from us. Reply START to turn them back on.";
- their timeline says "Replied STOP: no more automatic WhatsApp messages (reminders, follow-ups, smart replies)", and the notification adds "Automatic WhatsApps to them are now off. You can still reply by hand."

**START** turns them back on, with "Thanks, automatic WhatsApp messages from us are back on. Reply STOP at any time to turn them off."

A message like "Stop by tomorrow?" doesn’t count. For trades who reply STOP, see [Job messages to trades on WhatsApp](/admin/help/site/whatsapp-job-messages).

## Switch it on or off for one customer

Use the switch beside **WhatsApp** on their **Customer** card, and confirm.

- On asks "Has Jane agreed to WhatsApp messages from us? Only switch this on if they have."
- Off asks "Turn off WhatsApp permission for Jane Smith? …" and works like a STOP until they reply START or someone switches it back on.
- Switching it on after a STOP says so ("They replied STOP on 3 Oct, so it’s still off. Only switch it on if they’ve asked you to.", or who switched it off) and asks "Has Jane Smith asked us to start messaging them again? OK switches it back on."

See [Change a customer’s details](/admin/help/customers/edit-customer-details).

## The permission list and the rule

The **WhatsApp permission** page opens from the dashboard’s **From Claude** to-do "Check who’s agreed to WhatsApp messages" (**Open the list**), or at [/admin/crm/whatsapp-permission](/admin/crm/whatsapp-permission). Anyone with CRM can use it.

- **Only send automatic WhatsApps to customers who’ve agreed**, marked **On** or **Off**. It starts off, so everyone who hasn’t replied STOP gets them. When it’s on, customers who haven’t agreed get no automatic WhatsApps, and get an email instead if we have their email address (once Microsoft 365 is connected). Before you switch it on, it says how many customers with open jobs it would stop.
- **Switch on** or **Switch off**, then **Yes, switch it on** / **Yes, switch it off** or **Cancel**.
- **Open jobs to check** lists customers with an open job and a mobile but nothing recorded. Press **They agreed** if they messaged you first, ticked the box on the website or said yes on the phone, or **Not asked** to take them off the list without giving permission. **Undo** appears after each, in case you pressed the wrong one.
- It shows the newest 300 at a time; the rest appear as you go. When you’ve been through everyone it says **Nothing to check**.

> **Admins only:** Only admins can switch the rule on or off. Everyone else sees "Only admins can change this."

> **Once switched on:** Permission records, STOP replies and this page need crm-v3.sql. Until it’s run, the page says "Run **crm-v3.sql** in Supabase first (it’s on your to-do list). This page works once it’s done.", and a STOP reply can’t be kept.
