---
title: Set up the handover pack (once)
summary: Set the workmanship warranty, inspection default, maintenance wording and approved drafts, and load manuals into the product library.
order: 10
keywords: handover settings, CRM settings, workmanship warranty, HX-HO-06, next inspection, maintenance plan, HX-HO-12, maintenance rows, wording to approve, cover letter, completion sign-off, shut-down procedure, product library, manuals, datasheets, gaps
where: CRM › CRM settings › Handover pack
path: /admin/crm/settings#handover
access: admin
---
The handover pack takes some of its words and numbers from settings you fill in once, and its product manuals from a library you build up once.

## Handover pack settings

On **CRM settings**, under **Handover pack**, set:

- **Workmanship warranty (HX-HO-06)**: the years, whether it starts **The day it’s switched on** or **The day the pack goes**, and its wording.
- The **Next inspection** default.
- **Maintenance plan (HX-HO-12)** wording.
- **Your maintenance rows**.
- **Wording to approve**: the cover letter, completion sign-off and shut-down procedure.

As the screen says: “Nothing here is filled in for you: until it’s set, that document isn’t made.”

> **Admins only:** Only admins can change these settings. Everyone else sees “Only admins can change these.” at the top of CRM settings.

## Product library

On **CRM settings › Product library**, upload a manual, datasheet, warranty or start-up and shutdown procedure once, with the models it’s for. Every job with that model gets it in its pack.

**Gaps on jobs still to be installed** lists models with nothing yet. On a job’s Handover tab, press **Add to the library** for a model that’s missing ([Who makes each handover document](/admin/help/handover/who-makes-each-document)).

> **Once switched on:** **CRM settings › Handover pack** and **Product library** need handover.sql, after site-commissioning.sql. See [What needs switching on](/admin/help/projects/what-needs-switching-on).
