---
title: Reminders and review requests
summary: Set when customers get their survey and install reminders, which WhatsApp templates they use, and when the Google review request goes.
order: 140
keywords: install reminder, survey reminder, countdown, booking confirmation, days before, reminder hour, WhatsApp template, Google review, review link, review request, days after complete, automatic messages
where: CRM › CRM settings › Install & survey reminders (WhatsApp)
path: /admin/crm/settings
access: admin
---
> **Admins only:** Anyone with CRM access can see these settings, but only admins can change them.

The CRM sends these to customers by itself. Change them on **CRM › CRM settings**, then press **Save settings**.

## Survey and install reminders

As soon as a survey or install date is set on a job, the customer gets a confirmation ("your Heliaxis survey is booked for …"). Then they get countdown reminders before the day. For a date more than a month away, the confirmation goes once the date is within a month. Moving the date or time sends a new confirmation.

Under **Install & survey reminders (WhatsApp)**:

- **Install: days before**: how many days before an install to remind them, separated by commas. It starts as 7, 3, 1.
- **Survey: days before**: the same for surveys. It starts as 1.
- **Send at (UK hour)**: the hour reminders go out, between 7 and 20. It starts at 9.
- **Install template** and **Survey template**: the WhatsApp templates to use when the customer hasn’t messaged in the last 24 hours.

Inside 24 hours of their last message, a reminder is a normal (free) WhatsApp. Outside it, WhatsApp only allows a template Meta has approved, which costs about 2p. If the WhatsApp can’t go (for example, no template is set, or the customer hasn’t agreed to WhatsApp messages: see [WhatsApp permission and STOP](/admin/help/whatsapp/whatsapp-permission)), the app sends it by email instead, as long as Microsoft 365 is connected and the customer has an email address. Either way, the customer’s timeline says what was sent, or why it wasn’t.

Reminders aren’t sent for jobs that are on hold, **Lost** or **Complete**. If a date is booked too late for a reminder (a 7-day reminder for an install in 2 days), that reminder is skipped.

## Review requests

Under **Review requests**:

- **Google review link**: your business’s review link. Nothing is sent until it’s filled in. It must start with https://, or it isn’t kept when you save.
- **Days after Complete**: how long after a job is marked **Complete** to ask. It starts at 3.
- **Template ({{1}} name, {{2}} link)**: the WhatsApp template for when the 24 hours are up.

Each job is asked about once, from the reminder hour on that day. If the request would go more than 14 days late (say the link was only added later), it isn’t sent. The message thanks them for choosing Heliaxis and asks for a quick Google review, with your link.

To find your link, search Google for Heliaxis while signed in to the account that manages the business profile, then use **Ask for reviews** (or **Get more reviews**) › **Copy link**.

## Set up the templates

The easiest way to fill in the template boxes is from the WhatsApp templates page:

1. Open **CRM › WhatsApp templates** (it needs Enquiries access), then the **Ready-made** tab.
2. On **Survey booked / reminder**, **Install booked / reminder** and **Google review request**, press **Send to Meta for approval**. Meta usually approves them within minutes to a few hours.
3. Once each is approved, press its **Use for** button. That fills in these settings for you.

See [WhatsApp templates](/admin/help/whatsapp/templates) for more. The **Create the 3 WhatsApp reminder templates** job on the From Claude card goes once all three are in use.

> **Good to know:** None of these go out during the WhatsApp quiet hours (set in **Smart replies & chasers**): they wait until the quiet hours end. All of them need the every-minute job. See [Check the every-minute job is running](/admin/help/admin/every-minute-job).
