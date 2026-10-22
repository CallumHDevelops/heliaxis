---
title: Switch a feature on (run a database file)
summary: Copy a database file from a From Claude setup job, paste it into Supabase and press Run.
order: 70
keywords: SQL, run SQL, Copy SQL, View SQL, Supabase, SQL editor, database, migration, switch on, Success. No rows returned, .sql file
where: Dashboard › From Claude › a "Run … in Supabase" job
access: admin
---
> **Admins only:** Database jobs show on the **From Claude** card for admins, or for someone an admin has passed the job to.

Many features stay hidden until a database file has been run in Supabase, where Heliaxis keeps its data. Most show on the **From Claude** card as "Run *file name* in Supabase", with a line saying what it switches on. A few have their own title, such as **Give every customer a reference** (customer-refs.sql).

## Run it

1. On the dashboard, tap the job in **From Claude** to open its steps.
2. If it says "Do this after **…** (it builds on it)", do that file first.
3. Tap **Copy SQL**. The button says **Copied ✓**.
4. Tap **Open Supabase ↗**. It opens a new query in the Heliaxis database. Sign in if it asks.
5. Tap in the big editor box and paste (Ctrl+V on a computer, or long-press › **Paste** on a phone).
6. Tap **Run** (bottom right). You should see **Success. No rows returned**.
7. Come back to Heliaxis and refresh the page. The job disappears once it has worked.

Two optional jobs, **Speed up Latest notes on the CRM home** and **Speed up WhatsApp in Latest notes**, can’t be checked by the app. Tick them yourself (**✓ I’ve done this**) once you’ve run them.

Every file is safe to run twice. If you’re not sure it worked, run it again.

> **Good to know:** **View SQL** opens the file on a page of its own, with its name at the top, a **Copy SQL** button and the whole file underneath. It’s handy on a computer if you’d rather read it first.

## If something goes wrong

- **Copy SQL** says **Couldn’t copy**: open **View SQL** and use the **Copy SQL** button there, or select the text and copy it.
- Supabase says "Run … first, then this file.": that file builds on another one. Run the one it names first (it’s on the card too), then this one again.
- Supabase shows another error instead of **Success**: make sure the whole file was pasted, from the first line to the last, and that you’re in the Heliaxis project (not RAMS or the social studio). Then run it again. If it still fails, send Claude a screenshot.
- The job is still there after a refresh: the file didn’t finish. Check Supabase said **Success. No rows returned**, then run it again. Some features need several files: once one job goes, the next one for that feature shows on the card, so work down them in order.

## Files that aren’t on the card

A few older files aren’t in the app to copy: user-portals.sql (access ticks on Users), subcontractors.sql and reminders.sql (Subcontractors and its daily reminders), tasks.sql, ntp.sql, portal-v2.sql, portal-v3.sql, portal-v4.sql, rams-sync.sql, heatmap_clicks.sql and schema.sql. They were run when those parts were first set up. If a page says one of them is needed, ask Claude for it.

See [What each database file switches on](/admin/help/admin/database-files) for the full list.

<!-- shot: admin/sql-page.jpg | View SQL: the file’s name, Copy SQL, and the file itself | A database file’s own page, with its name and the Copy SQL button -->
