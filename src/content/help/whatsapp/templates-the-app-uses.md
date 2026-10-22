---
title: Templates the app sends by itself
summary: Which template each automatic WhatsApp uses (first messages, chasers, reminders, review requests, trade and handover messages) and how to choose them.
order: 120
keywords: Use for, automatic messages, reminder template, survey reminder, install reminder, review request, chase template, first message, new_enquiry_welcome, survey_reminder, install_reminder, review_request, site templates, handover_pack_ready, job pack template, Use this, Stop using
where: CRM › WhatsApp templates
path: /admin/enquiries/templates
access: admin
---
Inside the 24 hours after a customer’s last message, the app’s automatic WhatsApps go as free typed messages. Outside it they need an approved template, so each automatic message has one chosen for it.

## Choose the template for an automatic message

> **Admins only:** Only admins can choose on this page, and only admins can save **CRM settings**. The chase template box on **Smart replies & chasers** can be changed by anyone with Enquiries access.

1. Go to **CRM › WhatsApp templates**.
2. On a **Ready-made** card that’s **Approved ✓**, press **Use for “Survey booked + reminders”** (or whichever it’s for). It then says "✓ Used for “…”".
3. Or, on any approved card in **Your templates**, press **Use for…**, then **Use this** beside the message you want. **Stop using** takes it off again.

Each line under **Use for…** says "Using this one", which template it uses now (such as "Now: survey_reminder"; "(set in Vercel)" or "(the default)" after the name means nobody has picked one here yet) or "Nothing set yet". If the template can’t do that job, it says why, such as "Its blanks must be, in order: Customer’s first name, When (“tomorrow”, “in 3 days”), Date and time."

| Automatic message | Ready-made template for it | Its blanks |
| --- | --- | --- |
| **First message to new Meta leads** | Welcome a new enquiry | Only Customer’s first name and What they asked about (one or both, any order) |
| **Chasers once the free 24 hours are up** | Any suitable one | Only Customer’s first name and What they asked about (one or both, any order) |
| **Survey booked + reminders** | Survey booked / reminder | Exactly: Customer’s first name, When, Date and time |
| **Install booked + reminders** | Install booked / reminder | Exactly: Customer’s first name, When, Date and time |
| **Google review requests** | Google review request | Exactly: Customer’s first name, Google review link |

## Good to know about each

- **First message to new Meta leads** goes by itself 3–6 minutes after a Meta lead who said yes to WhatsApp comes in (held until quiet hours end if they enquire at night, while **Hold the first message to new leads…** is ticked on **Smart replies & chasers**), but only while automatic first messages are switched on in Vercel. When they’re off, **Use for…** says "Automatic first messages are off (WHATSAPP_AUTO_FIRST_MESSAGE in Vercel isn’t “true”). It’s still the one offered first in a new chat."
- **Chasers:** the same template can be typed into **Template for chasers outside the free window** on **Smart replies & chasers**. With none set, a chaser uses the chase template set in Vercel, then the first-message template, then the default one set in Vercel. See [Chasers and chase hours](/admin/help/whatsapp/chasers).
- **Survey and install reminders** and **review requests**: when they go, and the Google review link, are on **CRM settings** under **Install & survey reminders (WhatsApp)** and **Review requests**, which also have boxes for the template names. The dashboard’s **From Claude** to-do "Create the 3 WhatsApp reminder templates" walks you through it.
- Each WhatsApp step of the **Follow-up sequence for new leads** on **CRM settings** has its own **Template if outside 24h** box.

## Trade and handover templates

The site app’s templates (**Trade: your job pack**, **Trade: PO raised**, **Trade: scaffold strike photos**, **Trade: clear to start**, **Trade: don’t use the scaffold yet**, **Trade: return to site required** and **Trade: green light**) and **Handover pack ready** are used by name: send them to Meta from **Ready-made** and that’s all. The trade ones are never offered in a customer’s chat. Until a trade template is approved, that message goes to trades by email only. See [Job messages to trades on WhatsApp](/admin/help/site/whatsapp-job-messages) and [Send the handover pack](/admin/help/handover/send-the-pack).

> **Watch out:** Automatic WhatsApps never go to anyone who replied STOP, nor, with the permission rule on, to anyone who hasn’t agreed. See [WhatsApp permission and STOP](/admin/help/whatsapp/whatsapp-permission).
