---
title: Check the every-minute job is running
summary: Smart replies, chasers, reminders, follow-ups and email pick-up all run from one job in Supabase. How to check it, and switch it on if it isn’t.
order: 110
keywords: cron, scheduled job, pg_cron, every minute, automatic messages not sending, reminders not going, chasers not sending, smart replies not sending, emails not appearing, Send later not sending, whatsapp-outbox
where: Dashboard › From Claude › Check the every-minute job is switched on
access: admin
---
> **Admins only:** This is a one-off check, on the **From Claude** card as **Check the every-minute job is switched on**.

A lot of what Heliaxis does by itself runs from one job that Supabase starts every minute:

- WhatsApp smart replies, chasers and messages sent with **Send later**.
- Survey and install reminders, review requests and the follow-up sequence for new leads (see [Reminders and review requests](/admin/help/admin/reminders-and-reviews)).
- Follow-up and task reminders, and the "hasn’t been contacted" alert.
- Picking up customers’ emails from Microsoft 365, once it’s connected.
- Survey booking jobs and the Outlook copy of dates.

If none of these are happening, the job probably isn’t running. The app can’t check it for you, so it’s a job you tick yourself.

## Check it

1. Open the job on the **From Claude** card.
2. Press **Copy** next to **Check**.
3. Tap **Open Supabase ↗**, paste it into the editor and tap **Run**.
4. You should see a row called **whatsapp-outbox**, with `* * * * *` and **active** true. If so, tick the job. You’re done.

Once ticked, the job leaves the card for good, with its copy buttons. If you need to check again later, ask Claude for the check and run it the same way.

## If there are no rows

1. In Supabase, go to **Database › Extensions** and switch on **pg_cron** and **pg_net**.
2. Back on the job, press **Copy** next to **Switch on**.
3. Paste it into a new query in Supabase. Before running it, replace `YOUR_CRON_SECRET` with the value of the cron secret key in Vercel (**Settings › Environment Variables**).
4. Tap **Run**, then run the check again to confirm.

> **Good to know:** The subcontractor reminder emails don’t use this job. They run once a day from Vercel, early in the morning, and the Subcontractors page shows when they last ran: see [Automatic reminders to subcontractors](/admin/help/team/automatic-reminders). The site app’s background jobs (messages to trades held overnight, scaffold strike reminders) also run once a day from Vercel, and every 5 minutes as well if a second Supabase job, **heliaxis-site**, has been added. It shows in the same check. Ask Claude if you want it added.
