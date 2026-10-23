---
title: Lead sources and ad names
summary: What each lead source means, how the Meta ad a lead came from shows by its name now, and why some website leads don’t show their ad.
order: 70
keywords: source, lead source, where did they come from, Meta ad, Facebook ad, Instagram ad, ad name, Video 1, renamed ad, organic, Ad not known, WhatsApp ad, Google ad, cookie banner, cookies, attribution, tracking, campaign
where: CRM › Enquiries
path: /admin/enquiries
access: enquiries
---
Every lead remembers how it reached you. The app shows it in plain words: on **Source** and the "via …" line when you press **View** on Enquiries, on the customer card on their job, in search, and on the dashboard’s New Meta leads card. Meta leads also carry a small **Meta** tag under their name on Enquiries, with the ad they came from.

## What each source means

| Shows as | Tag under the name | Where they came from | From button |
| --- | --- | --- | --- |
| **Meta ad · Video 4** | Video 4 | A Facebook or Instagram lead form on the ad called Video 4 | **Meta** |
| **Meta ad** | Ad not known | A Meta lead form where Meta didn’t say which ad | **Meta** |
| **Meta (organic)** | Organic | A Meta lead form that wasn’t on an ad (a shared post, say) | **Meta** |
| **Meta ad (website) · Solar Oct / Video 4** | Website · Solar Oct / Video 4 | Clicked a Meta ad to the website, then filled in a form there. The words after the dot are the campaign and ad from the ad’s link | **Meta** |
| **Meta ad (website)** | Website ad link | As above, when the link didn’t say which campaign | **Meta** |
| **Meta ad (WhatsApp)** | WhatsApp ad | Started a WhatsApp chat from a Meta ad. Once the ad’s name is known it’s added: "WhatsApp ad · Tim Facts" | **Meta** |
| **Website** | | One of the website’s forms | **Website** |
| **Website booking** | | Booked a survey on the website | **Website** |
| **Google ad · Brand** | | Clicked a Google ad, then filled in a website form | **Website** |
| **WhatsApp** | | Messaged the business number | **WhatsApp** |
| **WhatsApp (imported)** | | A chat brought in with Import | **WhatsApp** |
| **Added by staff** | | Added by someone on the team in the CRM | **Other** |
| Anything else, such as **Newsletter · October** | | A website visit from a tagged link that isn’t an ad | **Other** |

## Ad names follow renames

Ads are often renamed in Ads Manager after they start ("Video 1" becomes "Tim Facts"). Each lead keeps the name its ad had when they came in, but the app shows the name the ad has **now**:

- On Enquiries, the tag shows the new name. Point at it on a computer to see the old one.
- In the lead’s details, **Source** shows the new name with the old one beneath: "was Video 1".
- If two ads have had the same name, both names show, for example "Tim Facts / Valley Vets", with a note that 2 ads have had this name.

The app learns an ad’s new name in two ways: from any new lead that comes in from the renamed ad, and, once ad spend is connected, from Meta whenever CRM reports loads (it checks the names at most every 10 minutes). So if ad spend is connected and a lead still shows an old name, open **CRM reports** (you need CRM access) and press **Refresh from Meta**. See [Renamed ads](/admin/help/reports/renamed-ads).

> **Good to know:** Renaming only changes what’s shown: each lead still keeps the name its ad had when they came in. Once ad spend is connected, CRM reports puts each lead with the right ad whatever it’s called now. Before that, the report’s **By source** table goes by the name each lead came in with, so a renamed ad’s leads can be split over two rows. See [Sources in the report](/admin/help/reports/sources).

## Why a website lead doesn’t show its ad

A website visitor is only labelled with the ad that brought them if they pressed **Accept** on the website’s cookie banner. If they pressed **Reject**, or filled in the form without choosing, their enquiry shows as **Website** (or **Website booking**) even if they came from an ad. Once they’ve accepted, the ad is remembered for 60 days, so a visitor who comes back later on the same device and fills in a form is still labelled with it.

Lead forms on Facebook and Instagram, and WhatsApp chats, don’t depend on the cookie banner.

> **Once switched on:** Recording the exact Meta ad each new lead came from (so renamed ads and ads that share a name are told apart) needs ad-spend.sql. Before it’s run, the app goes by the ad’s name.
