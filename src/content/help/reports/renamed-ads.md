---
title: Renamed ads (Video 1 to a new name)
summary: How reports and leads follow a Meta ad that’s been renamed in Ads Manager, and how each lead is put with the right ad.
order: 50
keywords: renamed ad, rename, Video 1, Video 2, Video 4, ad name changed, old ad name, was, Ads Manager, same name, duplicate ad name, which ad, lead matched to ad, campaign renamed
where: CRM › CRM reports
path: /admin/crm/reports
access: crm
---
Ads often start with a working name ("Video 1") and get renamed in Ads Manager later ("Tim Facts"). Each lead keeps the name its ad had when they came in, but once ad spend is connected the report follows the ad, not the name, so a rename doesn’t split or lose anything.

## What you see

- **CRM reports** lists each ad and campaign under the name it has in Ads Manager **now**, with the older name in small letters beneath: "was Video 1". Leads that came in under the old name are in the same row.
- **Enquiries**, the dashboard, search and the customer card on the job show the new name too, with "was Video 1" where there’s room. See [Lead sources and ad names](/admin/help/enquiries/lead-sources).

The app checks Meta’s ad names at most every 10 minutes when CRM reports loads. To see a rename straight away, press **Refresh from Meta** above the table.

## How each lead is put with its ad

The app tries these in order:

1. **The ad Meta said the lead came from.** New leads have it recorded as they arrive. For older leads, the app asks Meta after CRM reports loads, up to 50 leads at a time, for leads Meta still keeps (about 90 days).
2. **The ad’s name when the lead came in.** The lead goes with the ad that has that name now, or had it before. When an ad made before the lead came in has had the name, any ad made after it is passed over, so a name used again for a new ad doesn’t take the old leads.
3. **The website’s ad links**, which name the campaign and ad. The lead goes with that ad in that campaign, or with just the campaign (as **Website enquiries**).
4. **Otherwise** it goes under **Other Meta leads and spend**, with a note saying why.

## When more than one ad has had the name

Sometimes two ads have had the same name, and a lead only has that name. The app doesn’t guess:

- If none of those ads has a lead put with it for certain (by step 1, or by a website ad link naming that ad), the leads share one row with those ads and their spend, noted "2 ads with this name" (or "2 ads have been called “Video 1”").
- Otherwise each ad keeps its own row and spend, and these leads get a row of their own with no spend: "Leads that don’t say which ad: …".

If the ads are in different campaigns, the shared row goes under **Other Meta leads and spend**, so no campaign counts another’s spend.

> **Good to know:** Giving each new ad a name that hasn’t been used before keeps every lead’s ad clear, even for older leads that only have the ad’s name.

> **Once switched on:** Recording the exact ad each lead came from needs ad-spend.sql. Before it’s run, the app goes by the ad’s name only (steps 2 to 4), which copes with renames but can’t tell apart two ads that have had the same name. Following renames in the report also needs ad spend connected: see [Show ad spend in reports](/admin/help/admin/ad-spend).
