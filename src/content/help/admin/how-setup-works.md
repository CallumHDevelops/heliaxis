---
title: How setup works
summary: New features arrive switched off; the From Claude card lists what each needs (a database file, a key in Vercel or a setting) and clears itself once it’s done.
order: 60
keywords: setup, switch on, turn on, new feature, not showing, missing feature, From Claude, SQL, Supabase, Vercel, keys, environment variables, guide, setup guide, to-do
where: Dashboard › From Claude
access: admin
---
> **Admins only:** Admins see every setup job. Anyone else only sees the ones an admin has passed to them.

When Claude adds a feature that needs something from you before it can work, it leaves a setup job on the **From Claude** card on the dashboard (and at the top of Tasks). Until then, the feature simply stays hidden or says it isn’t connected, and nothing else breaks.

Most setup jobs are one of three kinds. A few are tagged **Question for you** (Claude needs an answer) or **Recommended** (a tip); those are explained in [From Claude setup to-dos](/admin/help/dashboard/from-claude).

| Kind | What you do | Where to read more |
| --- | --- | --- |
| A database file | Copy it and run it in Supabase, the database. | [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file) |
| A key | Copy a value from another service (Microsoft, Stripe, Meta…) into Vercel, where the app is hosted, then redeploy. | [The Vercel keys page](/admin/help/admin/vercel-keys) |
| A choice or setting | Fill something in, usually on **CRM settings** or the survey booking settings. | [CRM settings](/admin/help/admin/crm-settings) |

How to open a job, tick it off, answer a question and pass it to someone else is in [From Claude setup to-dos](/admin/help/dashboard/from-claude).

## Buttons you’ll see on a setup job

- **Copy SQL** and **View SQL**: copy the database file, or open it on its own page to read it.
- **Open Supabase ↗**, **Open Vercel ↗**, **Open Stripe ↗** and so on: open the other service in a new tab.
- **Open the guide**: a longer setup guide, shown inside Heliaxis. There are two: **WhatsApp & Meta Lead Ads setup** and **CRM setup**.
- **Generate keys**: only on the phone-notification job, and only for admins.

## It clears itself

The app checks each job every time the dashboard loads. A job disappears once the app can see it working: the database file has been run, or the key is in Vercel. A few jobs the app can’t check go as soon as you tick them.

If you’ve ticked one and it’s still there, it says **Ticked. Waiting to confirm**. For a key, the redeploy has to finish first. If it’s still there after that, check the key’s name matches exactly on the [Vercel keys page](/admin/help/admin/vercel-keys).

## Who can open what

- The SQL and guide pages open for anyone with an approved account, so a member you pass a job to can follow it.
- The **Check Vercel keys →** page, the WhatsApp connection check and **Generate keys** are for admins only.

For the list of database files and what each one switches on, see [What each database file switches on](/admin/help/admin/database-files).
