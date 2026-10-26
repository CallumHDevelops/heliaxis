---
title: Set up the follow-up sequence for new leads
summary: Automatic follow-up messages to new leads who haven’t replied, by WhatsApp or email, that stop as soon as they answer.
order: 150
keywords: follow-up, follow ups, sequence, drip, nurture, chase new leads, automatic follow-up, no reply, Add step, first_name, booking link
where: CRM › CRM settings › Follow-up sequence for new leads
path: /admin/crm/settings
access: admin
---
> **Admins only:** Anyone with CRM access can see the sequence, but only admins can change it.

The follow-up sequence sends a new lead a few messages over the first days if they haven’t replied. It’s off until you switch it on.

## Switch it on

1. Open **CRM › CRM settings** and scroll to **Follow-up sequence for new leads**.
2. Tick **On — stops the moment they reply, or when the opportunity moves past Contacted**.
3. Check the steps (below).
4. Press **Save settings**.

## The steps

It comes with two steps you can change: a WhatsApp after 24 hours and an email after 72 hours. Each step has:

- **Hours after enquiry**: when it goes, counted from when the enquiry came in.
- **Send by**: **WhatsApp** or **Email**.
- For WhatsApp, **Template if outside 24h ({{1}} first name)**: the approved template to use if they haven’t messaged in the last 24 hours.
- For email, **Subject**.
- **Message ({first_name})**: what it says. `{first_name}` becomes their first name. You can also use `{booking_link}` for their link to book a survey online, and `{portal_link}` for their portal link.

Press **+ Add step** for another (each new one starts 48 hours after the last), or **Remove** to delete one. You can have up to 8. When you save, the steps are put in order of their hours, and a step with no message is dropped.

## When it stops

A lead gets no more follow-ups once:

- they reply (by WhatsApp or email), or book a survey online,
- the job moves past **Contacted** (for example to **Survey booked**), or
- all the steps have gone.

While the job is on hold, its follow-ups wait. Only leads from the last 45 days get follow-ups, and leads you import never do.

## Leads already in the CRM

When you switch it on, leads from the last 45 days that are still at **Lead** or **Contacted** and haven’t replied join in, but they only get the steps that fall due from then on. A step they’re already past is skipped quietly: it isn’t sent late, and nothing goes on their timeline. For example, with the two steps it comes with, a lead from 2 days ago skips the 24-hour WhatsApp and gets the 72-hour email tomorrow; a lead from a week ago gets neither.

A step you add works the same way: from when you press **Save settings**, a lead already past its hours skips it, and the others get it when it falls due. The other steps carry on as they were, including any that are due but waiting for the quiet hours to end or a job to come off hold.

Changing a step’s hours, **Send by** or message doesn’t change who gets it. A lead still waiting for it gets it at its new time, or straight away if they’re already past that, so moving a step earlier never drops it. Nobody gets the same step twice, whatever you add, move or change. Switching it off and on again starts again from the moment you switch it back on.

## Good to know

- Each follow-up is written on the customer’s timeline as "Follow-up 1 sent (WhatsApp)", or "Follow-up 1 skipped: …" with the reason.
- Email steps need Microsoft 365 connected ([Connect Microsoft 365](/admin/help/admin/microsoft-365)). If a WhatsApp step can’t go, the same message goes by email instead, if it can.
- Follow-ups wait while the WhatsApp quiet hours are on, and need the every-minute job ([Check the every-minute job is running](/admin/help/admin/every-minute-job)).
