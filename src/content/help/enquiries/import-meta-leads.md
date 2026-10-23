---
title: Import older Meta leads
summary: Bring Facebook and Instagram lead-form leads from before the CRM into Enquiries, straight from Meta or from a CSV download.
order: 90
keywords: import, Meta import, Facebook leads, Instagram leads, old leads, CSV, download leads, instant forms, lead forms, last 90 days, find lead forms, import selected, missing leads, backfill
where: CRM › Enquiries › Import
path: /admin/enquiries/import
access: admin
---
**Import** brings in people who filled in a Meta lead form before the CRM was connected, or any the CRM missed. They keep their original dates, and nobody is messaged or notified. Anyone already in the CRM is matched by phone or email rather than added twice, and anyone you’ve deleted from the CRM is skipped.

> **Admins only:** Only admins see the **Import** button on Enquiries and can open the page.

Meta only hands over the last 90 days of leads. Bring those in first, then add anything older from a CSV.

![The Import page after Find lead forms](/help/enquiries/import-meta.jpg "Each Facebook Page with its live leads and lead forms")

## The last 90 days, straight from Meta

1. On **Enquiries**, press **Import**.
2. Under **Last 90 days, straight from Meta**, press **Find lead forms**. It says **Looking…** while it asks Meta.
3. Each Facebook Page is listed with its lead forms, all ticked. Each form shows how many leads it has in total and when it was made. The button now says **Look again**, for asking Meta afresh.
4. Untick any forms you don’t want.
5. Press **Import selected (3)**. The number is how many forms are ticked.
6. Wait. Each form shows its progress, then **Done**. Stay on the page until it finishes: the browser asks before you leave.

The lead totals include leads older than 90 days, which Meta won’t hand over, so fewer may come in than the total says.

Each Page also shows **Live leads: On ✓**, **Live leads: Off** or **Live leads: couldn’t check**. Unless it’s on, press **Switch on live leads** so new leads arrive by themselves. See [Meta lead ads coming in](/admin/help/enquiries/meta-lead-ads).

## Older leads, from a CSV download

1. In Meta Business Suite, go to **All tools → Instant forms** (or open the form in Ads Manager).
2. Choose the form, then **Download**, and pick CSV, with the date range set to cover everything.
3. Under **Older leads, from a CSV download**, press **Choose a file** and pick the file.
4. Check the preview: how many leads, how many have a phone number and an email, the dates, and the first few names. Nothing is added yet.
5. Press **Import 214 leads**. The number is how many leads are in the file. It counts up as it goes ("Importing… 100 of 214").

The file must be under 20 MB. If yours is bigger, download one form at a time.

## What the results mean

| Result | What happened |
| --- | --- |
| **added** | A new lead on Enquiries, with an opportunity at Lead, dated when they filled in the form |
| **matched to someone already in the CRM** | They were already in, so a line went on their timeline instead: "Also filled in Meta lead form …" |
| **already imported** | Brought in before. Nothing changed |
| **left out** | Test leads from Meta’s testing tool, and leads from the last hour (they arrive by themselves) |
| **deleted before, skipped** | People you deleted from the CRM. If one sends a new lead or WhatsApp, it still comes in as normal |
| **failed** | Couldn’t be added. The first few reasons are listed |

Importing again is always safe: anyone already brought in is skipped. If an import stops halfway, run it again.

## What imported leads get, and don’t get

- They’re at **New** on Enquiries, with the ad they came from as their source.
- No notifications, no WhatsApp intro, no follow-up messages and no "hasn’t been contacted" alert, and they aren’t shared out on the rota.
- WhatsApp permission only if their own answer on the form said yes.

> **Once switched on:** Import needs crm.sql and then crm-v2.sql. Until both have been run, the page says so instead of importing.

> **Good to know:** The same page has **WhatsApp Business app chats**, for bringing in chats from the phone app. See [Import WhatsApp Business app chats](/admin/help/whatsapp/import-chats).
