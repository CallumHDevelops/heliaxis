---
title: Send sales back to Meta (conversions)
summary: Tell Meta which leads booked a survey, got a quote or bought, so the ads find more people like them.
order: 200
keywords: Meta conversions, Conversions API, CAPI, pixel, dataset, Events Manager, Facebook ads, Instagram ads, ad optimisation, Schedule, Purchase, sending stages to Meta
where: Dashboard › From Claude › Send sales back to Meta Ads
access: admin
---
> **Admins only:** This is an optional setup job on the **From Claude** card.

Meta’s ads work better when Meta knows which leads turned into real customers. Once this is connected, the CRM tells Meta by itself when a job moves on:

| When a job reaches | Meta is told |
| --- | --- |
| **Survey booked** | A booked appointment (Schedule) |
| **Quote sent** | An application (SubmitApplication) |
| **Won** (or any later stage) | A purchase, with the job’s value (Purchase) |

Each is sent once per job. Meta matches it to the person using details such as their email, WhatsApp number or Meta lead, so a job with none of those isn’t sent. What’s sent, and how each job is matched, is in [Meta conversions: sending sales back to Meta](/admin/help/reports/meta-conversions).

## Set it up

Open **Send sales back to Meta Ads** on the From Claude card. It’s one of the optional jobs: if you can’t see it, tap the button that shows how many there are, for example **+ 3 optional**. Its steps:

1. Open **Events Manager** (the job has an **Open Events Manager ↗** button), pick your Pixel or dataset and copy its **ID**.
2. In the same dataset, go to **Settings › Conversions API › Generate access token** and copy it.
3. Add both as keys in Vercel, using the names in the job, and redeploy. See [The Vercel keys page](/admin/help/admin/vercel-keys).

## Check it’s working

- **CRM › CRM settings › Connections** says **Meta conversions** "sending stages to Meta".
- The **Meta Ads conversions** group on the Vercel keys page has two **✓**.

Stage changes made before it was connected aren’t sent afterwards. A job that moves to a new stage from then on is.

> **Once switched on:** Sending needs crm-v2.sql too, so the app can remember which events each job has already sent. See [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file).

To see what each Meta ad costs per lead and per sale in **CRM reports**, connect your ad account too: see [Show ad spend in reports](/admin/help/admin/ad-spend).
