---
title: Automatic reminders to subcontractors
summary: The daily email that chases each firm for anything outstanding, how to pause it or send it now, and how to tell it’s running.
order: 80
keywords: reminders, chase, chasers, daily email, digest, expiry reminder, insurance expiring, pause reminders, resume reminders, send reminder now, reminders not running, Automatic reminders last ran
where: Team › Subcontractors › a firm › Reminders
access: subcontractors
---
Every morning, each firm with a chase newly due gets one email from the app, listing everything they still need to do:

- finishing onboarding (details and signing the agreement),
- documents that are missing, rejected, expiring or expired,
- documents you’ve asked for,
- crews to choose for jobs booked in RAMS,
- NTP agreements to sign.

Each chase goes once, on a set day (for example day 3, 7 and 14 after an invite), so nobody gets the same nudge every day. Expiring documents are chased 30, 14 and 7 days before they run out. Terminated firms are never chased. Suspended firms still are.

The office also gets a daily summary email, "Subcontractors: … need you", when something needs Heliaxis: an agreement or NTP agreement waiting to be countersigned, a firm that still hasn’t finished onboarding 21 days after being invited, an expired document, a crew not chosen the day before a job starts, or a requested document that’s overdue. Firms with reminders paused still appear in it. See [Emails the office gets about subcontractors](/admin/help/team/office-emails).

## On a firm’s page

The **Reminders** card shows whether reminders are **On** or **Paused**, and what they’d be chased for today. It only appears when something is outstanding, or reminders are paused.

- **Send reminder now** emails them the list straight away. It says "Reminder emailed."
- **Pause automatic reminders** stops the daily emails for this firm, for example while you sort something out with them by phone. **Resume automatic reminders** starts them again.

The **Pause reminders** / **Resume reminders** button at the top of the page does the same.

## Is it running?

The top of **Team › Subcontractors** says when reminders last ran:

| It says | What to do |
| --- | --- |
| "Automatic reminders last ran … — 3 reminder emails sent." | Nothing. It’s working. |
| "… with an error: …" | It ran but something failed. Tell Claude what it says. |
| "Automatic reminders haven’t run since …" or "haven’t run yet" | The daily job has stopped. The page asks you to check the cron secret key is set in Vercel (**Settings › Environment Variables**) and redeploy. See [The Vercel keys page](/admin/help/admin/vercel-keys). |
| "Automatic reminders need setting up: run supabase/reminders.sql in Supabase." | Reminders have never been switched on. reminders.sql isn’t on the From Claude card: ask Claude for it. |

> **Good to know:** These reminders run once a day from Vercel, separately from the CRM’s every-minute job.
