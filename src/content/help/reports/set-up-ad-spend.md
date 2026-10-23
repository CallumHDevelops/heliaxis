---
title: When ad spend isn’t showing in reports
summary: Why CRM reports has no spend or cost per lead, how it gets switched on, and what its warnings mean.
order: 60
keywords: ad spend missing, no spend, cost per lead not showing, connect ad account, Meta ad account, ad spend error, Meta’s figures aren’t available, Meta didn’t send new figures, token expired, ad-spend.sql, ad spend not showing
where: CRM › CRM reports
path: /admin/crm/reports
access: crm
---
If CRM reports shows leads, surveys and sales by source but no **Spend**, **Cost per lead** or **Ad spend on Meta**, your Meta ad account isn’t connected yet, or Meta isn’t answering just now.

## Not connected yet

Admins see this line above the table: "To see what each Meta campaign and ad costs per lead, survey and sale here, connect your ad account: see “Show ad spend in your reports” under From Claude on Tasks." Everyone else just sees the table without spend.

> **Admins only:** Connecting the ad account is the **Show ad spend in your reports (cost per lead and per sale)** to-do in From Claude. It gives the app read-only access to your ad figures: it can’t change ads or spend money. The steps are in [Show ad spend in reports](/admin/help/admin/ad-spend).

Once it’s connected, the figures at the top include **Ad spend on Meta** and **Cost per lead**, and **By source and ad campaign** shows each campaign and ad with its spend. See [Meta ad spend and cost per lead in the report](/admin/help/reports/meta-ad-spend).

> **Once switched on:** ad-spend.sql records the exact Meta ad each new lead came from, so each ad’s spend sits beside its own leads and sales, even when two ads share a name or one is renamed. After it has been run, the app also fills in the ad for older leads, a batch at a time after CRM reports loads, for leads Meta still keeps (about 90 days). Without it, leads are matched to ads by name.

## Warnings you might see

| What it says | What it means |
| --- | --- |
| "Meta didn’t send new figures just now, so these are the last ones it gave." | Meta didn’t answer. The figures shown are its last ones. They update by themselves |
| "Ad spend: Meta’s figures aren’t available just now." | No figures could be loaded. The rest of the report is as normal. Try again later, or tell an admin if it lasts |
| "Meta was asked less than a minute ago, so these are its latest." | **Refresh from Meta** was pressed less than a minute ago (by you or someone else). The figures are already the latest |
| "Meta was busy a moment ago, so the CRM is giving it a few minutes. These are the last figures it gave." | Meta didn’t answer a moment ago, so the app is leaving it alone for a few minutes. Try again later |

> **Admins only:** Admins see the reason and what to do instead of the general warning. The common ones:
> - "Meta didn’t accept the ad spend key …": the token has expired or been removed. Make a new one with **ads_read** and put it in Vercel.
> - "Meta can’t find ad account …": the ad account number is wrong, or the system user hasn’t been given that ad account.
> - "The ad spend key can’t read …": the system user needs the ad account with at least **View performance**.
> - "Meta is limiting how often the CRM can ask for ad figures …": nothing to do. The figures come back by themselves, usually within the hour.
