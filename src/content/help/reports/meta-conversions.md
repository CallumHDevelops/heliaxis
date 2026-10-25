---
title: Meta conversions: sending sales back to Meta
summary: What the app tells Meta when a lead books a survey, gets a quote or buys, how to switch it on, and how to check it’s working.
order: 70
keywords: Meta conversions, Conversions API, CAPI, pixel, dataset, Events Manager, offline conversions, Schedule, SubmitApplication, Purchase, optimise ads, sales back to Meta, lead quality
where: CRM › CRM settings › Connections
path: /admin/crm/settings
access: crm
---
Meta’s ads learn from what you tell them. Out of the box, Meta only knows who filled in a form. With Meta conversions on, the app tells Meta which of those leads went on to book a survey, get a quote and buy, so Meta can find more people like your real customers.

## What it sends

When a job moves to one of these stages, the app sends Meta an event for it:

| The job reaches | Event Meta receives |
| --- | --- |
| Survey booked | Schedule |
| Quote sent | SubmitApplication |
| Won, or any stage after it | Purchase, with the job’s value in pounds if it has one |

- Each event goes once per job, however often the job moves back and forth.
- A job added straight in at Won or later (for example with **+ New project** on the Projects page) still sends Purchase.
- Nothing is sent for Contacted, Surveyed or Lost.

To tell Meta who the event is about, the app sends what it knows that Meta can match: the customer’s email and WhatsApp number (scrambled before they’re sent, so Meta can match them without reading them), the Meta lead id for lead-form leads, and the Meta click id for website visitors who came from an ad and accepted cookies. If it has none of these, nothing is sent for that customer.

Nothing is sent to the customer, and the CRM doesn’t change.

## Check whether it’s on

Open **CRM › CRM settings**. Under **Connections**, **Meta conversions** says "sending stages to Meta" when it’s on, or "not connected" when it isn’t. Anyone with CRM access can see this.

## Switch it on

> **Admins only:** It’s the optional **Send sales back to Meta Ads** to-do in From Claude: copy your Pixel or dataset ID and a Conversions API token from Meta’s Events Manager into Vercel, then redeploy. The full steps are in [Send sales back to Meta (conversions)](/admin/help/admin/meta-conversions).

Stage changes before it was switched on aren’t sent afterwards. Jobs that move to a new stage from then on are.

> **Once switched on:** Sending events needs crm-v2.sql, which lets the app remember which events each job has already sent. See [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file).
