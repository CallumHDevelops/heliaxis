---
title: The Overview tab and its checklist
summary: The Everything for this job tiles, the Handover pack card, and the stage checklist that ticks itself.
order: 80
keywords: Overview, tiles, everything for this job, checklist, key items, from the app, not needed, move to, handover pack card, quote and contract
where: Operations › Projects › a job › Overview
access: crm
---
A project opens on its **Overview**. It has the tiles, the stage checklist, then [Dates and team](/admin/help/projects/dates-and-team), [System details](/admin/help/projects/system-details) and [Paperwork](/admin/help/projects/paperwork-and-deadlines).

## Everything for this job

The tiles are:

- **Quote and contract**: who signed and when, and the deposit.
- **Designs**.
- **Photos**: a chip per category.
- **Documents**.
- **Surveys**.
- **Purchase orders**: for example “Kit ordered £5,200.00 ex VAT · 1 open · 1 draft”.
- **Customer**.
- **Tasks and messages**.

Tap a tile to open its tab, or press **+ Add** to add straight to it.

Below the tiles, from Ready to book, the **Handover pack** card shows how many items are complete and the next thing to do. Tap it to open the Handover tab ([The Handover tab](/admin/help/handover/the-handover-tab)).

> **Once switched on:** The **Handover pack** card appears once handover.sql has been run (after site-commissioning.sql).

## The checklist

1. The card is titled with the stage, such as “Install booked: checklist”, with a count like “2 of 3 done”. The delivery stages run along the top.
2. Items marked **✓ from the app** tick themselves: signed quote, deposit paid, install date, scaffold dates, photos, trades sent their job pack, EIC date, MCS number and so on. Tick the rest yourself, or press **Not needed**.
3. Key items matter most. **Move to Installing →** is always there. With key items missing it reads **Move to Installing anyway: 1 key item not done** and asks once.

![The Install booked checklist with two items ticked from the app and Move to Installing.](/help/projects/s08a-checklist.jpg "The stage checklist: items ticked “from the app”, Not needed, and Move to Installing.")

Every stage’s items are listed in [Checklist items by stage](/admin/help/projects/checklist-items).

> **Once switched on:** The checklist needs crm-v3.sql. Until it has been run, the Overview says so in place of the checklist.
