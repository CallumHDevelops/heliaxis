---
title: More than one job for a customer, and HX references
summary: How customers, opportunities and projects fit together, what HX-0042 and HX-0042-2 mean, and how to add a second job.
order: 140
keywords: opportunity, project, job, second job, add-on, reference, ref, HX number, customer number, job number, HX-0042-2, other projects, customer reference
where: CRM › Pipeline › a customer
access: crm
---
## Customers, opportunities and projects

- A **customer** is the person: their name, mobile, email, postcode and WhatsApp chat.
- An **opportunity** is one piece of sales work for them, such as solar and a battery at their home. It has its own stage, next step, tasks, notes, photos and documents.
- A **project** is the same record once it’s Won. Nothing is copied: the signed quote, deposit, survey, photos and chat are already there.

A customer can have several jobs: a solar install now and an EV charger next year, or a second property. Each job moves through the stages on its own. Their WhatsApp chat and emails belong to the customer, so they show on every one of their jobs.

## References

Every customer gets a reference such as **HX-0042** the moment they’re added. Their first job shares it. Later jobs add a number: **HX-0042-2**, **HX-0042-3** and so on.

- A reference never changes and is never used again, even after a delete.
- You’ll see it on cards, in the header of the customer’s page, in the WhatsApp inbox and on the Enquiries page.
- When a job’s reference differs from the customer’s, the header shows both (for example **HX-0042-2** and **Customer HX-0042**).
- Search finds them: **HX-0042**, **hx42** or **0042** find the customer and all their jobs; **HX-0042-2** finds just that job. See [Find a customer](/admin/help/customers/find-a-customer).

> **Once switched on:** References need customer-refs.sql. Until it’s been run, nobody has one.

## See a customer’s other jobs

On their page, **Other projects (n) ▾** in the header lists them, and the left column has **Other projects for Jane**, each with its reference and stage. Tap one to open it. On the Board and List, a customer with more than one job shows the job’s name after theirs, such as “Jane Smith · EV charger”.

## Add another job

- For more sales work (a new enquiry, a quote to do): press **+ New** on the CRM page and pick them. See [Add a customer by hand](/admin/help/customers/add-a-customer). It doesn’t get the new-lead follow-up messages.
- For a job that’s already sold or under way (an add-on battery, a callback): on their page, use **New project for Jane** in **⋯** or at the bottom of the left column (on a phone, the bottom of the **Details** tab). See [Start a project](/admin/help/projects/start-a-project).

If two of a customer’s jobs are really the same work, made twice by mistake, use **⋯ › Join this job with another of Jane’s jobs…**. See [Merge a customer who’s in twice](/admin/help/customers/merge-duplicates).
