---
title: Show ad spend in reports
summary: Give CRM reports read-only access to the Meta ad account, so it can show cost per lead and per sale for each ad.
order: 210
keywords: ad spend, Meta ads, cost per lead, cost per sale, return on ad spend, ad account, ads_read, system user, Ads Manager, reports, ad-spend.sql, Refresh from Meta
where: Dashboard › From Claude › Show ad spend in your reports
access: admin
---
> **Admins only:** This is an optional setup job on the **From Claude** card.

**CRM reports** can put each Meta campaign’s and ad’s spend beside the leads, surveys and sales it brought in. To do that it needs read-only access to your Meta ad account. Until then, Reports says "To see what each Meta campaign and ad costs per lead, survey and sale here, connect your ad account" (admins only see that line).

How to read the report itself is in the reports articles, starting with [The CRM reports page](/admin/help/reports/crm-reports-page).

## Set it up

Open **Show ad spend in your reports (cost per lead and per sale)** on the From Claude card. It’s one of the optional jobs: if you can’t see it, tap the button that shows how many there are, for example **+ 3 optional**. Its steps:

1. In Meta **Business settings**, go to **Users › System users** and pick your system user (or **Add** one, with the Admin role).
2. **Add assets › Ad accounts**, pick your ad account and give it **View performance**.
3. **Generate new token**, choose your app, tick **ads_read**, and copy the token.
4. In Ads Manager, copy your ad account number (it starts `act_`).
5. Add both as keys in Vercel, using the names in the job, and redeploy. See [The Vercel keys page](/admin/help/admin/vercel-keys).

The **Ad spend in reports** group on the Vercel keys page then shows a **✓** beside each key. Open **CRM reports**: the figures at the top now include **Ad spend on Meta** and **Cost per lead**. If they don’t, or Reports shows a warning about Meta, see [When ad spend isn’t showing in reports](/admin/help/reports/set-up-ad-spend), which explains each warning and what to do.

## Also run ad-spend.sql

There’s a separate optional job, **Run ad-spend.sql in Supabase**. It records which Meta ad each new lead came from, using Meta’s own ad numbers, so the report still matches leads to the right ad when two ads share a name or one is renamed. Once it has been run, the app also fills in the ad for older leads that Meta still keeps (about 90 days), a batch at a time after CRM reports loads. Without it, leads are matched by ad name. See [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file).

> **Good to know:** To tell Meta which leads became customers (the other direction), see [Send sales back to Meta](/admin/help/admin/meta-conversions).
