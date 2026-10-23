---
title: A job’s tabs, and when each appears
summary: What the Overview, Activity, Photos, Docs, Orders, Site, Handover, Surveys and Details tabs show, and when each is there.
order: 70
keywords: tabs, Overview, Activity, Photos, Docs, Orders, Site, Handover, Surveys, Details, missing tab, link to a tab
where: Operations › Projects › a job
path: /admin/projects/[id]
access: crm
---
Every job has the same set of tabs, but some only appear from a certain stage, or once a part of Projects has been switched on.

| Tab | Shows | When it’s there |
|---|---|---|
| **Overview** | Everything for the job: checklist, dates and team, system, paperwork | Always. Projects open on it. |
| **Activity** | Notes, calls, WhatsApp, emails, stage changes, trade sign-offs | Always |
| **Photos** | Survey, Site, Progress, Snags, Completion, Other | Always |
| **Docs** | Every document on the job | Always |
| **Orders** | This job’s purchase orders | From Won, once purchase-orders.sql is run |
| **Site** | The trades on the job | From Won, once site-commissioning.sql is run |
| **Handover** | The customer’s handover pack | From Ready to book, once handover.sql is run |
| **Surveys** | Each survey, its status and red flags | Once surveys.sql is run |
| **Details** | The customer column | Phones and tablets only |

> **Once switched on:** Orders needs purchase-orders.sql, Site needs site-commissioning.sql, Handover needs handover.sql (as well as site-commissioning.sql), and Surveys needs surveys.sql. See [What needs switching on](/admin/help/projects/what-needs-switching-on).

> **Good to know:** The tab you’re on is in the page’s address (for example ?tab=site), so a copied link opens the same tab.

## Where to read more

- Overview: [The Overview tab and its checklist](/admin/help/projects/overview), [Dates and team](/admin/help/projects/dates-and-team), [System details and design details](/admin/help/projects/system-details) and [Paperwork and deadlines](/admin/help/projects/paperwork-and-deadlines).
- Docs, Photos and Surveys: [Documents, photos and surveys on a job](/admin/help/projects/documents-photos-surveys).
- Orders: [Order kit for a job](/admin/help/purchase-orders/order-kit).
- Site: [Add a trade to a job](/admin/help/site/add-a-trade).
- Handover: [The Handover tab](/admin/help/handover/the-handover-tab).
