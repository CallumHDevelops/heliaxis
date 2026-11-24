---
title: The Vercel keys page
summary: See which keys the live app has in Vercel, group by group, and how to add one and redeploy.
order: 90
keywords: Vercel, environment variables, env, keys, secrets, API key, missing key, Check Vercel keys, redeploy, Sensitive, settings, configuration, not connected
where: Dashboard › From Claude › Check Vercel keys →
path: /admin/setup/env
access: admin
---
> **Admins only:** Only admins can open this page.

Heliaxis is hosted on Vercel. The passwords and settings it uses to talk to other services (Microsoft 365, WhatsApp, Stripe, Meta and so on) are kept there as "keys". This page shows which ones the live app can see. It never shows their values.

## Open it

On the dashboard, in the **From Claude** card, press **Check Vercel keys →**.

The **From Claude** card only shows while there are setup jobs left. If it has gone, go straight to the page’s address, /admin/setup/env. When **WhatsApp templates** says "Heliaxis can’t see your templates yet.", admins usually also get a **Check the WhatsApp connection →** link there that opens this page.

The heading says how many essential keys are missing, or "All the essentials are in".

![The Vercel keys page with one group missing a key](/help/admin/vercel-keys.jpg "Check Vercel keys: a tick or cross per group and per key")

## Reading the page

The keys are grouped by what they’re for. Each group has a mark:

- **✓**: everything it needs is there.
- **✗**: something it needs is missing.
- **○**: the whole group is optional.

Under each group, every key has its own mark: **✓** set, **✗** missing, or **–** optional and not set. Each says **Secret** or **Setting**. A missing one also says where to find its value.

| Group | What it’s for |
| --- | --- |
| **Core** | The app and database. Already working if you can see the page. |
| **Metis (Claude)** | The assistant. |
| **Phone notifications** | Notifications to phones and browsers. |
| **Answers for Claude** | Optional. Lets the answer boxes on Claude’s questions reach Claude. |
| **One-tap sign-in to RAMS** | Optional. Opens RAMS already signed in. |
| **One-tap sign-in to the social studio** | Optional. Opens the social studio already signed in. |
| **Android app notifications** | Proper notifications in the Android app. |
| **WhatsApp** | The WhatsApp inbox, smart replies, chasers and reminders. |
| **Microsoft 365 email** | Sending from hello@ in the CRM and picking up replies. |
| **Survey booking** | Optional. Google drive times, and a bot check on the website booking form. |
| **Website emails** | Quote-form confirmations, sign-in emails and alerts. |
| **Card deposits (Stripe)** | Optional. Customers paying their deposit by card. |
| **Meta Ads conversions** | Optional. Tells Meta when leads book a survey, get a quote or buy. |
| **Ad spend in reports** | Optional. Cost per lead and per sale in Reports. |
| **AI blog writer** | Optional. The CMS’s AI blog and page writer. |

The **WhatsApp** group also has a live check with Meta: see [Check the WhatsApp connection](/admin/help/admin/whatsapp-connection).

## Add a key in Vercel

The From Claude job for each feature gives you the key’s exact name, with a copy button beside it. Then:

1. Open Vercel, sign in and tap the **heliaxis** project.
2. Tap **Settings** (top menu), then **Environment Variables** (left menu).
3. Paste the name into **Key** and the value into **Value**. Leave all three environments ticked. If the page here says **Secret**, also switch on **Sensitive**.
4. Tap **Save**. Repeat for any other keys.
5. Redeploy so the app picks them up: **Deployments** (top menu), the **⋯** on the top deployment, **Redeploy**, then **Redeploy** again. It takes about a minute.

> **Good to know:** A key only shows as set here after the redeploy has finished. If it still shows **✗**, check the name in Vercel matches exactly, capitals included.
