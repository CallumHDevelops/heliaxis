---
title: What needs switching on
summary: Which database file switches on each part of Projects, and what you see until it has been run.
order: 170
keywords: SQL, database file, Supabase, From Claude, Copy SQL, missing tab, not showing, crm-v3.sql, surveys.sql, purchase-orders.sql, site-commissioning.sql, handover.sql, sso.sql, theme.sql, set up
access: crm
---
Each part of Projects appears by itself once its database file has been run in Supabase (on the **From Claude** card, press **Copy SQL**). Until then the screens simply don’t show it, and nothing breaks. Articles that depend on one of these files have a “Once switched on” note.

| File | What it switches on | Until then |
|---|---|---|
| crm-v3.sql | Projects itself: the Projects page, the checklist, the install team, system details, paperwork and deadlines. | Projects says “Projects appear here once crm-v3.sql has been run”, and the Overview says the same about the checklist. |
| surveys.sql | Surveys on a job: the **Surveys** tab and tile, **Start solar survey**, and the main cut-out and meter photos under **For the ENA application** in Paperwork ([Paperwork and deadlines](/admin/help/projects/paperwork-and-deadlines)). | No Surveys tab or tile, and no ENA photos. |
| purchase-orders.sql | **Purchase orders** in the Finance menu, the **Purchase orders** button on Projects, a job’s **Orders** tab and its **Purchase orders** tile. | None of these are there. |
| site-commissioning.sql (after purchase-orders.sql and portal-v2.sql) | The **Site** tab, **Who’s doing the work (optional)** on New project, the site app for trades, sign-offs, labour POs and your review, the Docs types **Commissioning**, **Certificate** and **Purchase order**, and a subcontractor’s **Site contacts**. | No Site tab, and New project has no trades block. |
| handover.sql (after site-commissioning.sql) | The **Handover** tab and the **Handover pack** card on Overview, the handover options on Docs uploads, the customer’s handover pack in their portal, and **CRM settings › Handover pack** and **Product library**. | No Handover tab or card. |
| sso.sql | One-tap sign-in to RAMS. It also needs the RAMS keys set in Vercel. | RAMS asks you to sign in. Without the keys, it opens at RAMS’s own sign-in. With the keys but not the file, you get **Open RAMS without signing in**, where asking for a code says sso.sql needs running; use **open RAMS and sign in as usual** on that page. |
| theme.sql | Your Light or Dark choice is kept on your account. | It’s kept on this device only. |

> **Watch out:** The Handover tab needs **both** site-commissioning.sql and handover.sql. Run the files in the order shown.

How to run a file is in [Switch a feature on (run a database file)](/admin/help/admin/run-a-database-file), and every file is listed in [What each database file switches on](/admin/help/admin/database-files).
