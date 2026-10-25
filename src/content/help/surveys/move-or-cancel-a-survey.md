---
title: Move or cancel a booked survey
summary: Give a booked survey a new time with Find a time, or take the date off the job to cancel it.
order: 25
keywords: move survey, rebook, reschedule, change survey date, cancel survey, survey date removed, customer can’t make it, postpone survey
where: CRM › Surveys and diary › Find a time
path: /admin/surveys
access: crm
---
Customers can move or cancel their own survey on their booking link (see [What the customer sees when they book](/admin/help/surveys/customer-booking-page)). When they ring or message you instead, do it from the job.

## Move it to a new time

1. Open the customer’s job and tap **Find a time** (under the survey date, or the main button while the job is at **Survey booked**).
2. The sheet says "Booking a new time moves their survey from …". Their current time doesn’t count as busy, so times around it are offered too.
3. Tap a time, then **Book it: …**.

The survey moves to the new time, the Outlook copy follows once Microsoft 365 is connected, and the app sends the customer a confirmation of the new time by itself. Their booking link still lets them change it online (until 24 hours before, unless an admin has changed that). See [Book a survey with Find a time](/admin/help/surveys/find-a-time).

> **Watch out:** You can also type a new time into **Date and time** on the job and press **Save dates**, but then the customer can’t change it on their link: it tells them to call. Find a time keeps the online booking working.

## Cancel it

1. Open the customer’s job.
2. On the Overview, in **Dates and team**, clear the survey’s **Date and time**.
3. Press **Save dates**.

The timeline says "Survey date removed", the job keeps its stage, and the time is freed in the Diary within a few minutes. Once Microsoft 365 is connected, the copy in Outlook is removed. While the job is at **Lead**, **Contacted** or **Survey booked** and online booking is on, the customer’s booking link lets them pick a new time.

> **Watch out:** The app doesn’t message the customer when you clear the date. Tell them yourself, and set a next step if you need to rebook.

Clearing the date doesn’t take the survey off **Surveys** › **To do** if it’s already there. The app puts it there once someone has started it, or once anyone with the app opened it with signal when the survey was today or tomorrow (so phones have it offline). It then stays under **Not dated**: open it and use **⋯** › **Cancel this survey** as well. See [Finish a survey](/admin/help/surveys/finish-a-survey).

For the rest of the dates on the job, see [Dates and team](/admin/help/projects/dates-and-team).

> **Once switched on:** Find a time needs survey-booking.sql to have been run.
