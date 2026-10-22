---
title: The Board and List views
summary: See every opportunity as columns by stage or as a work queue, filter them, and move them between stages.
order: 50
keywords: kanban, columns, drag, move to, filter, chips, live, mine, due, no next step, not contacted, quiet, possible duplicate, work queue
where: CRM › Pipeline › Board or List
path: /admin/crm
access: crm
---
Switch with **Home**, **Board** and **List** at the top of the CRM page. The Board is only on screens at least 1024px wide; phones and small tablets show the List instead.

## The chips

Both views have the same chips across the top:

| Chip | Shows |
| --- | --- |
| **Live** | Everything that isn’t Complete or Lost |
| **Mine** | Live jobs you own |
| **Due** | Live jobs whose next step (or, with none, soonest task) is due by the end of today |
| **No next step** | Sales jobs with no next step and no task |
| **Not contacted** | Leads nobody has called, messaged or emailed yet |

In the List, **No next step** and **Not contacted** are sorted oldest first, so the longest-waiting come to the top. The List also has a stage picker (**Every stage**, or one stage, including Complete and Lost). Picking a stage shows that stage even on **Live**, so it’s how you see Complete and Lost jobs.

## The Board

A column for each sales stage, **Lead** to **Quote sent**, then **Won (last 30 days)**. Each column shows how many cards it has and their total value. An empty column folds to a thin strip. Columns show 50 cards, then **Show 50 more**. The Won column ends with **Open in Projects →**.

To move a card, drag it to another column, or press **Move** on it and pick a stage. You can’t drop a card on the Won column; use **Move** and pick **Won** instead.

## The List

Cards in a grid (one column on a phone), with how many there are above them. The usual order is a work queue: anything due first, then customers with unread WhatsApp messages, then the most recently changed. It shows 60, then **Show 60 more**.

## What a card shows

- The customer (and the job’s name if they have more than one job), its value, postcode and products.
- The next step (▸) or, with none, the soonest task (✅), and when it’s due (or **No next step**).
- The last WhatsApp message if they’ve written and nobody has read it, or **💬** with the unread count.
- The stage (in the List), the reference, the owner’s initials, and any of: **On hold**, **Possible duplicate**, **Quiet 9d** (a sales job nobody has changed for 7 days or more).

Click the name to open the customer’s page (a job from Won onwards opens in Projects). **Move** opens a list of stages: **Lead** to **Quote sent**, **Won** and **Lost**.

> **Good to know:** Moving a card to **Lost** here doesn’t ask why. To record a reason, use the stage button on the customer’s page, or add it later in Job details. See [Lost, on hold and reopening](/admin/help/customers/lost-and-on-hold).

For what each stage means, see [Sales stages](/admin/help/customers/sales-stages).
