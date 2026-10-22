---
title: What each figure means
summary: How CRM reports counts leads, surveys, sales, £ won, win rate and first reply, and how to read the funnel and the By person table.
order: 20
keywords: leads, surveys, won, win rate, conversion rate, £ won, value, typical first reply, response time, speed to lead, within 15 min, funnel, pipeline funnel, by person, owner, unassigned, how is it counted
where: CRM › CRM reports
path: /admin/crm/reports
access: crm
---
Every figure on CRM reports is about the opportunities made in the period you’ve picked, and where each of them has got to **now**. A lead from 80 days ago that was won yesterday counts as won in the 90-day view.

## The columns

These appear in **By source and ad campaign** and **By person**.

| Column | What it counts |
| --- | --- |
| **Leads** | Opportunities made in the period. A customer with two jobs counts twice. Someone on Enquiries with no job isn’t counted |
| **Surveys** | Of those, the ones with a survey date or that have reached Survey booked or later, leaving out lost ones |
| **Won** | The ones at Won or any later stage, up to Complete |
| **Win rate** | Won ÷ (won + lost). Jobs still open don’t count either way. "—" until one is won or lost |
| **£ won** | The total **Value** of the won jobs. A won job with no value adds £0 |

The tables are sorted by **£ won**, then by **Leads**. A period with nothing in it says "No opportunities in this period." (once ad spend is connected, the Meta part of the source table says "No Meta leads or ad spend in this period.").

> **Good to know:** When two customers have been merged, the lead that was joined into the other job still counts as a lead for its own source, with nothing sold. The sale counts once, for the job’s source.

## Typical first reply

**Typical first reply** is how long a new lead usually waits between their opportunity being made and someone on the team first getting in touch: half wait longer, half less. It shows in minutes, hours ("1.5 h") or days. Beside it, **within 15 min** is the share of contacted leads reached within 15 minutes.

Only leads that have been contacted count. For what counts as getting in touch, see [Contact a new lead](/admin/help/enquiries/contact-a-lead).

> **Watch out:** An imported lead counts from the date it first came in. Getting in touch with an old imported lead now counts as a very slow reply.

## Pipeline funnel

![The Pipeline funnel and By person](/help/reports/funnel.jpg "The funnel, then the same figures for each person")

"How many of this period’s opportunities have reached each stage (lost ones excluded)." Each bar is a stage, from **Lead** to **Complete**, with how many opportunities are at that stage or further on. The bars are drawn against the first one, so you can see where leads drop away. Point at a bar on a computer to see its stage and number.

Lost opportunities are left out of the funnel completely, whichever stage they got to.

## By person

The same columns for each owner, by the job’s **Owner**. Jobs with no owner show as **Unassigned**. A lead shared out on the rota counts for the person it went to. See [Choose who gets new leads](/admin/help/admin/new-leads) for the rota.

## Things that change the figures

- A change to a job’s stage or value shows the next time the report loads.
- Moving a job’s owner moves it between people in **By person**.
- Deleting a customer takes their jobs out of every figure.

For why these numbers differ from the count on Enquiries or from Meta’s, see [Why the report’s numbers differ from Enquiries and Meta](/admin/help/reports/numbers-dont-match).
