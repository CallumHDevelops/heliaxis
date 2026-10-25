---
title: Outlook and the Microsoft 365 calendar
summary: How the Diary reads each surveyor’s Outlook, copies surveys, installs and diary entries into it, and what to do when a copy is moved.
order: 70
keywords: Outlook, Microsoft 365, calendar sync, MS365, copy to Outlook, moved in Outlook, busy, free, away, private, tentative, backfill, install calendar
where: CRM › Surveys and diary
path: /admin/surveys
access: crm
---
Once Microsoft 365 is connected (an admin sets this up), the Diary works with Outlook both ways. Until then, the Diary only knows the CRM and what you add to it, and every online booking comes to you as a request.

## What the Diary reads from Outlook

Each surveyor’s Outlook counts as busy in the Diary, in Find a time and on the customer’s booking page.

- Appointments show as **(Outlook)** in the Diary. Depending on the booking settings, you see their subjects or just "Busy". Private ones always say "Private".
- An all-day appointment marked **Free** doesn’t block the day. Mark holidays and days off as **Away**.
- An appointment with no location is treated as being at home, with extra time either side. Add a postcode to it in Outlook so the drive can be worked out.
- The Diary works from a copy of Outlook that’s a few minutes old at most. Tap **Refresh (read Outlook again)** to read it now.
- Tentative appointments count as busy or not depending on the booking settings.

## What the app copies into Outlook

Survey dates, installs and your diary entries are copied into Outlook by themselves when they’re set or changed:

- **Surveys** go into the surveyor’s calendar as "Survey: name (postcode) · type", with the customer’s phone and email, what they’re interested in, how it was booked and a link to the job. A job with no solar, battery or heat pump goes in as "Home visit: name (postcode)".
- **Installs** go into the install calendar as "Install: name (postcode) · products", with the team and scaffold dates.
- **Diary entries** go in with what they are and their title, for example "Site visit: Roof check for Jones".

Changing or removing the date changes or removes the copy. Past appointments are left alone in Outlook.

## Copy these dates into Outlook

Dates set before Outlook was connected aren’t copied automatically. Instead, the Diary shows a one-off card: "Copy these … upcoming dates into Outlook".

1. Tap **Show the list**.
2. Untick any you’ve already put in Outlook by hand.
3. Tap **Copy …** (or **Don’t copy any** if you untick them all). **Not now** closes it.

They appear in Outlook within a few minutes. The unticked ones are never copied, unless their date changes later.

## When a copy is moved in Outlook

If someone drags one of the app’s copies to another time in Outlook, the Diary shows "Moved in Outlook to …" under it. Both times count as busy until you choose:

- **Use Outlook’s time**: changes the job’s survey date (or your diary entry) to match Outlook.
- **Put it back**: Outlook is changed back to the CRM’s time within a minute or two.

## Checking the connection

On the booking settings page, **Connections** says whether Outlook is connected, and **Test calendar** checks the app can read each surveyor’s calendar and the install calendar. See [Survey booking settings](/admin/help/surveys/booking-settings).

> **Admins only:** A new surveyor’s mailbox has to be added to the app’s Microsoft 365 access as well as to the booking settings. **Test calendar** tells you if it’s missing. Connecting Microsoft 365 is in [Connect Microsoft 365 (shared mailbox and Outlook)](/admin/help/admin/microsoft-365).
